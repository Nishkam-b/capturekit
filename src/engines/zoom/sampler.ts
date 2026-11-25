import type { CursorEvent } from "../cursor/types";
import { activityPoints, activityToEvents, diffGrid, type ActivityOptions } from "./activity";

export interface AnalyzeOptions {
  /** Samples per second of source time. */
  fps?: number;
  /** Analysis width in pixels (height follows the aspect). */
  width?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Plays the recording fast and muted, compares low-resolution frames as they
 * arrive, and returns pseudo cursor events describing on-screen activity.
 * Only the previous frame and small change grids are kept, so memory stays flat.
 */
export async function analyzeRecording(blob: Blob, durationMs: number, o: AnalyzeOptions = {}): Promise<CursorEvent[]> {
  const fps = o.fps ?? 8;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video") as FrameCallbackVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("The recording couldn't be read.")), { once: true });
    });
    const width = o.width ?? 320;
    const height = Math.max(2, Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth)));
    const opts: ActivityOptions = { width, height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not available.");

    const grids: Array<{ t: number; grid: Uint8Array }> = [];
    let prev: Uint8Array | null = null;
    let lastT = -Infinity;
    const grab = (tMs: number) => {
      ctx.drawImage(video, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
      if (prev) grids.push({ t: Math.round(tMs), grid: diffGrid(prev, gray, opts) });
      prev = gray;
      lastT = tMs;
    };

    const total = Math.max(1, durationMs);
    if (typeof video.requestVideoFrameCallback === "function") {
      // Fast muted playback; sample whenever enough source time has passed.
      video.playbackRate = total > 120_000 ? 16 : 8;
      await new Promise<void>((resolve, reject) => {
        let handle = 0;
        const onAbort = () => {
          video.pause();
          video.cancelVideoFrameCallback?.(handle);
          reject(new DOMException("Analysis cancelled", "AbortError"));
        };
        o.signal?.addEventListener("abort", onAbort, { once: true });
        const step = (_now: number, meta: { mediaTime: number }) => {
          const t = meta.mediaTime * 1000;
          if (t - lastT >= 1000 / fps) grab(t);
          o.onProgress?.(Math.min(1, t / total));
          handle = video.requestVideoFrameCallback!(step);
        };
        handle = video.requestVideoFrameCallback!(step);
        video.addEventListener(
          "ended",
          () => {
            video.cancelVideoFrameCallback?.(handle);
            o.signal?.removeEventListener("abort", onAbort);
            resolve();
          },
          { once: true },
        );
        video.play().catch(reject);
      });
    } else {
      // Fallback: seek through the video (slower, fewer samples).
      const stepMs = 1000 / Math.min(fps, 4);
      for (let t = 0; t <= total; t += stepMs) {
        if (o.signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
        video.currentTime = t / 1000;
        await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
        grab(t);
        o.onProgress?.(t / total);
      }
    }
    o.onProgress?.(1);
    return activityToEvents(activityPoints(grids));
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
