import { videoBitrateFor } from "../recorder/mime";
import { zoomAt } from "../zoom/camera";
import { patchWebmHead } from "../recorder/webm";
import { drawFrame, frameLayout, outputSize, type BackgroundImage, type ResolutionPreset } from "./layout";
import { usesCameraScene, type EditProject } from "./project";
import { clipDuration, clipSpeed, totalDuration } from "./timeline";
import { AudioTrackPlayer } from "./audio-tracks";

/**
 * Export pipeline v1: plays the edit once in real time, draws each frame with the
 * same renderer as the preview, and encodes canvas + audio with MediaRecorder.
 * Real progress, cancellable. Takes about as long as the edited video.
 * Browsers throttle hidden tabs, so export pauses while the tab is hidden.
 */

export type ExportFormat = "webm" | "mp4";

export type ExportStatus = "preparing" | "rendering" | "paused-hidden" | "finalizing";

export interface ExportProgress {
  status: ExportStatus;
  /** 0..1 of the edited duration. */
  fraction: number;
}

export interface ExportOptions {
  project: EditProject;
  screen: Blob;
  camera: Blob | null;
  hasAudio: boolean;
  format: ExportFormat;
  resolution: ResolutionPreset;
  fps?: number;
  /** Uploaded background image, if the project uses one. */
  backgroundImage?: BackgroundImage | null;
  /** Decoded images for image annotations. */
  overlayImages?: ReadonlyMap<string, CanvasImageSource>;
  /** Files for project.audioTracks, by track id. */
  audioFiles?: ReadonlyMap<string, Blob>;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number;
}

const CANDIDATES: Record<ExportFormat, { av: string[]; v: string[] }> = {
  webm: {
    av: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
    v: ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"],
  },
  mp4: {
    av: ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"],
    v: ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4"],
  },
};

const supported = (t: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t);

export function exportMimeFor(format: ExportFormat, withAudio: boolean): string | null {
  return CANDIDATES[format][withAudio ? "av" : "v"].find(supported) ?? null;
}

/** Formats this browser can actually encode. */
export function availableFormats(): ExportFormat[] {
  return (["webm", "mp4"] as const).filter((f) => exportMimeFor(f, true) !== null);
}

const AUDIO_BPS = 160_000;

export function exportBitrate(w: number, h: number, fps = 30): number {
  return videoBitrateFor(w, h, fps);
}

/** Rough file size: encoders vary, so treat as an estimate. */
export function estimateBytes(w: number, h: number, durationMs: number, hasAudio: boolean, fps = 30): number {
  const bps = exportBitrate(w, h, fps) + (hasAudio ? AUDIO_BPS : 0);
  return Math.round((bps / 8) * (durationMs / 1000));
}

export async function exportVideo(
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const fps = opts.fps ?? 30;
  const { project } = opts;
  const cleanups: Array<() => void> = [];
  const aborted = () => signal?.aborted ?? false;
  const throwIfAborted = () => {
    if (aborted()) throw new DOMException("Export cancelled", "AbortError");
  };

  try {
    onProgress({ status: "preparing", fraction: 0 });
    const screen = await loadVideo(opts.screen, cleanups, false);
    const camera = opts.camera && (project.webcam.visible || usesCameraScene(project)) ? await loadVideo(opts.camera, cleanups, true) : null;
    throwIfAborted();

    const srcW = screen.videoWidth;
    const srcH = screen.videoHeight;
    const { w, h } = outputSize(project, srcW, srcH, opts.resolution);
    const layout = frameLayout(project, srcW, srcH, w, h, !!camera);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available.");

    const videoTrack = canvas.captureStream(fps).getVideoTracks()[0];
    cleanups.push(() => videoTrack.stop());
    const tracks: MediaStreamTrack[] = [videoTrack];

    const screenAudio = opts.hasAudio && !project.audio.muted && project.audio.volume > 0;
    const extra = (project.audioTracks ?? []).filter((t) => opts.audioFiles?.has(t.id) && t.volume > 0);
    const withAudio = screenAudio || extra.length > 0;
    let music: AudioTrackPlayer | null = null;
    if (withAudio) {
      const ac = new AudioContext();
      cleanups.push(() => void ac.close());
      const dest = ac.createMediaStreamDestination();
      if (screenAudio) {
        const source = ac.createMediaElementSource(screen); // element audio now only goes to the graph (silent to the user)
        const gain = ac.createGain();
        gain.gain.value = project.audio.volume;
        source.connect(gain).connect(dest);
      } else {
        screen.muted = true;
      }
      if (extra.length) {
        // Extra tracks are routed only into the mix, never to the speakers.
        const urls = new Map<string, string>();
        for (const t of extra) {
          const url = URL.createObjectURL(opts.audioFiles!.get(t.id)!);
          urls.set(t.id, url);
          cleanups.push(() => URL.revokeObjectURL(url));
        }
        music = new AudioTrackPlayer((el) => ac.createMediaElementSource(el).connect(dest));
        music.setTracks(extra, urls);
        const m = music;
        cleanups.push(() => m.destroy());
        await music.ready();
      }
      await ac.resume();
      tracks.push(dest.stream.getAudioTracks()[0]);
    } else {
      screen.muted = true;
    }

    const mimeType = exportMimeFor(opts.format, withAudio);
    if (!mimeType) throw new Error(`This browser can't export ${opts.format.toUpperCase()}.`);
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType,
      videoBitsPerSecond: exportBitrate(w, h, fps),
      audioBitsPerSecond: withAudio ? AUDIO_BPS : undefined,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    let recorderError: Error | null = null;
    recorder.onerror = (e) => {
      recorderError = new Error((e as Event & { error?: DOMException }).error?.message ?? "Encoder error");
    };
    const stopped = new Promise<void>((r) => recorder.addEventListener("stop", () => r(), { once: true }));
    cleanups.push(() => recorder.state !== "inactive" && recorder.stop());

    const draw = () =>
      drawFrame(
        ctx,
        project,
        layout,
        screen,
        camera,
        project.zoom.segments.length ? zoomAt(project.zoom.segments, project.zoom.transitionMs, screen.currentTime * 1000) : null,
        screen.currentTime * 1000,
        { backgroundImage: opts.backgroundImage ?? null, overlays: opts.overlayImages },
      );
    const total = totalDuration(project.clips);
    let doneMs = 0;

    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      throwIfAborted();
      await seekAll([screen, camera], clip.start / 1000);
      // Speed regions: the browser plays faster/slower and keeps the voice's pitch.
      const rate = clipSpeed(clip);
      screen.playbackRate = rate;
      if (camera) camera.playbackRate = rate;
      draw();
      if (recorder.state === "inactive") recorder.start(1000);
      else recorder.resume();

      await playRange(screen, camera, clip.end / 1000, {
        draw,
        signal,
        onTick: (t) => {
          const outMs = doneMs + (t * 1000 - clip.start) / rate;
          music?.sync(outMs, true);
          onProgress({ status: "rendering", fraction: Math.min(1, outMs / total) });
        },
        onHidden: (hidden) => {
          if (hidden) {
            music?.pauseAll();
            if (recorder.state === "recording") recorder.pause();
            onProgress({ status: "paused-hidden", fraction: doneMs / total });
          } else if (recorder.state === "paused") {
            recorder.resume();
          }
        },
      });
      if (recorderError) throw recorderError;
      recorder.pause();
      music?.pauseAll();
      doneMs += clipDuration(clip);
    }

    onProgress({ status: "finalizing", fraction: 1 });
    recorder.stop();
    await stopped;
    if (recorderError) throw recorderError;
    throwIfAborted();
    if (chunks.length === 0) throw new Error("The encoder produced no data.");

    const type = recorder.mimeType || mimeType;
    if (opts.format === "webm") chunks[0] = await patchWebmHead(chunks[0], total);
    const blob = new Blob(chunks, { type });
    return { blob, mimeType: blob.type || mimeType, width: w, height: h, durationMs: total };
  } finally {
    cleanups.reverse().forEach((c) => {
      try {
        c();
      } catch {
        /* best effort */
      }
    });
  }
}

