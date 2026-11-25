/**
 * Extra audio tracks (music, voice-over) laid over the edit. Times are in OUTPUT ms
 * (the edited timeline), so a music bed keeps playing smoothly across cuts and speed changes.
 */
export interface AudioTrack {
  id: string;
  /** File name, for display. */
  name: string;
  /** Output time (ms) at which the track starts. */
  start: number;
  /** Length of the audio file (ms). */
  durationMs: number;
  /** 0..1 */
  volume: number;
  /** Repeat until the end of the video. */
  loop: boolean;
}

/** Seconds into the file that should be playing at output time `outMs`, or null when the track is silent there. */
export function trackPositionAt(t: Pick<AudioTrack, "start" | "durationMs" | "loop">, outMs: number): number | null {
  const rel = outMs - t.start;
  if (rel < 0 || t.durationMs <= 0) return null;
  if (t.loop) return (rel % t.durationMs) / 1000;
  return rel < t.durationMs ? rel / 1000 : null;
}

/** How far playback may drift from the timeline before we re-seek (s). */
const DRIFT_S = 0.25;

/**
 * Keeps one <audio> element per track in step with the timeline. `connect` lets the
 * exporter route each element into its mix (otherwise they play to the speakers).
 */
export class AudioTrackPlayer {
  private els = new Map<string, HTMLAudioElement>();
  private tracks: AudioTrack[] = [];

  constructor(private readonly connect?: (el: HTMLAudioElement) => void) {}

  /** Sets the tracks and their file URLs. Elements for removed tracks are released. */
  setTracks(tracks: readonly AudioTrack[], urls: ReadonlyMap<string, string>): void {
    this.tracks = tracks.filter((t) => urls.has(t.id));
    for (const [id, el] of this.els) {
      if (!this.tracks.some((t) => t.id === id) || el.dataset.src !== urls.get(id)) {
        release(el);
        this.els.delete(id);
      }
    }
    for (const t of this.tracks) {
      if (this.els.has(t.id)) continue;
      const el = new Audio();
      el.preload = "auto";
      el.dataset.src = urls.get(t.id)!;
      el.src = urls.get(t.id)!;
      this.connect?.(el);
      this.els.set(t.id, el);
    }
  }

  /** Brings every track to output time `outMs`, playing or paused. */
  sync(outMs: number, playing: boolean): void {
    for (const t of this.tracks) {
      const el = this.els.get(t.id);
      if (!el) continue;
      const pos = trackPositionAt(t, outMs);
      el.volume = Math.min(1, Math.max(0, t.volume));
      if (pos === null) {
        if (!el.paused) el.pause();
        continue;
      }
      if (Math.abs(el.currentTime - pos) > DRIFT_S || (!playing && Math.abs(el.currentTime - pos) > 0.01)) el.currentTime = pos;
      if (playing && el.paused) void el.play().catch(() => undefined);
      else if (!playing && !el.paused) el.pause();
    }
  }

  /** Resolves when every track has enough data to start playing. */
  async ready(timeoutMs = 10_000): Promise<void> {
    await Promise.all(
      [...this.els.values()].map(
        (el) =>
          new Promise<void>((resolve) => {
            if (el.readyState >= 3) return resolve();
            const t = setTimeout(resolve, timeoutMs);
            el.addEventListener("canplay", () => (clearTimeout(t), resolve()), { once: true });
            el.addEventListener("error", () => (clearTimeout(t), resolve()), { once: true });
          }),
      ),
    );
  }

  pauseAll(): void {
    this.els.forEach((el) => el.pause());
  }

  destroy(): void {
    this.els.forEach(release);
    this.els.clear();
    this.tracks = [];
  }
}

function release(el: HTMLAudioElement) {
  el.pause();
  el.removeAttribute("src");
  el.load();
}
