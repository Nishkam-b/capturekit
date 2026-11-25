import { grabTrackFrame } from "../recorder/frames";
import { renderScreenshot, screenshotLayout } from "./layout";
import type { ScreenshotProject } from "./project";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 16384;

/** Pure checks that don't need decoding. Returns an error message or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "That file isn't a supported image. Use PNG, JPG, WebP, GIF or BMP.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is larger than 50 MB.";
  return null;
}

/** Validates and decodes an image file. Rejects with a friendly message. */
export async function decodeImage(file: Blob): Promise<{ width: number; height: number }> {
  const err = checkImageFile(file);
  if (err) throw new Error(err);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be read. It may be damaged or not really an image.");
  }
  const { width, height } = bitmap;
  bitmap.close();
  if (width < 1 || height < 1) throw new Error("That image has no pixels.");
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) throw new Error(`That image is too large (over ${MAX_IMAGE_SIDE} px on a side).`);
  return { width, height };
}

/** Asks the user to pick a screen, window or tab, grabs one frame, and stops sharing straight away. */
export async function captureScreenshot(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
  const track = stream.getVideoTracks()[0];
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play().catch(() => undefined);
    // Give the capture a moment to deliver a real frame (the first can be blank).
    await new Promise((r) => setTimeout(r, 350));
    const frame = await grabTrackFrame(track, video, "image/png");
    return frame.blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

export type ImageFormat = "png" | "jpeg" | "webp";

export const FORMAT_MIME: Record<ImageFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
export const FORMAT_EXT: Record<ImageFormat, string> = { png: "png", jpeg: "jpg", webp: "webp" };

/** Whether this browser can encode the format (Safari historically couldn't encode WebP). */
export function canEncode(format: ImageFormat): boolean {
  if (format !== "webp") return true;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp");
}

export interface ExportImageOptions {
  format: ImageFormat;
  /** Multiplies the natural size (1 = image pixels). */
  scale: number;
  /** 0..1, for JPG/WebP. */
  quality: number;
}

export async function exportScreenshot(
  image: CanvasImageSource,
  project: ScreenshotProject,
  opts: ExportImageOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const L = screenshotLayout(project, opts.scale);
  const canvas = document.createElement("canvas");
  canvas.width = L.out.w;
  canvas.height = L.out.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available.");
  if (opts.format === "jpeg") {
    // JPG has no transparency: fill white behind a transparent background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, L.out.w, L.out.h);
  }
  const jpegBase = opts.format === "jpeg";
  if (jpegBase) {
    const tmp = document.createElement("canvas");
    tmp.width = L.out.w;
    tmp.height = L.out.h;
    const t = tmp.getContext("2d")!;
    renderScreenshot(t, image, project, L);
    ctx.drawImage(tmp, 0, 0);
  } else {
    renderScreenshot(ctx, image, project, L);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, FORMAT_MIME[opts.format], opts.format === "png" ? undefined : opts.quality));
  if (!blob) throw new Error("The image couldn't be encoded.");
  return { blob, width: L.out.w, height: L.out.h };
}
