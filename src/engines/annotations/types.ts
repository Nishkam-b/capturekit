/**
 * Annotations drawn on top of the screen video. Positions are normalised to the
 * full source frame (so they stay on the same content through crop and zoom);
 * times are source ms (so cuts don't move them).
 */

export type AnnotationKind = "text" | "arrow" | "rect" | "ellipse" | "highlight" | "blur" | "image";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  start: number;
  end: number;
  /** Box kinds: top-left + size. Arrow: tail at (x, y), head at (x + w, y + h). Text: top-left anchor. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Line width as a fraction of the output's short side. */
  stroke: number;
  text: string;
  /** Font size as a fraction of the output's short side. */
  fontSize: number;
  bold: boolean;
  /** Text background pill colour, or null for none. */
  background: string | null;
  /** Image annotations: id of the stored image (media `overlay/<imageId>`). */
  imageId?: string;
}

export const ANNOTATION_FADE_MS = 150;
export const ANNOTATION_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#111827", "#ffffff"];

const BASE: Omit<Annotation, "id" | "kind" | "start" | "end"> = {
  x: 0.35,
  y: 0.35,
  w: 0.3,
  h: 0.2,
  color: "#ef4444",
  stroke: 0.006,
  text: "",
  fontSize: 0.05,
  bold: true,
  background: null,
};

export function createAnnotation(kind: AnnotationKind, id: string, start: number, sourceDurationMs: number): Annotation {
  // Start one fade earlier so it is fully visible at the playhead where it was added.
  const from = Math.max(0, start - ANNOTATION_FADE_MS);
  const a: Annotation = { ...BASE, id, kind, start: Math.round(from), end: Math.round(Math.min(sourceDurationMs, from + 3000)) };
  switch (kind) {
    case "text":
      return { ...a, x: 0.3, y: 0.4, w: 0, h: 0, text: "Your text", color: "#ffffff", background: "#111827" };
    case "arrow":
      return { ...a, x: 0.3, y: 0.3, w: 0.2, h: 0.15 };
    case "highlight":
      return { ...a, color: "#facc15", h: 0.08 };
    case "blur":
      return { ...a, color: "#000000" };
    default:
      return a;
  }
}

/** 0..1 opacity at source time t (short fade in and out). */
export function annotationOpacity(a: Pick<Annotation, "start" | "end">, t: number): number {
  if (t < a.start || t > a.end) return 0;
  return Math.min(1, (t - a.start) / ANNOTATION_FADE_MS, (a.end - t) / ANNOTATION_FADE_MS);
}

export type Handle = "move" | "nw" | "ne" | "sw" | "se" | "from" | "to";

/** Moves or resizes an annotation by (dx, dy) in normalised source units, relative to `start`. */
export function dragAnnotation(start: Annotation, handle: Handle, dx: number, dy: number): Annotation {
  const a = { ...start };
  switch (handle) {
    case "move":
      a.x = start.x + dx;
      a.y = start.y + dy;
      break;
    case "from": // arrow tail moves, head stays
      a.x = start.x + dx;
      a.y = start.y + dy;
      a.w = start.w - dx;
      a.h = start.h - dy;
      break;
    case "to":
      a.w = start.w + dx;
      a.h = start.h + dy;
      break;
    case "nw":
      a.x = start.x + dx;
      a.y = start.y + dy;
      a.w = start.w - dx;
      a.h = start.h - dy;
      break;
    case "ne":
      a.y = start.y + dy;
      a.w = start.w + dx;
      a.h = start.h - dy;
      break;
    case "sw":
      a.x = start.x + dx;
      a.w = start.w - dx;
      a.h = start.h + dy;
      break;
    case "se":
      a.w = start.w + dx;
      a.h = start.h + dy;
      break;
  }
  return a.kind === "arrow" || a.kind === "text" ? a : normalizeBox(a);
}

/** Box kinds: flip negative sizes and enforce a minimum size. */
export function normalizeBox(a: Annotation, min = 0.01): Annotation {
  let { x, y, w, h } = a;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { ...a, x, y, w: Math.max(min, w), h: Math.max(min, h) };
}

export const KIND_LABEL: Record<AnnotationKind, string> = {
  text: "Text",
  arrow: "Arrow",
  rect: "Rectangle",
  ellipse: "Circle",
  highlight: "Highlighter",
  blur: "Blur",
  image: "Image",
};
