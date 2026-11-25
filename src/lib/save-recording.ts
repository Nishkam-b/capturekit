import { patchWebmHead, thumbnailFromVideo, type FrameImage, type SessionResult } from "@/engines/recorder";
import { defaultRecordingName } from "@/engines/shared/format";
import type { RecordingMeta, ScreenshotMeta, WebcamLayout } from "@/engines/shared/types";
import { deleteRecording, getChunks, getCursorTrack, requestPersistentStorage, saveRecording, type MediaKind } from "@/engines/storage/db";
import { finalizeRecording, type PendingRecording, type StorageSink } from "@/engines/storage/recording-store";

export interface CapturedScreenshot extends FrameImage {
  atMs: number;
}

/**
 * Saves a finished session. With a sink the media is already in IndexedDB, so
 * this only patches headers and writes metadata (no copy of the video data).
 */
export async function persistSession(opts: {
  id: string;
  result: SessionResult;
  sink: StorageSink | null;
  webcam: WebcamLayout;
  /** Screenshots that couldn't be written during recording. */
  memoryShots: CapturedScreenshot[];
  cursor?: RecordingMeta["cursor"];
  zoomMarkers?: number[];
  startedAt: Date;
}): Promise<string> {
  const { id, result, sink, webcam, memoryShots, startedAt, cursor = null, zoomMarkers = [] } = opts;
  await sink?.flush().catch(() => undefined);
  const thumb = await thumbnailFromVideo(result.screen.blob);
  const media: Partial<Record<MediaKind, Blob>> = {};
  if (thumb) media.thumb = thumb.blob;

  const shots: ScreenshotMeta[] = [...(sink?.screenshots ?? [])];
  for (const s of memoryShots) {
    const shotId = String(shots.length + 1);
    media[`shot/${shotId}`] = s.blob;
    shots.push({ id: shotId, atMs: s.atMs, width: s.width, height: s.height, mimeType: s.mimeType });
  }

  const shotBytes = Object.entries(media).reduce((n, [, b]) => n + (b?.size ?? 0), 0);
  const meta: RecordingMeta = {
    schemaVersion: 1,
    id,
    name: defaultRecordingName(startedAt),
    createdAt: startedAt.getTime(),
    zoomMarkers: zoomMarkers.length ? zoomMarkers : undefined,
    durationMs: result.durationMs,
    size: result.screen.blob.size + (result.camera?.blob.size ?? 0) + shotBytes,
    screen: {
      mimeType: result.screen.mimeType,
      width: result.screen.width,
      height: result.screen.height,
      size: result.screen.blob.size,
      displaySurface: result.screen.displaySurface,
    },
    camera: result.camera
      ? { mimeType: result.camera.mimeType, width: result.camera.width, height: result.camera.height, size: result.camera.blob.size, layout: webcam }
      : null,
    audio: { mic: result.hasMicAudio, system: result.hasSystemAudio },
    screenshots: shots,
    warnings: result.warnings,
    cursor,
  };

  if (sink && result.stored) {
    await finalizeRecording({ meta, heads: result.stored.heads, unstored: result.stored.unstored, media });
  } else {
    media.screen = result.screen.blob;
    if (result.camera) media.camera = result.camera.blob;
    await saveRecording(meta, media);
  }
  void requestPersistentStorage();
  return id;
}

/** Rebuilds a recording from the chunks an interrupted session left behind. */
export async function recoverPending(p: PendingRecording): Promise<string> {
  const screenParts = await getChunks(p.id, "screen");
  if (screenParts.length === 0) {
    await deleteRecording(p.id);
    throw new Error("Nothing was saved before the recording was interrupted.");
  }
  const cameraParts = p.camera ? await getChunks(p.id, "camera") : [];
  // Each chunk is ~1s; the stored activeMs is the best duration estimate.
  const durationMs = Math.max(p.activeMs, 1000);
  const heads: { screen?: Blob; camera?: Blob } = {};
  if (p.screen.mimeType.includes("webm")) heads.screen = await patchWebmHead(screenParts[0], durationMs);
  if (cameraParts.length && p.camera?.mimeType.includes("webm")) heads.camera = await patchWebmHead(cameraParts[0], durationMs);

  const screenBlob = new Blob([heads.screen ?? screenParts[0], ...screenParts.slice(1)], { type: p.screen.mimeType });
  const cameraBlob = cameraParts.length ? new Blob([heads.camera ?? cameraParts[0], ...cameraParts.slice(1)], { type: p.camera?.mimeType }) : null;
  const thumb = await thumbnailFromVideo(screenBlob);
  const cursorTrack = await getCursorTrack(p.id).catch(() => null);

  const meta: RecordingMeta = {
    schemaVersion: 1,
    id: p.id,
    name: `${defaultRecordingName(new Date(p.startedAt))} (recovered)`,
    createdAt: p.startedAt,
    durationMs,
    size: screenBlob.size + (cameraBlob?.size ?? 0) + (thumb?.blob.size ?? 0),
    screen: { mimeType: p.screen.mimeType, width: p.screen.width, height: p.screen.height, size: screenBlob.size, displaySurface: p.screen.displaySurface },
    camera:
      cameraBlob && p.camera
        ? { mimeType: p.camera.mimeType, width: p.camera.width, height: p.camera.height, size: cameraBlob.size, layout: p.webcam }
        : null,
    audio: p.audio,
    screenshots: p.screenshots,
    warnings: ["Recovered after the recording was interrupted. The last moment before the interruption may be missing."],
    cursor: cursorTrack && cursorTrack.events.length ? { source: cursorTrack.source, events: cursorTrack.events.length / 4 } : null,
  };
  await finalizeRecording({ meta, heads, unstored: [], media: thumb ? { thumb: thumb.blob } : {} });
  return p.id;
}
