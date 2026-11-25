export interface FrameImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

type ImageCaptureCtor = new (track: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> };

/**
 * Grabs the current frame of a live video track as an image.
 * Uses ImageCapture.grabFrame() where available (works even when our tab is in
 * the background), falling back to drawing a <video> element.
 */
export async function grabTrackFrame(
  track: MediaStreamTrack,
  fallbackVideo?: HTMLVideoElement | null,
  mimeType = "image/png",
): Promise<FrameImage> {
  const IC = (globalThis as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  if (IC && track.readyState === "live") {
    try {
      const bitmap = await new IC(track).grabFrame();
      const out = await drawToBlob(bitmap, bitmap.width, bitmap.height, mimeType);
      bitmap.close();
      return out;
    } catch {
      // fall through to the <video> path
    }
  }
  if (fallbackVideo && fallbackVideo.videoWidth > 0) {
    return drawToBlob(fallbackVideo, fallbackVideo.videoWidth, fallbackVideo.videoHeight, mimeType);
  }
  throw new Error("No video frame available yet.");
}

/** Extracts a thumbnail from a recorded video blob. */
export async function thumbnailFromVideo(blob: Blob, maxWidth = 640): Promise<FrameImage | null> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata", 8000);
    const target = Number.isFinite(video.duration) && video.duration > 1 ? Math.min(1, video.duration / 3) : 0;
    if (target > 0) {
      video.currentTime = target;
      await once(video, "seeked", 5000);
    }
    const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    return await drawToBlob(video, w, h, "image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function drawToBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  mimeType: string,
  quality?: number,
): Promise<FrameImage> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available.");
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mimeType, quality));
  if (!blob) throw new Error("Could not encode image.");
  return { blob, width, height, mimeType: blob.type || mimeType };
}

function once(target: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video failed to load"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onEvent);
    target.addEventListener("error", onError);
  });
}
