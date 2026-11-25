import { cursorStateAt, type CursorBundle } from "../cursor/path";
import { zoomAt } from "../zoom/camera";
import { drawFrame, frameLayout, outputSize, outputToSource, type BackgroundImage, type FrameAssets, type FrameLayout } from "./layout";
import { FULL_CROP, type EditProject } from "./project";
import { clipOffsets, clipSpeed, locate, toOutput, totalDuration } from "./timeline";
import { AudioTrackPlayer } from "./audio-tracks";

export type PreviewMode = "edit" | "crop" | "annotate";

export interface PlayerSnapshot {
  timeMs: number;
  playing: boolean;
  durationMs: number;
}

/**
 * Plays an edit (clips + layout) on a canvas from two <video> elements.
 * Framework-free; UI subscribes via subscribe()/getSnapshot().
 */
export class PreviewPlayer {
  private project: EditProject;
  private mode: PreviewMode = "edit";
  private ctx: CanvasRenderingContext2D;
  private layout: FrameLayout | null = null;
  private raf = 0;
  private clipIndex = 0;
  private outMs = 0;
  private _playing = false;
  private snapshot: PlayerSnapshot;
  private listeners = new Set<() => void>();
  private destroyed = false;
  private cursor: CursorBundle | null = null;

  constructor(
    private readonly screen: HTMLVideoElement,
    private readonly camera: HTMLVideoElement | null,
    private readonly canvas: HTMLCanvasElement,
    project: EditProject,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.project = project;
    this.snapshot = { timeMs: 0, playing: false, durationMs: totalDuration(project.clips) };
    screen.addEventListener("seeked", this.onSeeked);
    screen.addEventListener("loadeddata", this.onSeeked);
    this.applyAudio();
    this.relayout();
  }

  // ---- external store
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snapshot;

  get sourceSize() {
    return { w: this.screen.videoWidth, h: this.screen.videoHeight };
  }

  setProject(project: EditProject) {
    const clipsChanged = project.clips !== this.project.clips;
    const tracksChanged = project.audioTracks !== this.project.audioTracks;
    this.project = project;
    if (tracksChanged) {
      this.music.setTracks(project.audioTracks ?? [], this.musicUrls);
      this.music.sync(this.outMs, this._playing);
    }
    this.applyAudio();
    this.relayout();
    if (clipsChanged) {
      // Keep the playhead at the same output time (clamped), re-resolve the clip.
      const dur = totalDuration(project.clips);
      this.seek(Math.min(this.outMs, dur), false);
    } else if (!this._playing) {
      this.draw();
    }
  }

  private assets: FrameAssets = {};

  /** Uploaded background image (null = none). */
  setBackgroundImage(img: BackgroundImage | null) {
    this.assets = { ...this.assets, backgroundImage: img };
    if (!this._playing) this.draw();
  }

  private music = new AudioTrackPlayer();
  private musicUrls: ReadonlyMap<string, string> = new Map();

  /** File URLs for project.audioTracks (music, voice-over). */
  setAudioFiles(urls: ReadonlyMap<string, string>) {
    this.musicUrls = urls;
    this.music.setTracks(this.project.audioTracks ?? [], urls);
    this.music.sync(this.outMs, this._playing);
  }

  /** Decoded images for image annotations. */
  setOverlayImages(overlays: ReadonlyMap<string, CanvasImageSource>) {
    this.assets = { ...this.assets, overlays };
    if (!this._playing) this.draw();
  }

  /** Cursor telemetry for this recording (null = none). */
  setCursor(cursor: CursorBundle | null) {
    this.cursor = cursor;
    if (!this._playing) this.draw();
  }

  setMode(mode: PreviewMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.relayout();
    this.draw();
  }

  play() {
    if (this._playing || this.destroyed) return;
    const dur = totalDuration(this.project.clips);
    if (this.outMs >= dur - 30) this.seek(0, false);
    this._playing = true;
    void this.screen.play().catch(() => {
      this._playing = false;
      this.emit();
    });
    if (this.camera) void this.camera.play().catch(() => undefined);
    this.music.sync(this.outMs, true);
    this.emit();
    this.loop();
  }

