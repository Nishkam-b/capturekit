import type { AudioTrack } from "./audio-tracks";
import { DEFAULT_ZOOM, normalizeZoom, type ZoomSettings } from "../zoom/types";
import type { Annotation } from "../annotations/types";
import type { RecordingMeta } from "../shared/types";
import { DEFAULT_WEBCAM, webcamFromLayout, type WebcamStyle } from "./webcam";

export type AspectPreset = "source" | "16:9" | "9:16" | "1:1" | "4:5";
export type FitMode = "contain" | "cover";

export const ASPECT_RATIOS: Record<Exclude<AspectPreset, "source">, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

/** A piece of the source recording, in source milliseconds. Clips play back-to-back. */
export interface Clip {
  id: string;
  start: number;
  end: number;
  /** Playback speed (1 = normal). A 2× clip takes half as long in the output. */
  speed?: number;
}

/** Speeds offered in the editor. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

/** Rectangle in normalised source coordinates (0..1). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackgroundPreset {
  id: string;
  label: string;
  /** One colour = solid; two = diagonal gradient. */
  stops: [string] | [string, string];
  /** Wallpapers: soft colour blobs over the gradient [x, y, radius (of the long side), colour]. */
  blobs?: Array<[number, number, number, string]>;
}

/** Special backgrounds that aren't presets. */
export const BG_IMAGE = "image";
export const BG_BLURRED = "blurred";

export const BACKGROUNDS: BackgroundPreset[] = [
  { id: "ink", label: "Ink", stops: ["#0f172a"] },
  { id: "white", label: "White", stops: ["#ffffff"] },
  { id: "mist", label: "Mist", stops: ["#f1f5f9"] },
  { id: "mint", label: "Mint", stops: ["#d1fae5", "#a7f3d0"] },
  { id: "emerald", label: "Emerald", stops: ["#10b981", "#047857"] },
  { id: "sky", label: "Sky", stops: ["#bae6fd", "#818cf8"] },
  { id: "sunset", label: "Sunset", stops: ["#fdba74", "#f472b6"] },
  { id: "night", label: "Night", stops: ["#1e293b", "#4c1d95"] },
  // Wallpapers (drawn procedurally, so they stay sharp at any size).
  { id: "aurora", label: "Aurora", stops: ["#0b1120", "#0f2a3d"], blobs: [[0.2, 0.25, 0.55, "#10b98199"], [0.8, 0.3, 0.5, "#6366f188"], [0.55, 0.95, 0.6, "#06b6d466"]] },
  { id: "dusk", label: "Dusk", stops: ["#312e81", "#7c2d12"], blobs: [[0.15, 0.85, 0.6, "#f9731699"], [0.85, 0.15, 0.55, "#db277799"], [0.5, 0.5, 0.35, "#a855f744"]] },
  { id: "lagoon", label: "Lagoon", stops: ["#ecfeff", "#cffafe"], blobs: [[0.1, 0.1, 0.5, "#67e8f9aa"], [0.9, 0.9, 0.6, "#34d399aa"], [0.85, 0.15, 0.35, "#a5b4fc88"]] },
  { id: "candy", label: "Candy", stops: ["#fdf2f8", "#fae8ff"], blobs: [[0.2, 0.8, 0.55, "#f9a8d4bb"], [0.8, 0.2, 0.55, "#c4b5fdbb"], [0.6, 0.7, 0.3, "#fde68a99"]] },
  { id: "forest", label: "Forest", stops: ["#052e16", "#14532d"], blobs: [[0.75, 0.2, 0.6, "#22c55e66"], [0.2, 0.9, 0.5, "#84cc1655"]] },
  { id: "graphite", label: "Graphite", stops: ["#18181b", "#27272a"], blobs: [[0.5, 0.0, 0.7, "#52525b66"], [0.1, 1, 0.5, "#3f3f4666"]] },
];

export interface EditProject {
  schemaVersion: 1;
  recordingId: string;
  updatedAt: number;
  /** Source length the project was created against (ms). */
  sourceDurationMs: number;
  clips: Clip[];
  crop: NormRect;
  aspect: AspectPreset;
  fit: FitMode;
  background: string;
  /** Space around the video, as a fraction of the output's short side (0..0.15). */
  padding: number;
  /** Corner radius, as a fraction of the output's short side (0..0.06). */
  radius: number;
  shadow: boolean;
  webcam: WebcamStyle;
  audio: { volume: number; muted: boolean };
  /** Manual zooms (segments + settings). */
  zoom: ZoomSettings;
  /** Screen layer: size, position, opacity, rotation (corner curve is `radius`). */
  screen?: LayerTransform;
  /** Multicam layout switches over time (source ms). Before the first switch: screen + webcam. */
  scenes?: SceneCut[];
  /** Text, arrows, shapes, highlighter and blur, drawn over the screen. */
  annotations: Annotation[];
  /** 0..1 blur applied to the background (wallpaper, uploaded image or blurred video). */
  backgroundBlur?: number;
  /** Extra audio (music, voice-over) laid over the edit. Files are stored as media `audio/<id>`. */
  audioTracks?: AudioTrack[];
}

