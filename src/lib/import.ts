import { thumbnailFromVideo } from "@/engines/recorder/frames";
import { createId } from "@/engines/shared/format";
import type { RecordingMeta } from "@/engines/shared/types";
import { getCursorTrack, getMedia, getProject, getRecording, saveCursorTrack, saveProject, saveRecording, type MediaKind } from "@/engines/storage/db";
import { PROJECT_FILE_EXT, packProjectFile, unpackProjectFile } from "@/engines/storage/project-file";

/** Reads a video file's size, duration and whether it has sound. Rejects files the browser can't play. */
async function probeVideo(file: Blob): Promise<{ width: number; height: number; durationMs: number; audio: boolean }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "metadata";
  v.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("This browser can't play that video file. Try MP4 (H.264) or WebM."));
    });
    if (!v.videoWidth) throw new Error("That file has no video track.");
    let duration = v.duration;
    if (!Number.isFinite(duration)) {
      // Files from MediaRecorder often have no duration in the header: seek to the end to learn it.
      v.currentTime = 1e9;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      duration = v.duration;
      v.currentTime = 0;
    }
    const tracks = (v as HTMLVideoElement & { audioTracks?: { length: number } }).audioTracks;
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      durationMs: Math.round((Number.isFinite(duration) ? duration : 0) * 1000),
      // Chrome only exposes audioTracks behind a flag; when unknown, assume sound and let the waveform show it.
      audio: tracks ? tracks.length > 0 : true,
    };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Adds an existing video file to the library so it can be edited like a recording. Returns its id. */
export async function importVideoFile(file: File): Promise<string> {
  const info = await probeVideo(file);
  if (info.durationMs < 200) throw new Error("That video is too short to edit.");
  const thumb = await thumbnailFromVideo(file);
  const id = createId();
  const meta: RecordingMeta = {
    schemaVersion: 1,
    id,
    name: file.name.replace(/\.[^.]+$/, "") || "Imported video",
    createdAt: Date.now(),
    durationMs: info.durationMs,
    size: file.size + (thumb?.blob.size ?? 0),
    screen: { mimeType: file.type || "video/mp4", width: info.width, height: info.height, size: file.size, displaySurface: null },
    camera: null,
    audio: { mic: false, system: info.audio },
    screenshots: [],
    warnings: ["Imported from a file."],
  };
  await saveRecording(meta, thumb ? { screen: file, thumb: thumb.blob } : { screen: file });
  return id;
}

/** Bundles a recording with its edits into one `.capturekit` file. */
export async function exportProjectFile(recordingId: string): Promise<{ blob: Blob; filename: string }> {
  const meta = await getRecording(recordingId);
  if (!meta) throw new Error("Recording not found.");
  const kinds: MediaKind[] = ["screen", "camera", "thumb", "background", ...meta.screenshots.map((s) => `shot/${s.id}` as MediaKind)];
  const media: Record<string, Blob> = {};
  for (const k of kinds) {
    const b = await getMedia(recordingId, k);
    if (b) media[k] = b;
  }
  const blob = packProjectFile({ meta, project: await getProject(recordingId), cursor: await getCursorTrack(recordingId), media });
  const stem = meta.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "capturekit";
  return { blob, filename: `${stem}${PROJECT_FILE_EXT}` };
}

/** Opens a `.capturekit` file as a new recording in this browser. Returns its id. */
export async function importProjectFile(file: Blob): Promise<string> {
  const c = await unpackProjectFile(file);
  // Always a new id, so opening the same file twice never overwrites anything.
  const id = createId();
  const meta: RecordingMeta = { ...c.meta, id, createdAt: Date.now() };
  await saveRecording(meta, c.media as Partial<Record<MediaKind, Blob>>);
  if (c.project) await saveProject({ ...c.project, recordingId: id });
  if (c.cursor) await saveCursorTrack({ ...c.cursor, recordingId: id });
  return id;
}

export const isProjectFile = (f: File) => f.name.toLowerCase().endsWith(PROJECT_FILE_EXT);
