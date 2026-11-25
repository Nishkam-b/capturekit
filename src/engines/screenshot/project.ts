import type { Annotation } from "../annotations/types";
import type { NormRect } from "../editor/project";

export type FrameKind = "none" | "browser" | "browser-dark" | "window" | "phone";
export type CanvasAspect = "auto" | "16:9" | "1:1" | "4:5" | "9:16";

export const CANVAS_ASPECTS: Record<Exclude<CanvasAspect, "auto">, number> = {
  "16:9": 16 / 9,
  "1:1": 1,
  "4:5": 4 / 5,
  "9:16": 9 / 16,
};

export interface ScreenshotProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source: { kind: "import" | "capture" | "recording"; recordingId?: string };
  imageW: number;
  imageH: number;
  crop: NormRect;
  /** Static annotations (start/end span the whole image). */
  annotations: Annotation[];
  /** Background preset id, or "none" for transparent. */
  background: string;
  /** Space around the image, as a fraction of its longer side (0..0.25). */
  padding: number;
  /** Corner radius, as a fraction of the framed image's shorter side (0..0.1). */
  radius: number;
  shadow: boolean;
  frame: FrameKind;
  aspect: CanvasAspect;
}

export function createScreenshotProject(
  id: string,
  name: string,
  imageW: number,
  imageH: number,
  source: ScreenshotProject["source"],
): ScreenshotProject {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    source,
    imageW,
    imageH,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    annotations: [],
    background: "mint",
    padding: 0.06,
    radius: 0.02,
    shadow: true,
    frame: "none",
    aspect: "auto",
  };
}

/** Annotations on a still image are always visible. */
export const STATIC_START = 0;
export const STATIC_END = Number.MAX_SAFE_INTEGER;