export const FULL_CROP: NormRect = { x: 0, y: 0, w: 1, h: 1 };

/** Size, position, opacity and rotation of a layer. */
export interface LayerTransform {
  /** Size multiplier (0.3–1.5). */
  scale: number;
  /** Offset from the centred position, as a fraction of the output width / height (−0.5…0.5). */
  x: number;
  y: number;
  /** 0..1 */
  opacity: number;
  /** Degrees (−180…180). */
  rotation: number;
}

export const DEFAULT_SCREEN: LayerTransform = { scale: 1, x: 0, y: 0, opacity: 1, rotation: 0 };

/** Multicam layouts: screen with the webcam on top, the webcam alone (full frame), or the screen alone. */
export type SceneLayout = "pip" | "camera" | "screen";
export const SCENE_LABEL: Record<SceneLayout, string> = { pip: "Screen + webcam", camera: "Full webcam", screen: "Screen only" };

export interface SceneCut {
  id: string;
  /** Source time (ms) at which this layout starts. */
  at: number;
  layout: SceneLayout;
}

/** Layout at source time t. */
export function sceneAt(scenes: readonly SceneCut[] | undefined, t: number): SceneLayout {
  let layout: SceneLayout = "pip";
  let at = -Infinity;
  for (const c of scenes ?? []) {
    if (c.at <= t && c.at >= at) {
      layout = c.layout;
      at = c.at;
    }
  }
  return layout;
}

/** Sets the layout from source time `at` on (replacing a switch within 150 ms); removes switches that change nothing. */
export function setSceneAt(scenes: readonly SceneCut[] | undefined, at: number, layout: SceneLayout, id: string): SceneCut[] {
  const list = (scenes ?? []).filter((c) => Math.abs(c.at - at) > 150);
  list.push({ id, at: Math.max(0, Math.round(at)), layout });
  list.sort((a, b) => a.at - b.at);
  const out: SceneCut[] = [];
  let prev: SceneLayout = "pip";
  for (const c of list) {
    if (c.layout === prev) continue;
    out.push(c);
    prev = c.layout;
  }
  return out;
}

/** True when any part of the edit shows the full webcam. */
export const usesCameraScene = (p: Pick<EditProject, "scenes">) => (p.scenes ?? []).some((c) => c.layout === "camera");

export function createProject(meta: RecordingMeta, sourceDurationMs = meta.durationMs): EditProject {
  return {
    schemaVersion: 1,
    recordingId: meta.id,
    updatedAt: Date.now(),
    sourceDurationMs,
    clips: [{ id: "c1", start: 0, end: Math.max(1, Math.round(sourceDurationMs)) }],
    crop: { ...FULL_CROP },
    aspect: "source",
    fit: "contain",
    background: "mint",
    padding: 0,
    radius: 0,
    shadow: false,
    webcam: meta.camera ? webcamFromLayout(meta.camera.layout, true) : { ...DEFAULT_WEBCAM, visible: false },
    audio: { volume: 1, muted: false },
    zoom: structuredClone(DEFAULT_ZOOM),
    screen: { ...DEFAULT_SCREEN },
    annotations: [],
  };
}

export function backgroundById(id: string): BackgroundPreset {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}

/** Keeps a crop rectangle inside the frame and above a minimum size. */
export function clampCrop(r: NormRect, min = 0.05): NormRect {
  const w = Math.min(1, Math.max(min, r.w));
  const h = Math.min(1, Math.max(min, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/** Fills in fields added after a project was saved (older versions). */
export function normalizeProject(p: EditProject): EditProject {
  const z = (p as Partial<EditProject>).zoom;
  // v0.2–v0.5 stored { visible, layout: corner + S/M/L }.
  const w = p.webcam as Partial<WebcamStyle> & { layout?: Parameters<typeof webcamFromLayout>[0] };
  const webcam: WebcamStyle = w.layout && w.x === undefined ? webcamFromLayout(w.layout, w.visible ?? true) : { ...DEFAULT_WEBCAM, ...w };
  const { cursor: _legacyCursor, ...rest } = p as EditProject & { cursor?: unknown };
  void _legacyCursor;
  return {
    ...rest,
    zoom: normalizeZoom(z),
    screen: { ...DEFAULT_SCREEN, ...p.screen },
    webcam,
    annotations: (p as Partial<EditProject>).annotations ?? [],
  };
}
