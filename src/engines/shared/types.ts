/** Source type the user prefers. The browser's own picker has the final say. */
export type DisplaySurfaceHint = "monitor" | "window" | "browser";

export type WebcamPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type WebcamSize = "small" | "medium" | "large";
export type WebcamShape = "circle" | "rounded";

export interface WebcamLayout {
  position: WebcamPosition;
  size: WebcamSize;
  shape: WebcamShape;
}

/** Fraction of the shorter video edge used for the webcam overlay diameter. */
export const WEBCAM_SIZE_RATIO: Record<WebcamSize, number> = {
  small: 0.18,
  medium: 0.26,
  large: 0.36,
};

export interface MediaTrackInfo {
  mimeType: string;
  width: number;
  height: number;
  size: number;
}

export interface ScreenshotMeta {
  id: string;
  /** Recording time (active ms, pauses excluded) when the screenshot was taken. */
  atMs: number;
  width: number;
  height: number;
  mimeType: string;
}

export interface RecordingMeta {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  /** Total bytes of all stored media for this recording. */
  size: number;
  screen: MediaTrackInfo & { displaySurface: string | null };
  camera: (MediaTrackInfo & { layout: WebcamLayout }) | null;
  audio: { mic: boolean; system: boolean };
  screenshots: ScreenshotMeta[];
  /** Cursor telemetry recorded alongside (stored separately in the `cursor` store). */
  cursor?: { source: "extension" | "native"; events: number } | null;
  warnings: string[];
}