export async function loadVideo(blob: Blob, cleanups: Array<() => void>, muted: boolean): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  cleanups.push(() => {
    v.pause();
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  });
  await once(v, "loadeddata", 15_000);
  return v;
}

export async function seekAll(videos: Array<HTMLVideoElement | null>, t: number) {
  await Promise.all(
    videos.map(async (v) => {
      if (!v) return;
      if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return;
      v.currentTime = t;
      await once(v, "seeked", 15_000);
    }),
  );
}

function playRange(
  screen: HTMLVideoElement,
  camera: HTMLVideoElement | null,
  endSec: number,
  hooks: {
    draw: () => void;
    signal?: AbortSignal;
    onTick: (t: number) => void;
    onHidden: (hidden: boolean) => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let raf = 0;
    let lastT = -1;
    let stalledSince = performance.now();
    let pausedForHidden = false;

    const finish = (err?: unknown) => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      hooks.signal?.removeEventListener("abort", onAbort);
      screen.pause();
      camera?.pause();
      if (err) reject(err);
      else resolve();
    };

    const start = () => {
      void screen.play().catch((e) => finish(e));
      if (camera) void camera.play().catch(() => undefined);
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden && !pausedForHidden) {
        pausedForHidden = true;
        cancelAnimationFrame(raf);
        screen.pause();
        camera?.pause();
        hooks.onHidden(true);
      } else if (!document.hidden && pausedForHidden) {
        pausedForHidden = false;
        hooks.onHidden(false);
        stalledSince = performance.now();
        start();
      }
    };
    const onAbort = () => finish(new DOMException("Export cancelled", "AbortError"));

    const tick = () => {
      const t = screen.currentTime;
      if (t >= endSec - 0.01 || screen.ended) {
        hooks.draw();
        finish();
        return;
      }
      if (camera && Math.abs(camera.currentTime - t) > 0.12) camera.currentTime = t;
      hooks.draw();
      hooks.onTick(t);
      const now = performance.now();
      if (t !== lastT) {
        lastT = t;
        stalledSince = now;
      } else if (now - stalledSince > 15_000) {
        finish(new Error("Playback stalled while exporting."));
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("visibilitychange", onVisibility);
    hooks.signal?.addEventListener("abort", onAbort, { once: true });
    if (document.hidden) {
      pausedForHidden = true;
      hooks.onHidden(true);
    } else {
      start();
    }
  });
}

function once(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => done(new Error(`Timed out waiting for video (${event}).`)), timeoutMs);
    const ok = () => done();
    const fail = () => done(new Error("The video couldn't be read."));
    function done(err?: Error) {
      clearTimeout(t);
      el.removeEventListener(event, ok);
      el.removeEventListener("error", fail);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(event, ok);
    el.addEventListener("error", fail);
  });
}
