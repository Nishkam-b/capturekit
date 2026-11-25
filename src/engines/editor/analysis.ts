export interface FilmFrame {
  timeMs: number;
  url: string;
}

/**
 * Extracts evenly spaced thumbnails for the timeline. Calls `onFrame` as each
 * is ready. Returns a cleanup that stops work and revokes the URLs.
 */
export function generateFilmstrip(
  blob: Blob,
  durationMs: number,
  onFrame: (f: FilmFrame) => void,
  { count = 24, height = 64 }: { count?: number; height?: number } = {},
): () => void {
  let cancelled = false;
  const urls: string[] = [];
  const srcUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = srcUrl;

  const run = async () => {
    await waitFor(video, "loadeddata");
    const w = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const n = Math.max(2, Math.min(count, Math.ceil(durationMs / 500)));
    for (let i = 0; i < n && !cancelled; i++) {
      const t = (durationMs * (i + 0.5)) / n;
      video.currentTime = t / 1000;
      await waitFor(video, "seeked");
      if (cancelled) return;
      ctx.drawImage(video, 0, 0, w, height);
      const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
      if (!b || cancelled) return;
      const url = URL.createObjectURL(b);
      urls.push(url);
      onFrame({ timeMs: t, url });
    }
  };
  run()
    .catch(() => undefined)
    .finally(() => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(srcUrl);
    });

  return () => {
    cancelled = true;
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
}

export interface Waveform {
  /** Peak amplitude (0..1) per bucket. */
  peaks: Float32Array;
  bucketMs: number;
}

/** Longest recording we decode for a waveform (decoding holds all samples in memory). */
export const WAVEFORM_MAX_MS = 15 * 60_000;

/** Decodes the audio track and returns peaks, or null if there's no decodable audio. */
export async function computeWaveform(blob: Blob, durationMs: number, bucketMs = 50): Promise<Waveform | null> {
  if (durationMs > WAVEFORM_MAX_MS) return null;
  const ctx = new OfflineAudioContext(1, 1, 8000);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
  const buckets = Math.max(1, Math.ceil((buffer.duration * 1000) / bucketMs));
  const peaks = new Float32Array(buckets);
  const perBucket = buffer.sampleRate * (bucketMs / 1000);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor(b * perBucket);
      const to = Math.min(data.length, Math.floor((b + 1) * perBucket));
      let max = peaks[b];
      for (let i = from; i < to; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
  }
  // Normalise so quiet recordings are still visible.
  let top = 0;
  for (const p of peaks) top = Math.max(top, p);
  if (top > 0) for (let i = 0; i < peaks.length; i++) peaks[i] = Math.min(1, peaks[i] / top);
  return { peaks, bucketMs };
}

function waitFor(el: HTMLMediaElement, event: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => done(new Error(`timeout: ${event}`)), timeoutMs);
    const ok = () => done();
    const fail = () => done(new Error("media error"));
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
