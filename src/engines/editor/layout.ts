import { drawAnnotations } from "../annotations/render";
import { zoomRect } from "../zoom/camera";
import type { ZoomCamera } from "../zoom/types";
import { ASPECT_RATIOS, BG_BLURRED, BG_IMAGE, DEFAULT_SCREEN, backgroundById, sceneAt, type BackgroundPreset, type EditProject, type NormRect } from "./project";
import { webcamBox, webcamRadius, zoomedWebcamBox, type WebcamStyle } from "./webcam";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResolutionPreset = "original" | "1080p" | "720p" | "preview";

/** Short-side pixels per preset. `original` uses the cropped source's short side. */
const SHORT_SIDE: Record<Exclude<ResolutionPreset, "original">, number> = { "1080p": 1080, "720p": 720, preview: 720 };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function outputAspect(project: Pick<EditProject, "aspect" | "crop">, srcW: number, srcH: number): number {
  if (project.aspect !== "source") return ASPECT_RATIOS[project.aspect];
  const w = project.crop.w * srcW;
  const h = project.crop.h * srcH;
  return h > 0 ? w / h : 16 / 9;
}

/** Output canvas size in pixels (even numbers, as video encoders require). */
export function outputSize(
  project: Pick<EditProject, "aspect" | "crop">,
  srcW: number,
  srcH: number,
  preset: ResolutionPreset,
): { w: number; h: number } {
  const aspect = outputAspect(project, srcW, srcH);
  let short: number;
  if (preset === "original") {
    short = Math.min(project.crop.w * srcW, project.crop.h * srcH);
    short = Math.min(2160, Math.max(240, short));
  } else {
    short = SHORT_SIDE[preset];
  }
  return aspect >= 1 ? { w: even(short * aspect), h: even(short) } : { w: even(short), h: even(short / aspect) };
}

export interface FrameLayout {
  out: { w: number; h: number };
  /** Full source video size (px). */
  source: { w: number; h: number };
  /** Region of the source video to draw (pixels). */
  src: Rect;
  /** Where it goes on the output (pixels). */
  dst: Rect;
  radius: number;
  /** Webcam bubble on the output, or null. */
  cam: Rect | null;
}

/** Pure geometry: where everything goes on an output frame. */
export function frameLayout(
  project: Pick<EditProject, "crop" | "fit" | "padding" | "radius" | "webcam"> & Partial<Pick<EditProject, "screen">>,
  srcW: number,
  srcH: number,
  outW: number,
  outH: number,
  hasCamera: boolean,
): FrameLayout {
  const short = Math.min(outW, outH);
  const pad = Math.round(short * Math.min(0.15, Math.max(0, project.padding)));
  const box: Rect = { x: pad, y: pad, w: outW - pad * 2, h: outH - pad * 2 };
  const crop = toPixels(project.crop, srcW, srcH);
  let src: Rect;
  let dst: Rect;

  if (project.fit === "cover") {
    // Shrink the crop to the box's aspect so it fills the box exactly.
    const boxAspect = box.w / box.h;
    const cropAspect = crop.w / crop.h;
    src =
      cropAspect > boxAspect
        ? { x: crop.x + (crop.w - crop.h * boxAspect) / 2, y: crop.y, w: crop.h * boxAspect, h: crop.h }
        : { x: crop.x, y: crop.y + (crop.h - crop.w / boxAspect) / 2, w: crop.w, h: crop.w / boxAspect };
    dst = box;
  } else {
    const scale = Math.min(box.w / crop.w, box.h / crop.h);
    const w = crop.w * scale;
    const h = crop.h * scale;
    src = crop;
    dst = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  }
  // Screen layer size and position.
  const tr = { ...DEFAULT_SCREEN, ...project.screen };
  if (tr.scale !== 1 || tr.x !== 0 || tr.y !== 0) {
    const s = Math.min(1.5, Math.max(0.3, tr.scale));
    const cx = dst.x + dst.w / 2 + tr.x * outW;
    const cy = dst.y + dst.h / 2 + tr.y * outH;
    dst = { x: cx - (dst.w * s) / 2, y: cy - (dst.h * s) / 2, w: dst.w * s, h: dst.h * s };
  }

  return {
    out: { w: outW, h: outH },
    source: { w: srcW, h: srcH },
    src,
    dst: roundRect(dst),
    radius: Math.round(short * Math.min(0.06, Math.max(0, project.radius))),
    cam: hasCamera && project.webcam.visible ? webcamBox(project.webcam, outW, outH) : null,
  };
}

