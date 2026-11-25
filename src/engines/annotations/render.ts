import { annotationOpacity, type Annotation } from "./types";

export interface ViewMapping {
  /** Source frame size (px). */
  source: { w: number; h: number };
  /** Part of the source drawn (px) — zoomed/cropped. */
  src: { x: number; y: number; w: number; h: number };
  /** Where it's drawn on the output (px). */
  dst: { x: number; y: number; w: number; h: number };
}

/** Normalised source point → output pixel (not clamped; drawing is clipped to the video area). */
export function toOutput(v: ViewMapping, nx: number, ny: number): { x: number; y: number } {
  return {
    x: v.dst.x + ((nx * v.source.w - v.src.x) / v.src.w) * v.dst.w,
    y: v.dst.y + ((ny * v.source.h - v.src.y) / v.src.h) * v.dst.h,
  };
}

/** Output pixel → normalised source point (inverse of toOutput). */
export function fromOutput(v: ViewMapping, x: number, y: number): { x: number; y: number } {
  return {
    x: (v.src.x + ((x - v.dst.x) / v.dst.w) * v.src.w) / v.source.w,
    y: (v.src.y + ((y - v.dst.y) / v.dst.h) * v.src.h) / v.source.h,
  };
}

let fontFamily = "Inter, ui-sans-serif, system-ui, sans-serif";
/** The page's loaded UI font (next/font gives it a generated family name). */
export function setAnnotationFont(family: string) {
  if (family) fontFamily = family;
}

let pixelCanvas: HTMLCanvasElement | null = null;
function pixelCtx(w: number, h: number): CanvasRenderingContext2D | null {
  pixelCanvas ??= document.createElement("canvas");
  if (pixelCanvas.width !== w) pixelCanvas.width = w;
  if (pixelCanvas.height !== h) pixelCanvas.height = h;
  return pixelCanvas.getContext("2d");
}

export function textFont(a: Pick<Annotation, "bold" | "fontSize">, short: number, zoomScale = 1): { font: string; px: number } {
  const px = Math.max(8, a.fontSize * short * Math.sqrt(zoomScale));
  return { font: `${a.bold ? 700 : 500} ${px}px ${fontFamily}`, px };
}

/** Bounding box (output px) of a text annotation: needed for selection handles. */
export function measureText(ctx: CanvasRenderingContext2D, a: Annotation, v: ViewMapping, short: number, zoomScale = 1) {
  const { font, px } = textFont(a, short, zoomScale);
  ctx.save();
  ctx.font = font;
  const lines = (a.text || " ").split("\n");
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  const pad = a.background ? px * 0.4 : 0;
  const p = toOutput(v, a.x, a.y);
  return { x: p.x, y: p.y, w: width + pad * 2, h: lines.length * px * 1.25 + pad * 2, px, pad, lines, font };
}

/**
 * Draws all annotations visible at source time t, clipped to the video area.
 * `screen` is the source video (blur samples its pixels).
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  list: readonly Annotation[],
  t: number,
  v: ViewMapping,
  screen: CanvasImageSource,
  short: number,
  zoomScale = 1,
): void {
  const visible = list.filter((a) => annotationOpacity(a, t) > 0);
  if (visible.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.dst.x, v.dst.y, v.dst.w, v.dst.h);
  ctx.clip();
  // Blurs first, so outlines and text can sit on top of them.
  const order = [...visible].sort((a, b) => Number(b.kind === "blur") - Number(a.kind === "blur"));
  for (const a of order) {
    ctx.save();
    ctx.globalAlpha = annotationOpacity(a, t);
    drawOne(ctx, a, v, screen, short, zoomScale);
    ctx.restore();
  }
  ctx.restore();
}

function drawOne(ctx: CanvasRenderingContext2D, a: Annotation, v: ViewMapping, screen: CanvasImageSource, short: number, zoomScale: number) {
  const lw = Math.max(1, a.stroke * short * Math.sqrt(zoomScale));
  const p0 = toOutput(v, a.x, a.y);
  const p1 = toOutput(v, a.x + a.w, a.y + a.h);
  const box = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };

  switch (a.kind) {
    case "blur": {
      // Pixelate: sample the original pixels into a tiny canvas, then scale up without smoothing.
      const block = Math.max(6, short / 70);
      const sw = Math.max(1, Math.ceil(box.w / block));
      const sh = Math.max(1, Math.ceil(box.h / block));
      const pc = pixelCtx(sw, sh);
      if (!pc || box.w < 1 || box.h < 1) return;
      const sx = Math.min(a.x, a.x + a.w) * v.source.w;
      const sy = Math.min(a.y, a.y + a.h) * v.source.h;
      pc.imageSmoothingEnabled = true;
      pc.drawImage(screen, sx, sy, Math.abs(a.w) * v.source.w, Math.abs(a.h) * v.source.h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelCanvas!, 0, 0, sw, sh, box.x, box.y, box.w, box.h);
      ctx.imageSmoothingEnabled = true;
      return;
    }
    case "highlight":
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(box.h, box.w) * 0.15);
      ctx.fill();
      return;
    case "rect":
      ctx.strokeStyle = a.color;
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(lw * 2, box.w / 2, box.h / 2));
      ctx.stroke();
      return;
    case "ellipse":
      ctx.strokeStyle = a.color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, Math.max(1, box.w / 2), Math.max(1, box.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case "arrow": {
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const head = Math.min(len * 0.45, Math.max(lw * 4, short * 0.025));
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x - Math.cos(ang) * head * 0.8, p1.y - Math.sin(ang) * head * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x - Math.cos(ang - 0.45) * head, p1.y - Math.sin(ang - 0.45) * head);
      ctx.lineTo(p1.x - Math.cos(ang + 0.45) * head, p1.y - Math.sin(ang + 0.45) * head);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "text": {
      const m = measureText(ctx, a, v, short, zoomScale);
      if (a.background) {
        ctx.fillStyle = a.background;
        ctx.beginPath();
        ctx.roundRect(m.x, m.y, m.w, m.h, m.px * 0.3);
        ctx.fill();
      }
      ctx.font = m.font;
      ctx.fillStyle = a.color;
      ctx.textBaseline = "top";
      m.lines.forEach((line, i) => ctx.fillText(line, m.x + m.pad, m.y + m.pad + i * m.px * 1.25 + m.px * 0.1));
      return;
    }
  }
}
