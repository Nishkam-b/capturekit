import type { Clip } from "./project";

/** Shortest clip we allow (ms). */
export const MIN_CLIP_MS = 100;

export const clipDuration = (c: Clip) => c.end - c.start;

export function totalDuration(clips: readonly Clip[]): number {
  return clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

/** Output start time (ms) of each clip. */
export function clipOffsets(clips: readonly Clip[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const c of clips) {
    out.push(t);
    t += clipDuration(c);
  }
  return out;
}

export interface Location {
  index: number;
  clip: Clip;
  /** Position in the source recording (ms). */
  sourceMs: number;
  /** Output time at which this clip starts (ms). */
  clipStartOut: number;
}

/** Maps an output time to a clip and a source time. Clamps to the edit's bounds. */
export function locate(clips: readonly Clip[], outMs: number): Location {
  if (clips.length === 0) throw new Error("No clips");
  const total = totalDuration(clips);
  const t = Math.min(Math.max(0, outMs), total);
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const d = clipDuration(c);
    if (t < start + d || i === clips.length - 1) {
      return { index: i, clip: c, sourceMs: c.start + Math.min(d, t - start), clipStartOut: start };
    }
    start += d;
  }
  /* c8 ignore next */
  throw new Error("unreachable");
}

/** Output time for a source position inside clip `index`. */
export function toOutput(clips: readonly Clip[], index: number, sourceMs: number): number {
  const c = clips[index];
  const offset = clipOffsets(clips)[index] ?? 0;
  return offset + Math.min(clipDuration(c), Math.max(0, sourceMs - c.start));
}

/** Splits the clip under `outMs` in two. No-op if too close to an edge. */
export function splitAt(clips: readonly Clip[], outMs: number, newId: string): Clip[] {
  const { index, clip, sourceMs } = locate(clips, outMs);
  if (sourceMs - clip.start < MIN_CLIP_MS || clip.end - sourceMs < MIN_CLIP_MS) return [...clips];
  const at = Math.round(sourceMs);
  const next = [...clips];
  next.splice(index, 1, { ...clip, end: at }, { id: newId, start: at, end: clip.end });
  return next;
}

/** Removes a clip. The last remaining clip can't be removed. */
export function removeClip(clips: readonly Clip[], id: string): Clip[] {
  if (clips.length <= 1) return [...clips];
  return clips.filter((c) => c.id !== id);
}

/** Moves one edge of a clip to a new source time, within the source and a minimum length. */
export function trimClip(
  clips: readonly Clip[],
  id: string,
  edge: "start" | "end",
  sourceMs: number,
  sourceDurationMs: number,
): Clip[] {
  return clips.map((c) => {
    if (c.id !== id) return c;
    if (edge === "start") {
      const start = Math.round(Math.min(Math.max(0, sourceMs), c.end - MIN_CLIP_MS));
      return { ...c, start };
    }
    const end = Math.round(Math.max(Math.min(sourceDurationMs, sourceMs), c.start + MIN_CLIP_MS));
    return { ...c, end };
  });
}

/** True when the edit is just the whole source, untouched. */
export function isUntrimmed(clips: readonly Clip[], sourceDurationMs: number): boolean {
  return clips.length === 1 && clips[0].start <= 0 && clips[0].end >= sourceDurationMs - 1;
}

/** Output time at which a source moment plays, or null if it was cut out. */
export function sourceToOutput(clips: readonly Clip[], sourceMs: number): number | null {
  let offset = 0;
  for (const c of clips) {
    if (sourceMs >= c.start && sourceMs <= c.end) return offset + (sourceMs - c.start);
    offset += clipDuration(c);
  }
  return null;
}

/** Like sourceToOutput, but moments inside a cut map to where playback resumes (monotonic, for drawing). */
export function sourceToOutputClamped(clips: readonly Clip[], sourceMs: number): number {
  let offset = 0;
  for (const c of clips) {
    if (sourceMs < c.start) return offset;
    if (sourceMs <= c.end) return offset + (sourceMs - c.start);
    offset += clipDuration(c);
  }
  return offset;
}
