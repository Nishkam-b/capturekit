import { AudioMixer } from "./audio";
import { ActiveClock } from "./clock";
import { pickMimeType, videoBitrateFor } from "./mime";
import { patchWebmHead } from "./webm";

export interface SessionSources {
  display: MediaStream;
  microphone: MediaStream | null;
  camera: MediaStream | null;
}

export type TrackKind = "screen" | "camera";

/**
 * Where chunks go while recording. With a sink, chunks are written as they
 * arrive (crash-safe, no memory growth). Without one, they're kept in memory.
 */
export interface ChunkSink {
  write(track: TrackKind, seq: number, blob: Blob, activeMs: number): Promise<void>;
  read(track: TrackKind): Promise<Blob[]>;
}

export interface SessionOptions {
  sink?: ChunkSink;
}

export type SessionState = "ready" | "recording" | "paused" | "stopping" | "stopped" | "cancelled";

export interface RecordedTrack {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

export interface SessionResult {
  screen: RecordedTrack & { displaySurface: string | null };
  camera: RecordedTrack | null;
  durationMs: number;
  hasMicAudio: boolean;
  hasSystemAudio: boolean;
  warnings: string[];
  /** Present when a sink was used: what the storage layer needs to finalise. */
  stored: {
    /** First chunk with the duration header patched in, per track (replaces seq 0). */
    heads: Partial<Record<TrackKind, Blob>>;
    /** Chunks the sink failed to write (kept in memory instead). */
    unstored: Array<{ track: TrackKind; seq: number; blob: Blob }>;
  } | null;
}

export type SessionEvent =
  | { type: "state"; state: SessionState }
  | { type: "warning"; message: string }
  | { type: "storage-error"; error: unknown }
  /** Fired for every screen chunk (~1s), even when timers are throttled in a background tab. */
  | { type: "progress"; bytes: number; activeMs: number };

interface RecorderHandle {
  kind: TrackKind;
  recorder: MediaRecorder;
  /** In-memory chunks (no sink) or chunks the sink failed to write. */
  memory: Array<{ seq: number; blob: Blob }>;
  seq: number;
  bytes: number;
  writes: Promise<void>;
  stopped: Promise<void>;
  error: string | null;
}

/**
 * One recording: screen (+ mixed system/mic audio) and an optional separate
 * webcam track. Owns every track it is given and releases them all on finish.
 */
export class RecordingSession {
  private _state: SessionState = "ready";
  private readonly listeners = new Set<(e: SessionEvent) => void>();
  private readonly clock = new ActiveClock();
  private readonly mixer: AudioMixer;
  private readonly screen: RecorderHandle;
  private readonly cam: RecorderHandle | null;
  private readonly warnings: string[] = [];
  private readonly hasSystemAudio: boolean;
  private readonly hasMicAudio: boolean;
  private readonly sink: ChunkSink | null;
  private storageFailed = false;
  private _micMuted = false;
  private finishResolve!: (r: SessionResult) => void;
  private finishReject!: (e: Error) => void;
  private stopPromise: Promise<SessionResult> | null = null;

  /** Resolves when the recording ends for any reason (button, browser "Stop sharing", error). */
  readonly finished: Promise<SessionResult>;

  constructor(
    private readonly sources: SessionSources,
    options: SessionOptions = {},
  ) {
    this.sink = options.sink ?? null;
    this.finished = new Promise((resolve, reject) => {
      this.finishResolve = resolve;
      this.finishReject = reject;
    });
    this.finished.catch(() => undefined); // callers may not attach a handler

    const displayVideo = sources.display.getVideoTracks()[0];
    if (!displayVideo) {
      this.releaseInputs();
      throw new Error("The shared screen has no video track.");
    }

    this.mixer = new AudioMixer();
    this.hasSystemAudio = this.mixer.add("system", sources.display);
    this.hasMicAudio = sources.microphone ? this.mixer.add("mic", sources.microphone) : false;

    const audioTrack = this.mixer.track;
    const screenMime = pickMimeType(!!audioTrack);
    if (!screenMime) {
      void this.mixer.close();
      this.releaseInputs();
      throw new Error("This browser can't encode video with MediaRecorder.");
    }
    const s = displayVideo.getSettings();
    const screenStream = new MediaStream(audioTrack ? [displayVideo, audioTrack] : [displayVideo]);
    this.screen = this.createRecorder("screen", screenStream, screenMime, {
      videoBitsPerSecond: videoBitrateFor(s.width ?? 1920, s.height ?? 1080, s.frameRate ?? 30),
      audioBitsPerSecond: 160_000,
    });

    const camVideo = sources.camera?.getVideoTracks()[0];
    const camMime = camVideo ? pickMimeType(false) : null;
    this.cam =
      camVideo && camMime
        ? this.createRecorder("camera", new MediaStream([camVideo]), camMime, { videoBitsPerSecond: 2_500_000 })
        : null;

    // Browser "Stop sharing" button (or the shared window closing) ends the track.
    displayVideo.addEventListener("ended", this.onDisplayEnded);
    sources.microphone?.getAudioTracks()[0]?.addEventListener("ended", this.onMicEnded);
    camVideo?.addEventListener("ended", this.onCameraEnded);
  }

