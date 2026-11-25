import { WEBCAM_SIZE_RATIO, type WebcamLayout } from "../shared/types";

export type WebcamShape = "circle" | "rounded" | "rect";

/** Webcam overlay style in the editor. Position/size are relative to the output frame. */
export interface WebcamStyle {
  visible: boolean;
  /** Centre, 0..1 of output width/height. Clamped so the bubble stays inside with a margin (0/1 = hug an edge). */
  x: number;
  y: number;
  /** Height as a fraction of the output's short side (0.1..0.5). */
  size: number;
  /** circle / rounded square / rounded 4:3 rectangle. */
  shape: WebcamShape;
  /** Border width as a fraction of the bubble height (0..0.08). */
  border: number;
  borderColor: string;
  shadow: boolean;
  mirror: boolean;
  /** Gap to the frame edge, as a fraction of the short side (0..0.12). */
  margin: number;
  /** Corner roundness for rounded/rectangle shapes (0 = square corners, 0.5 = pill). */
  roundness: number;
  /** Shrinks the webcam while the screen is zoomed in, so it covers less of the action. */
  shrinkOnZoom: boolean;
}

export const DEFAULT_WEBCAM: WebcamStyle = {
  visible: true,
  x: 1,
  y: 1,
  size: WEBCAM_SIZE_RATIO.medium,
  shape: "circle",
  border: 0.025,
  borderColor: "#ffffff",
  shadow: true,
  mirror: false,
  margin: 0.04,
  roundness: 0.18,
  shrinkOnZoom: true,
};

/** From the recording-time layout (corner + S/M/L) to an editor style. */
export function webcamFromLayout(layout: WebcamLayout, visible: boolean): WebcamStyle {
  const [v, h] = layout.position.split("-");
  return {
    ...DEFAULT_WEBCAM,
    visible,
    x: h === "left" ? 0 : 1,
    y: v === "top" ? 0 : 1,
    size: WEBCAM_SIZE_RATIO[layout.size],
    shape: layout.shape,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Margin from the frame edge, as a fraction of the short side. */
export const WEBCAM_MARGIN = 0.04;

/** Webcam rectangle on an output frame (pixels), clamped inside with a margin. */
export function webcamBox(style: Pick<WebcamStyle, "x" | "y" | "size" | "shape"> & { margin?: number }, outW: number, outH: number): Rect {
  const short = Math.min(outW, outH);
  const h = Math.round(short * Math.min(0.5, Math.max(0.08, style.size)));
  const w = style.shape === "rect" ? Math.round((h * 4) / 3) : h;
  const m = short * Math.min(0.12, Math.max(0, style.margin ?? WEBCAM_MARGIN));
  const cx = clamp(style.x * outW, m + w / 2, outW - m - w / 2);
  const cy = clamp(style.y * outH, m + h / 2, outH - m - h / 2);
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

/** Corner radius for a webcam box. */
export function webcamRadius(shape: WebcamShape, box: Rect, roundness = 0.18): number {
  if (shape === "circle") return Math.min(box.w, box.h) / 2;
  return Math.min(box.w, box.h) * Math.min(0.5, Math.max(0, roundness));
}

/** Smallest the webcam gets while zoomed in (fraction of its size). */
export const ZOOM_SHRINK = 0.62;

/**
 * The webcam box while the screen is zoomed: shrinks towards the frame corner/edge it sits
 * nearest to, in step with the zoom (scale 1 → full size, scale ≥ 2 → ZOOM_SHRINK).
 */
export function zoomedWebcamBox(box: Rect, outW: number, outH: number, zoomScale: number): Rect {
  const k = Math.min(1, Math.max(0, zoomScale - 1));
  if (k <= 0) return box;
  const f = 1 - (1 - ZOOM_SHRINK) * k;
  const w = box.w * f;
  const h = box.h * f;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Anchor: the box edge nearest the frame edge stays put.
  const ax = cx < outW / 3 ? box.x : cx > (outW * 2) / 3 ? box.x + box.w : cx;
  const ay = cy < outH / 3 ? box.y : cy > (outH * 2) / 3 ? box.y + box.h : cy;
  const x = ax === box.x ? box.x : ax === box.x + box.w ? ax - w : cx - w / 2;
  const y = ay === box.y ? box.y : ay === box.y + box.h ? ay - h : cy - h / 2;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function clamp(v: number, lo: number, hi: number) {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}
