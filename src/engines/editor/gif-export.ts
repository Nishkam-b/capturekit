import { cursorStateAt } from "../cursor/path";
import { zoomAt } from "../zoom/camera";
import { loadVideo, seekAll, type ExportOptions, type ExportProgress, type ExportResult } from "./export";
import { GifEncoder } from "./gif";
import { drawFrame, frameLayout, outputAspect } from "./layout";
import { locate, totalDuration } from "./timeline";

/** GIF width presets (long side, px). GIFs get large fast, so these stay modest. */
export const GIF_SIZES = { small: 480, medium: 720, large: 1080 } as const;
export type GifSize = keyof typeof GIF_SIZES;
export const GIF_FPS = [10, 15, 20] as const;

export interface GifExportOptions extends Pick<ExportOptions, "project" | "screen" | "camera" | "cursor" | "backgroundImage"> {
  size: GifSize;
  fps: number;
  loop: boolean;
}

/** Rough GIF size estimate (they vary a lot with content): bytes. */
export function estimateGifBytes(w: number, h: number, durationMs: number, fps: number): number {
  return Math.round(w * h * 0.12 * fps * (durationMs / 1000));
}

/** Output size of a GIF for a project. */
export function gifSize(project: ExportOptions["project"], srcW: number, srcH: number, size: GifSize): { w: number; h: number } {
  const a = outputAspect(project, srcW, srcH);
  const long = GIF_SIZES[size];
  return a >= 1 ? { w: long, h: Math.max(2, Math.round(long / a)) } : { w: Math.max(2, Math.round(long * a)), h: long };
}

/**
 * Renders the edit frame by frame (seeking, not real-time playback) with the same
 * drawing code as the preview, and encodes an animated GIF. GIFs have no sound.
 */
export async function exportGif(opts: GifExportOptions, onProgress: (p: ExportProgress) => void, signal?: AbortSignal): Promise<ExportResult> {
  const { project } = opts;
  const cleanups: Array<() => void> = [];
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  };
  try {
    onProgress({ status: "preparing", fraction: 0 });
    const screen = await loadVideo(opts.screen, cleanups, true);
    const camera = opts.camera && project.webcam.visible ? await loadVideo(opts.camera, cleanups, true) : null;
    throwIfAborted();
    const { w, h } = gifSize(project, screen.videoWidth, screen.videoHeight, opts.size);
    const layout = frameLayout(project, screen.videoWidth, screen.videoHeight, w, h, !!camera);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not available.");

    const total = totalDuration(project.clips);
    const step = 1000 / opts.fps;
    const gif = new GifEncoder({ width: w, height: h, loop: opts.loop });
    const cur = opts.cursor ?? null;
    let waitingForTab = false;
    for (let t = 0; t < total; t += step) {
      throwIfAborted();
      // Seeking is throttled in background tabs; wait until the tab is visible again.
      while (document.hidden) {
        if (!waitingForTab) onProgress({ status: "paused-hidden", fraction: t / total });
        waitingForTab = true;
        await new Promise((r) => setTimeout(r, 250));
        throwIfAborted();
      }
      waitingForTab = false;
      const src = locate(project.clips, t).sourceMs;
      await seekAll([screen, camera], src / 1000);
      drawFrame(
        ctx,
        project,
        layout,
        screen,
        camera,
        cur?.path ? cursorStateAt(cur.path, src + project.cursor.offsetMs, cur.pressed) : null,
        project.zoom.segments.length ? zoomAt(project.zoom.segments, project.zoom.transitionMs, src, cur?.follow ?? null) : null,
        src,
        opts.backgroundImage ?? null,
      );
      gif.addFrame(ctx.getImageData(0, 0, w, h).data, Math.min(step, total - t));
      onProgress({ status: "rendering", fraction: Math.min(1, (t + step) / total) });
      // Keep the page responsive.
      await new Promise((r) => setTimeout(r, 0));
    }
    onProgress({ status: "finalizing", fraction: 1 });
    const blob = gif.finish();
    return { blob, mimeType: "image/gif", width: w, height: h, durationMs: total };
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