  pause() {
    if (!this._playing) return;
    this._playing = false;
    cancelAnimationFrame(this.raf);
    this.screen.pause();
    this.camera?.pause();
    this.music.pauseAll();
    this.emit();
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  /** Seek to an output time (ms). */
  seek(outMs: number, keepPlaying = true) {
    const loc = locate(this.project.clips, outMs);
    this.clipIndex = loc.index;
    this.outMs = toOutput(this.project.clips, loc.index, loc.sourceMs);
    this.applyRate();
    const s = loc.sourceMs / 1000;
    this.screen.currentTime = s;
    if (this.camera) this.camera.currentTime = s;
    if (!keepPlaying) this.pause();
    this.music.sync(this.outMs, this._playing);
    this.emit();
  }

  /** Source-recording time of the current frame (ms). */
  get sourceTimeMs(): number {
    return this.screen.currentTime * 1000;
  }

  /** Current unzoomed frame layout (output pixels), for on-preview editors. */
  get frame(): FrameLayout | null {
    return this.layout;
  }

  /** Canvas pixel → normalised source point (unzoomed), for picking a zoom focus. */
  canvasToSource(x: number, y: number): { x: number; y: number } | null {
    return this.layout ? outputToSource(this.layout, x, y) : null;
  }

  destroy() {
    this.destroyed = true;
    this.pause();
    this.music.destroy();
    this.screen.removeEventListener("seeked", this.onSeeked);
    this.screen.removeEventListener("loadeddata", this.onSeeked);
    this.listeners.clear();
  }

  /** Plays the current clip at its speed (pitch is preserved by the browser). */
  private applyRate() {
    const clip = this.project.clips[this.clipIndex];
    const rate = clip ? clipSpeed(clip) : 1;
    if (this.screen.playbackRate !== rate) this.screen.playbackRate = rate;
    if (this.camera && this.camera.playbackRate !== rate) this.camera.playbackRate = rate;
  }

  private applyAudio() {
    this.screen.volume = Math.min(1, Math.max(0, this.project.audio.volume));
    this.screen.muted = this.project.audio.muted;
    if (this.camera) this.camera.muted = true;
  }

  private relayout() {
    const sw = this.screen.videoWidth;
    const sh = this.screen.videoHeight;
    if (!sw || !sh) {
      this.layout = null;
      return;
    }
    const p =
      this.mode === "crop"
        ? { ...this.project, crop: FULL_CROP, aspect: "source" as const, fit: "contain" as const, padding: 0, radius: 0 }
        : this.project;
    const { w, h } = outputSize(p, sw, sh, "preview");
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.layout = frameLayout(p, sw, sh, w, h, !!this.camera && this.mode !== "crop");
  }

  private onSeeked = () => {
    if (!this.layout) this.relayout();
    if (!this._playing) this.draw();
  };

  private draw() {
    if (!this.layout) this.relayout();
    if (!this.layout || this.screen.readyState < 2) return;
    if (this.mode === "crop") {
      this.ctx.drawImage(this.screen, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const c = this.cursor;
    const srcMs = this.screen.currentTime * 1000;
    const state = c?.path ? cursorStateAt(c.path, srcMs + this.project.cursor.offsetMs, c.pressed) : null;
    const z = this.project.zoom;
    // Zoom is paused while editing annotations, so their on-screen positions hold still.
    const cam = z.segments.length && this.mode === "edit" ? zoomAt(z.segments, z.transitionMs, srcMs, c?.follow ?? null) : null;
    drawFrame(this.ctx, this.project, this.layout, this.screen, this.camera, state, cam, srcMs, this.assets);
  }

  private loop = () => {
    if (!this._playing) return;
    const clips = this.project.clips;
    const clip = clips[this.clipIndex] ?? clips[0];
    const srcMs = this.screen.currentTime * 1000;

    if (srcMs >= clip.end - 15 || this.screen.ended) {
      if (this.clipIndex < clips.length - 1) {
        // Jump over the cut to the next clip.
        this.clipIndex += 1;
        const next = clips[this.clipIndex];
        this.screen.currentTime = next.start / 1000;
        if (this.camera) this.camera.currentTime = next.start / 1000;
        this.outMs = clipOffsets(clips)[this.clipIndex];
        this.applyRate();
      } else {
        this.outMs = totalDuration(clips);
        this.draw();
        this.pause();
        return;
      }
    } else if (srcMs >= clip.start - 50) {
      this.outMs = toOutput(clips, this.clipIndex, srcMs);
    }

    if (this.camera && Math.abs(this.camera.currentTime - this.screen.currentTime) > 0.12) {
      this.camera.currentTime = this.screen.currentTime;
    }
    this.music.sync(this.outMs, true);
    this.draw();
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };

  private emit() {
    const durationMs = totalDuration(this.project.clips);
    const next = { timeMs: Math.round(this.outMs), playing: this._playing, durationMs };
    const s = this.snapshot;
    if (s.timeMs === next.timeMs && s.playing === next.playing && s.durationMs === next.durationMs) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }
}
