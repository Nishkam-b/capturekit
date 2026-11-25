import { drawAnnotations, type ViewMapping } from "../annotations/render";
import { backgroundById } from "../editor/project";
import { CANVAS_ASPECTS, type ScreenshotProject } from "./project";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotLayout {
  out: { w: number; h: number };
  /** Outer box of the frame (or the image when there's no frame). */
  frame: Rect;
  /** Where the (cropped) image is drawn. */
  content: Rect;
  /** Cropped region of the image (image px). */
  src: Rect;
  /** Height of a browser/window title bar, or phone bezel width. */
  chrome: number;
  /** Outer corner radius of the frame box. */
  radius: number;
}

/** Largest output side we produce (browser canvas limits). */
export const MAX_SIDE = 8192;

/**
 * Pure geometry for a screenshot composition. `scale` multiplies the natural
 * size (crop at 1 image px = 1 output px); the result is capped at MAX_SIDE.
 */
export function screenshotLayout(p: Pick<ScreenshotProject, "crop" | "padding" | "radius" | "frame" | "aspect" | "background" | "imageW" | "imageH">, scale = 1): ShotLayout {
  // Whole pixels, so every derived size is an integer (a 1:1 canvas stays exactly square at any scale).
  const sx = Math.round(p.crop.x * p.imageW);
  const sy = Math.round(p.crop.y * p.imageH);
  const src = { x: sx, y: sy, w: Math.max(1, Math.min(p.imageW - sx, Math.round(p.crop.w * p.imageW))), h: Math.max(1, Math.min(p.imageH - sy, Math.round(p.crop.h * p.imageH))) };
  let cw = src.w;
  let ch = src.h;

  let chrome = 0;
  let frameW = cw;
  let frameH = ch;
  if (p.frame === "browser" || p.frame === "browser-dark" || p.frame === "window") {
    chrome = Math.round(Math.max(24, cw * 0.045));
    frameH = ch + chrome;
  } else if (p.frame === "phone") {
    chrome = Math.round(Math.max(10, Math.min(cw, ch) * 0.045));
    frameW = cw + chrome * 2;
    frameH = ch + chrome * 2;
  }

  const pad = p.background === "none" ? 0 : Math.round(Math.max(frameW, frameH) * Math.min(0.25, Math.max(0, p.padding)));
  let outW = frameW + pad * 2;
  let outH = frameH + pad * 2;
  if (p.aspect !== "auto") {
    const r = CANVAS_ASPECTS[p.aspect];
    if (outW / outH < r) outW = Math.round(outH * r);
    else outH = Math.round(outW / r);
  }

  // Scale everything (export resolution), capped.
  const k = Math.min(scale, MAX_SIDE / Math.max(outW, outH));
  const s = (v: number) => Math.round(v * k);
  const W = s(outW);
  const H = s(outH);
  const fw = s(frameW);
  const fh = s(frameH);
  const frame = { x: Math.round((W - fw) / 2), y: Math.round((H - fh) / 2), w: fw, h: fh };
  cw = s(cw);
  ch = s(ch);
  const ck = s(chrome);
  const content =
    p.frame === "phone"
      ? { x: frame.x + ck, y: frame.y + ck, w: fw - ck * 2, h: fh - ck * 2 }
      : { x: frame.x, y: frame.y + ck, w: fw, h: fh - ck };
  const radius =
    p.frame === "phone" ? Math.round(Math.min(fw, fh) * 0.12) : Math.round(Math.min(fw, fh) * Math.min(0.1, Math.max(0, p.radius)));
  return { out: { w: W, h: H }, frame, content, src, chrome: ck, radius };
}

/** Draws the full composition. `mode: "crop"` draws just the whole image (for the crop tool). */
export function renderScreenshot(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  p: ScreenshotProject,
  L: ShotLayout,
  mode: "full" | "crop" = "full",
): void {
  const { out, frame, content, src, chrome, radius } = L;
  ctx.clearRect(0, 0, out.w, out.h);
  if (mode === "crop") {
    ctx.drawImage(image, 0, 0, out.w, out.h);
    return;
  }

  if (p.background !== "none") {
    const bg = backgroundById(p.background);
    if (bg.stops.length === 1) ctx.fillStyle = bg.stops[0];
    else {
      const g = ctx.createLinearGradient(0, 0, out.w, out.h);
      g.addColorStop(0, bg.stops[0]);
      g.addColorStop(1, bg.stops[1]);
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, out.w, out.h);
  }

  const short = Math.min(frame.w, frame.h);
  const darkChrome = p.frame === "browser-dark" || p.frame === "phone";

  // Frame body + shadow
  ctx.save();
  if (p.shadow) {
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = short * 0.06;
    ctx.shadowOffsetY = short * 0.02;
  }
  ctx.fillStyle = p.frame === "none" ? "#ffffff" : darkChrome ? (p.frame === "phone" ? "#0b1220" : "#1e293b") : "#f1f5f9";
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, radius);
  ctx.fill();
  ctx.restore();

  // Title bar details
  if (p.frame === "browser" || p.frame === "browser-dark" || p.frame === "window") {
    const dot = chrome * 0.22;
    const cy = frame.y + chrome / 2;
    ["#ef4444", "#f59e0b", "#22c55e"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(frame.x + chrome * 0.6 + i * dot * 3.2, cy, dot, 0, Math.PI * 2);
      ctx.fill();
    });
    if (p.frame !== "window") {
      const bx = frame.x + chrome * 0.6 + dot * 9.5;
      const bw = Math.min(frame.w * 0.5, frame.w - (bx - frame.x) - chrome * 0.6);
      ctx.fillStyle = darkChrome ? "#334155" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(bx, cy - chrome * 0.28, Math.max(0, bw), chrome * 0.56, chrome * 0.28);
      ctx.fill();
    }
  }

  // Image, clipped to the content shape
  ctx.save();
  ctx.beginPath();
  if (p.frame === "none") ctx.roundRect(content.x, content.y, content.w, content.h, radius);
  else if (p.frame === "phone") ctx.roundRect(content.x, content.y, content.w, content.h, Math.max(0, radius - chrome));
  else ctx.roundRect(content.x, content.y, content.w, content.h, [0, 0, radius, radius]);
  ctx.clip();
  ctx.drawImage(image, src.x, src.y, src.w, src.h, content.x, content.y, content.w, content.h);
  const view: ViewMapping = { source: { w: p.imageW, h: p.imageH }, src, dst: content };
  // Still image: evaluate annotations well inside their (whole-image) time range, past any fade.
  drawAnnotations(ctx, p.annotations, 1_000_000, view, image, Math.min(content.w, content.h));
  ctx.restore();

  // Phone: speaker pill over the top of the screen
  if (p.frame === "phone") {
    const pw = content.w * 0.28;
    const ph = Math.max(6, chrome * 0.9);
    ctx.fillStyle = "#0b1220";
    ctx.beginPath();
    ctx.roundRect(content.x + (content.w - pw) / 2, content.y + chrome * 0.4, pw, ph, ph / 2);
    ctx.fill();
  }
}
