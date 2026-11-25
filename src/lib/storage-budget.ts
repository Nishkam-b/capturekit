import { videoBitrateFor } from "@/engines/recorder/mime";

/** Bytes per second a recording is expected to use (screen + audio + optional webcam). */
export function expectedBytesPerSecond(width: number, height: number, withCamera: boolean): number {
  const bits = videoBitrateFor(width, height, 30) + 160_000 + (withCamera ? 2_500_000 : 0);
  return bits / 8;
}

/** Free bytes in this origin's storage quota, or null if unknown. */
export async function freeBytes(): Promise<number | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return quota > 0 ? Math.max(0, quota - usage) : null;
  } catch {
    return null;
  }
}

/** Below this many seconds of space, the recording stops itself so it can still be saved. */
export const AUTO_STOP_SECONDS = 20;
/** Below this, warn while recording. */
export const LOW_SPACE_SECONDS = 120;
/** Setup-screen thresholds (minutes). */
export const SETUP_WARN_MINUTES = 10;
export const SETUP_BLOCK_MINUTES = 1;

/** Space left in seconds, using the measured rate once there is enough data. */
export function secondsLeft(free: number, bytesSoFar: number, activeMs: number, fallbackBps: number): number {
  const measured = activeMs > 5000 ? bytesSoFar / (activeMs / 1000) : 0;
  const bps = Math.max(measured, fallbackBps * 0.25, 1);
  return free / bps;
}
