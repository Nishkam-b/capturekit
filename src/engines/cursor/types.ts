/**
 * Cursor telemetry, kept separate from the video. Positions are normalised
 * (0..1) to the captured surface; time is "active" recording time in ms
 * (pauses excluded), i.e. the same timeline as the recorded video.
 */

export const CursorKind = {
  Move: 0,
  Down: 1,
  Up: 2,
  /** Pointer left the captured surface (hide the cursor). */
  Leave: 3,
} as const;
export type CursorKind = (typeof CursorKind)[keyof typeof CursorKind];

export interface CursorEvent {
  t: number;
  x: number;
  y: number;
  kind: CursorKind;
}

/**
 * extension = precise pointer data; native = future desktop companion;
 * video-cursor = cursor found in the video, clicks inferred; video-activity = on-screen changes only;
 * video = v0.9–0.10 activity analysis (re-analysed on open).
 */
export type TelemetrySource = "extension" | "native" | "video-cursor" | "video-activity" | "video";

/** Sources whose positions are where the pointer really was. */
export const isPointerSource = (s: TelemetrySource | null) => s === "extension" || s === "native" || s === "video-cursor";

export interface CursorTrack {
  recordingId: string;
  source: TelemetrySource;
  /** Surface the coordinates are relative to. */
  surface: "browser" | "window" | "monitor";
  /** Flat [t, x, y, kind, t, x, y, kind, …] — compact for storage. */
  events: number[];
}

export function packEvents(events: readonly CursorEvent[]): number[] {
  const out: number[] = new Array(events.length * 4);
  events.forEach((e, i) => {
    out[i * 4] = Math.round(e.t);
    out[i * 4 + 1] = Math.round(e.x * 10000) / 10000;
    out[i * 4 + 2] = Math.round(e.y * 10000) / 10000;
    out[i * 4 + 3] = e.kind;
  });
  return out;
}

export function unpackEvents(flat: readonly number[]): CursorEvent[] {
  const out: CursorEvent[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) out.push({ t: flat[i], x: flat[i + 1], y: flat[i + 2], kind: flat[i + 3] as CursorKind });
  return out;
}

/** A source of cursor events (extension now; native companion later). */
export interface CursorTelemetryProvider {
  readonly source: TelemetrySource;
  /** Starts tracking the surface behind `track`. Resolves false if it can't (unsupported surface, not found). */
  start(track: MediaStreamTrack, onEvents: (events: Array<Omit<CursorEvent, "t"> & { perfMs: number }>) => void): Promise<boolean>;
  stop(): void;
}