  get state(): SessionState {
    return this._state;
  }

  get micMuted(): boolean {
    return this._micMuted;
  }

  get hasMic(): boolean {
    return this.hasMicAudio;
  }

  get hasCamera(): boolean {
    return this.cam !== null;
  }

  get displayTrack(): MediaStreamTrack {
    return this.sources.display.getVideoTracks()[0];
  }

  /** Mime types the recorders are using (known once constructed). */
  get mimeTypes(): { screen: string; camera: string | null } {
    return { screen: this.screen.recorder.mimeType, camera: this.cam?.recorder.mimeType ?? null };
  }

  /** Bytes produced so far (all tracks). */
  get bytesRecorded(): number {
    return this.screen.bytes + (this.cam?.bytes ?? 0);
  }

  subscribe(listener: (e: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Maps a performance.now() timestamp onto the recording timeline (null if paused / not recording then). */
  activeTimeAt(perfMs: number): number | null {
    return this.clock.toActive(perfMs);
  }

  elapsedMs(): number {
    return this.clock.elapsed();
  }

  async start(): Promise<void> {
    if (this._state !== "ready") return;
    if (this.displayTrack.readyState === "ended") {
      // Sharing was stopped during the countdown.
      this.cancel();
      return;
    }
    await this.mixer.resume();
    // 1s timeslices: each second is flushed (and, with a sink, saved) as it's recorded.
    this.screen.recorder.start(1000);
    this.cam?.recorder.start(1000);
    this.clock.start();
    this.setState("recording");
  }

  pause(): void {
    if (this._state !== "recording") return;
    for (const h of this.handles()) if (h.recorder.state === "recording") h.recorder.pause();
    this.clock.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this._state !== "paused") return;
    for (const h of this.handles()) if (h.recorder.state === "paused") h.recorder.resume();
    this.clock.start();
    this.setState("recording");
  }

  togglePause(): void {
    if (this._state === "recording") this.pause();
    else if (this._state === "paused") this.resume();
  }

  setMicMuted(muted: boolean): void {
    this._micMuted = muted;
    this.mixer.setGain("mic", muted ? 0 : 1);
  }

  /** Stops recording and returns the result. Safe to call more than once. */
  stop(): Promise<SessionResult> {
    if (this._state === "ready" || this._state === "cancelled") {
      this.cancel();
      return this.finished;
    }
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.doStop();
    return this.stopPromise;
  }

  /** Abandons a session that hasn't produced anything worth keeping. */
  cancel(): void {
    if (this._state === "stopped" || this._state === "cancelled") return;
    for (const h of this.handles()) if (h.recorder.state !== "inactive") h.recorder.stop();
    this.clock.pause();
    void this.cleanup();
    this.setState("cancelled");
    this.finishReject(new DOMException("Recording cancelled", "AbortError"));
  }

  private async doStop(): Promise<SessionResult> {
    this.setState("stopping");
    this.clock.pause();
    const durationMs = Math.round(this.clock.elapsed());
    const displaySettings = this.displayTrack.getSettings();
    const camSettings = this.sources.camera?.getVideoTracks()[0]?.getSettings();

    for (const h of this.handles()) if (h.recorder.state !== "inactive") h.recorder.stop();
    await Promise.all(this.handles().map((h) => h.stopped));
    await Promise.all(this.handles().map((h) => h.writes)); // all chunks handed to the sink
    await this.cleanup();

    try {
      const screen = await this.assemble(this.screen, durationMs);
      if (!screen) throw new Error(this.screen.error ?? "No video data was recorded.");
      let camera: { blob: Blob; head: Blob | null } | null = null;
      if (this.cam) {
        camera = await this.assemble(this.cam, durationMs);
        if (!camera) this.warn("The webcam didn't produce any video, so only the screen was saved.");
      }
      const result: SessionResult = {
        screen: {
          blob: screen.blob,
          mimeType: this.screen.recorder.mimeType || "video/webm",
          width: displaySettings.width ?? 0,
          height: displaySettings.height ?? 0,
          displaySurface: (displaySettings as { displaySurface?: string }).displaySurface ?? null,
        },
        camera:
          camera && this.cam
            ? {
                blob: camera.blob,
                mimeType: this.cam.recorder.mimeType || "video/webm",
                width: camSettings?.width ?? 0,
                height: camSettings?.height ?? 0,
              }
            : null,
        durationMs,
        hasMicAudio: this.hasMicAudio,
        hasSystemAudio: this.hasSystemAudio,
        warnings: [...this.warnings],
        stored: this.sink
          ? {
              heads: {
                ...(screen.head ? { screen: screen.head } : {}),
                ...(camera?.head ? { camera: camera.head } : {}),
              },
              unstored: this.handles().flatMap((h) => h.memory.map((m) => ({ track: h.kind, seq: m.seq, blob: m.blob }))),
            }
          : null,
      };
      this.setState("stopped");
      this.finishResolve(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState("stopped");
      this.finishReject(error);
      throw error;
    }
  }

  /**
   * Builds the final Blob for a track from stored + in-memory chunks, with the
   * WebM duration written into the first chunk. Doesn't copy the media data.
   */
  private async assemble(h: RecorderHandle, durationMs: number): Promise<{ blob: Blob; head: Blob | null } | null> {
    let stored: Array<{ seq: number; blob: Blob }> = [];
    if (this.sink) {
      try {
        const blobs = await this.sink.read(h.kind);
        const memSeqs = new Set(h.memory.map((m) => m.seq));
        // Stored chunks are seq 0..n except those that failed (held in memory).
        let seq = 0;
        stored = [];
        for (const b of blobs) {
          while (memSeqs.has(seq)) seq++;
          stored.push({ seq: seq++, blob: b });
        }
      } catch (err) {
        this.emit({ type: "storage-error", error: err });
      }
    }
    const parts = [...stored, ...h.memory].sort((a, b) => a.seq - b.seq);
    if (parts.length === 0) return null;
    const type = h.recorder.mimeType || parts[0].blob.type || "video/webm";
    let head: Blob | null = null;
    if (type.includes("webm")) {
      head = await patchWebmHead(parts[0].blob, durationMs);
      parts[0] = { ...parts[0], blob: head };
    }
    // Only report a head for storage if seq 0 lives in storage (otherwise it's in `unstored`).
    const headStored = this.sink && stored[0]?.seq === 0 ? head : null;
    if (!headStored && head) {
      const mem = h.memory.find((m) => m.seq === 0);
      if (mem) mem.blob = head;
    }
    return { blob: new Blob(parts.map((p) => p.blob), { type }), head: headStored };
  }

  private createRecorder(kind: TrackKind, stream: MediaStream, mimeType: string, opts: MediaRecorderOptions): RecorderHandle {
    const recorder = new MediaRecorder(stream, { ...opts, mimeType });
    const handle: RecorderHandle = {
      kind,
      recorder,
      memory: [],
      seq: 0,
      bytes: 0,
      writes: Promise.resolve(),
      stopped: Promise.resolve(),
      error: null,
    };
    handle.stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.addEventListener("dataavailable", (e) => {
      if (!e.data || e.data.size === 0) return;
      const seq = handle.seq++;
      const blob = e.data;
      handle.bytes += blob.size;
      if (kind === "screen") this.emit({ type: "progress", bytes: this.bytesRecorded, activeMs: this.clock.elapsed() });
      if (!this.sink || this.storageFailed) {
        handle.memory.push({ seq, blob });
        return;
      }
      const activeMs = this.clock.elapsed();
      // Keep writes ordered per track; on failure keep the chunk in memory and stop safely.
      handle.writes = handle.writes.then(() =>
        this.sink!.write(kind, seq, blob, activeMs).catch((err: unknown) => {
          handle.memory.push({ seq, blob });
          if (!this.storageFailed) {
            this.storageFailed = true;
            this.emit({ type: "storage-error", error: err });
          }
        }),
      );
    });
    recorder.addEventListener("error", (e) => {
      const msg = (e as Event & { error?: DOMException }).error?.message ?? "unknown error";
      handle.error = `Recorder error: ${msg}`;
      this.warn(kind === "screen" ? `Screen recording stopped unexpectedly (${msg}).` : `Webcam recording stopped unexpectedly (${msg}).`);
      if (kind === "screen") void this.stop();
    });
    return handle;
  }

  private handles(): RecorderHandle[] {
    return this.cam ? [this.screen, this.cam] : [this.screen];
  }

  private onDisplayEnded = () => {
    if (this._state === "recording" || this._state === "paused") void this.stop();
    else if (this._state === "ready") this.cancel();
  };

  private onMicEnded = () => {
    this.warn("The microphone was disconnected. Recording continues without it.");
  };

  private onCameraEnded = () => {
    this.warn("The webcam was disconnected. Recording continues without it.");
  };

  /** Adds a user-visible warning that is also stored with the recording. */
  warn(message: string) {
    if (this.warnings.includes(message)) return;
    this.warnings.push(message);
    this.emit({ type: "warning", message });
  }

  private async cleanup() {
    this.displayTrack.removeEventListener("ended", this.onDisplayEnded);
    this.sources.microphone?.getAudioTracks()[0]?.removeEventListener("ended", this.onMicEnded);
    this.sources.camera?.getVideoTracks()[0]?.removeEventListener("ended", this.onCameraEnded);
    this.releaseInputs();
    await this.mixer.close().catch(() => undefined);
  }

  private releaseInputs() {
    for (const s of [this.sources.display, this.sources.microphone, this.sources.camera]) {
      s?.getTracks().forEach((t) => t.stop());
    }
  }

  private setState(state: SessionState) {
    if (this._state === state) return;
    this._state = state;
    this.emit({ type: "state", state });
  }

  private emit(e: SessionEvent) {
    this.listeners.forEach((l) => l(e));
  }
}