function toPixels(r: NormRect, w: number, h: number): Rect {
  return { x: r.x * w, y: r.y * h, w: Math.max(1, r.w * w), h: Math.max(1, r.h * h) };
}

function roundRect(r: Rect): Rect {
  const n = (v: number) => Math.round(v) + 0; // + 0 turns -0 into 0
  return { x: n(r.x), y: n(r.y), w: n(r.w), h: n(r.h) };
}

type Ctx = CanvasRenderingContext2D;

/** Draws one output frame. Shared by the editor preview and the exporter (WYSIWYG). */
export function drawFrame(
  ctx: Ctx,
  project: EditProject,
  layout: FrameLayout,
  screen: CanvasImageSource,
  camera: (CanvasImageSource & { videoWidth?: number; videoHeight?: number }) | null,
  zoom: ZoomCamera | null = null,
  /** Source time of this frame (ms), for timed annotations. */
  timeMs = 0,
  /** Images used by the frame: uploaded background, image annotations. */
  assets: FrameAssets = {},
): void {
  const backgroundImage = assets.backgroundImage ?? null;
  const { out, dst, radius, cam } = layout;
  // Smart zoom narrows the part of the source drawn into the same destination box.
  const src = zoom ? zoomRect(layout.src, layout.source.w, layout.source.h, zoom) : layout.src;
  const view: FrameLayout = src === layout.src ? layout : { ...layout, src };
  drawBackground(ctx, project, out.w, out.h, screen, layout, backgroundImage);

  const short = Math.min(out.w, out.h);
  const scene = sceneAt(project.scenes, timeMs);
  const camReady = !!camera && (camera.videoWidth ?? 1) > 0;
  if (scene === "camera" && camReady) {
    drawFullCamera(ctx, project, out.w, out.h, camera!);
    return;
  }
  const tr = { ...DEFAULT_SCREEN, ...project.screen };
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, tr.opacity));
  if (tr.rotation) {
    const cx = dst.x + dst.w / 2;
    const cy = dst.y + dst.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (project.shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = short * 0.04;
    ctx.shadowOffsetY = short * 0.01;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(dst.x, dst.y, dst.w, dst.h, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(dst.x, dst.y, dst.w, dst.h, radius);
    ctx.clip();
  }
  ctx.drawImage(screen, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
  if (project.annotations.length) {
    drawAnnotations(ctx, project.annotations, timeMs, view, screen, short, zoom?.scale ?? 1, assets.overlays);
  }
  ctx.restore();
  ctx.restore(); // screen layer transform

  if (scene === "pip" && cam && camReady) {
    const box = project.webcam.shrinkOnZoom && zoom ? zoomedWebcamBox(cam, out.w, out.h, zoom.scale) : cam;
    drawWebcam(ctx, project.webcam, box, camera);
  }
}

/** Full-webcam layout: the camera fills the padded frame (rounded corners and mirror apply). */
function drawFullCamera(ctx: Ctx, project: EditProject, w: number, h: number, camera: CanvasImageSource & { videoWidth?: number; videoHeight?: number }) {
  const short = Math.min(w, h);
  const pad = Math.round(short * Math.min(0.15, Math.max(0, project.padding)));
  const box = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };
  const r = Math.round(short * Math.min(0.06, Math.max(0, project.radius)));
  const vw = camera.videoWidth ?? box.w;
  const vh = camera.videoHeight ?? box.h;
  const aspect = box.w / box.h;
  const sw = Math.min(vw, vh * aspect);
  const sh = sw / aspect;
  ctx.save();
  if (project.shadow) {
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = short * 0.04;
    ctx.shadowOffsetY = short * 0.01;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, r);
    ctx.fill();
    ctx.shadowColor = "transparent";
  }
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, r);
  ctx.clip();
  if (project.webcam.mirror) {
    ctx.translate(box.x * 2 + box.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(camera, (vw - sw) / 2, (vh - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
  ctx.restore();
}

export type BackgroundImage = CanvasImageSource & { width: number; height: number };

export interface FrameAssets {
  backgroundImage?: BackgroundImage | null;
  /** Decoded images for image annotations, by imageId. */
  overlays?: ReadonlyMap<string, CanvasImageSource>;
}

/** Paints the area around the video: preset, wallpaper, uploaded image or the blurred video itself. */
function drawBackground(
  ctx: Ctx,
  project: EditProject,
  w: number,
  h: number,
  screen: CanvasImageSource,
  layout: FrameLayout,
  image: BackgroundImage | null,
) {
  const blurPx = Math.round((project.backgroundBlur ?? 0) * Math.max(w, h) * 0.03);
  const filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
  if (project.background === BG_IMAGE && image && image.width > 0) {
    ctx.save();
    ctx.filter = filter;
    coverDraw(ctx, image, image.width, image.height, w, h, blurPx);
    ctx.restore();
    return;
  }
  if (project.background === BG_BLURRED) {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    // Always somewhat blurred, so it reads as a backdrop.
    ctx.filter = `blur(${Math.max(blurPx, Math.round(Math.max(w, h) * 0.02))}px) brightness(0.85)`;
    coverDraw(ctx, screen, layout.source.w, layout.source.h, w, h, Math.max(blurPx, Math.max(w, h) * 0.02));
    ctx.restore();
    return;
  }
  const bg = backgroundById(project.background === BG_IMAGE || project.background === BG_BLURRED ? "mint" : project.background);
  ctx.save();
  if (bg.blobs && blurPx > 0) ctx.filter = filter;
  paintPreset(ctx, bg, w, h);
  ctx.restore();
}

/** Fills w×h with a preset (solid, gradient, or wallpaper). Also used for swatches. */
export function paintPreset(ctx: Ctx, bg: BackgroundPreset, w: number, h: number) {
  if (bg.stops.length === 1) {
    ctx.fillStyle = bg.stops[0];
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg.stops[0]);
    g.addColorStop(1, bg.stops[1]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
  if (!bg.blobs) return;
  const long = Math.max(w, h);
  for (const [bx, by, br, color] of bg.blobs) {
    const x = bx * w;
    const y = by * h;
    const r = br * long;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.length === 9 ? `${color.slice(0, 7)}00` : "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Draws an image scaled to cover w×h (with `bleed` px extra so blurred edges don't fade). */
function coverDraw(ctx: Ctx, img: CanvasImageSource, iw: number, ih: number, w: number, h: number, bleed = 0) {
  if (!iw || !ih) return;
  const W = w + bleed * 2;
  const H = h + bleed * 2;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Webcam bubble: shape, border, shadow, mirror; the camera image is centre-cropped to the box aspect. */
export function drawWebcam(
  ctx: Ctx,
  style: WebcamStyle,
  box: Rect,
  camera: CanvasImageSource & { videoWidth?: number; videoHeight?: number },
): void {
  const vw = camera.videoWidth ?? box.w;
  const vh = camera.videoHeight ?? box.h;
  const r = webcamRadius(style.shape, box, style.roundness);
  const border = style.border > 0 ? Math.max(1, Math.round(box.h * style.border)) : 0;

  ctx.save(); // layer: opacity + rotation around the bubble's centre
  ctx.globalAlpha = Math.min(1, Math.max(0, style.opacity ?? 1));
  if (style.rotation) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((style.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.save();
  if (style.shadow) {
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = box.h * 0.08;
    ctx.shadowOffsetY = box.h * 0.02;
  }
  ctx.fillStyle = border > 0 ? style.borderColor : "#000";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, r);
  ctx.fill();
  ctx.restore();

  const inner = { x: box.x + border, y: box.y + border, w: box.w - border * 2, h: box.h - border * 2 };
  const aspect = inner.w / inner.h;
  const sw = Math.min(vw, vh * aspect);
  const sh = sw / aspect;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, Math.max(0, r - border));
  ctx.clip();
  if (style.mirror) {
    ctx.translate(inner.x * 2 + inner.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(camera, (vw - sw) / 2, (vh - sh) / 2, sw, sh, inner.x, inner.y, inner.w, inner.h);
  ctx.restore();
  ctx.restore(); // layer
}

/** Inverse of the (unzoomed) layout: output pixel → normalised source point, or null outside the video. */
export function outputToSource(layout: FrameLayout, x: number, y: number): { x: number; y: number } | null {
  const { src, dst, source } = layout;
  if (x < dst.x || y < dst.y || x > dst.x + dst.w || y > dst.y + dst.h) return null;
  return {
    x: (src.x + ((x - dst.x) / dst.w) * src.w) / source.w,
    y: (src.y + ((y - dst.y) / dst.h) * src.h) / source.h,
  };
}
