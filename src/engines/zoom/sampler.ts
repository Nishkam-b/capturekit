import type { CursorEvent } from "../cursor/types";
import { activityPoints, activityToEvents, diffGrid, type ActivityOptions } from "./activity";
import { CursorDetector, inferClicks } from "./cursor-detect";

export interface AnalyzeOptions {
  /** Samples per second of source time. */
  fps?: number;
  /** Analysis width for cursor detection (height follows the aspect). */
  width?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface AnalysisResult {
  events: CursorEvent[];
  /** "cursor": the cursor was found in the video (clicks inferred); "activity": on-screen changes only. */
  method: "cursor" | "activity";
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

const GRID_W = 320;

/**
 * Plays the recording fast and muted and analyses frames as they arrive:
 * finds the cursor (screen/window recordings include it) and infers clicks;
 * when there's no cursor in the video (tab recordings), falls back to on-screen activity.
 * Only the previous frame is kept, so memory stays flat.
 */
export async function analyzeRecording(blob: Blob, durationMs: number, o: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const fps = o.fps ?? 10;
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
    const vw = Math.max(1, video.videoWidth);
    const vh = Math.max(1, video.videoHeight);
    const width = Math.min(o.width ?? 960, vw);
    const height = Math.max(2, Math.round((width * vh) / vw));
    const gridH = Math.max(2, Math.round((GRID_W * vh) / vw));
    const gridOpts: ActivityOptions = { width: GRID_W, height: gridH };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not available.");

    const detector = new CursorDetector({ width, height });
    const grids: Array<{ t: number; grid: Uint8Array }> = [];
    let prevSmall: Uint8Array | null = null;
    let lastT = -Infinity;
    const grab = (tMs: number) => {
      ctx.drawImage(video, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
      detector.push(gray, Math.round(tMs));
      const small = downsample(gray, width, height, GRID_W, gridH);
      if (prevSmall) grids.push({ t: Math.round(tMs), grid: diffGrid(prevSmall, small, gridOpts) });
      prevSmall = small;
      lastT = tMs;
    };

    const total = Math.max(1, durationMs);
    if (typeof video.requestVideoFrameCallback === "function") {
      // Fast muted playback; sample whenever enough source time has passed.
      video.playbackRate = total > 600_000 ? 8 : 4;
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
      const stepMs = 1000 / Math.min(fps, 5);
      for (let t = 0; t <= total; t += stepMs) {
        if (o.signal?.aborted) throw new DOMException("Analysis cancelled", "AbortError");
        video.currentTime = t / 1000;
        await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
        grab(t);
        o.onProgress?.(t / total);
      }
    }
    o.onProgress?.(1);
    if (detector.foundCursor) return { events: inferClicks(detector.samples, detector.reactions), method: "cursor" };
    return { events: activityToEvents(activityPoints(grids)), method: "activity" };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Box-average downsample of a grayscale image. */
function downsample(src: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const fx = w / W;
  const fy = h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let s = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          s += src[yy * w + xx];
          n++;
        }
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}
