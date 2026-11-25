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
export function webcamBox(style: Pick<WebcamStyle, "x" | "y" | "size" | "shape">, outW: number, outH: number): Rect {
  const short = Math.min(outW, outH);
  const h = Math.round(short * Math.min(0.5, Math.max(0.08, style.size)));
  const w = style.shape === "rect" ? Math.round((h * 4) / 3) : h;
  const m = short * WEBCAM_MARGIN;
  const cx = clamp(style.x * outW, m + w / 2, outW - m - w / 2);
  const cy = clamp(style.y * outH, m + h / 2, outH - m - h / 2);
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

/** Corner radius for a webcam box. */
export function webcamRadius(shape: WebcamShape, box: Rect): number {
  if (shape === "circle") return Math.min(box.w, box.h) / 2;
  return Math.min(box.w, box.h) * 0.18;
}

function clamp(v: number, lo: number, hi: number) {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}
