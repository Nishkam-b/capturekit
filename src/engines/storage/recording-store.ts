import type { RecordingMeta, ScreenshotMeta, WebcamLayout } from "../shared/types";
import { CHUNKS, MEDIA, PENDING, RECORDINGS, done, mediaKey, openDb, request, type ChunkRecord, type MediaKind } from "./db";

/**
 * Crash-safe recording storage. While recording, every MediaRecorder chunk is
 * written to IndexedDB with a `pending` record describing the session. On a
 * normal stop the pending record is turned into a RecordingMeta. If the tab
 * dies, the pending record + chunks remain and can be recovered.
 */

export type Track = ChunkRecord["track"];

export interface PendingRecording {
  id: string;
  startedAt: number;
  updatedAt: number;
  /** Active (non-paused) recording time covered by stored chunks, ms. */
  activeMs: number;
  screen: { mimeType: string; width: number; height: number; displaySurface: string | null };
  camera: { mimeType: string; width: number; height: number } | null;
  webcam: WebcamLayout;
  audio: { mic: boolean; system: boolean };
  screenshots: ScreenshotMeta[];
  bytes: number;
}

/** Name of the Web Lock held by the tab that is recording `id`. */
export const lockName = (id: string) => `capturekit-recording-${id}`;

/** Engine-facing sink (see RecordingSession). */
export class StorageSink {
  private pending: PendingRecording;
  private writes: Promise<void> = Promise.resolve();

  constructor(pending: PendingRecording) {
    this.pending = { ...pending };
  }

  get id() {
    return this.pending.id;
  }

  /** Fill in details known only after the session is created (call before begin). */
  describe(patch: Partial<Omit<PendingRecording, "id">>) {
    this.pending = { ...this.pending, ...patch };
  }

  async begin(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(PENDING, "readwrite");
    tx.objectStore(PENDING).put(this.pending);
    await done(tx);
  }

  /** Writes one chunk and bumps the pending record in a single transaction. */
  async write(track: Track, seq: number, blob: Blob, activeMs: number): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([CHUNKS, PENDING], "readwrite");
    tx.objectStore(CHUNKS).put({ recordingId: this.pending.id, track, seq, blob } satisfies ChunkRecord);
    this.pending = {
      ...this.pending,
      activeMs: Math.max(this.pending.activeMs, Math.round(activeMs)),
      updatedAt: Date.now(),
      bytes: this.pending.bytes + blob.size,
    };
    tx.objectStore(PENDING).put(this.pending);
    await done(tx);
  }

  async read(track: Track): Promise<Blob[]> {
    const db = await openDb();
    const range = IDBKeyRange.bound([this.pending.id, track, 0], [this.pending.id, track, Number.MAX_SAFE_INTEGER]);
    const recs = (await request(db.transaction(CHUNKS).objectStore(CHUNKS).getAll(range))) as ChunkRecord[];
    return recs.sort((a, b) => a.seq - b.seq).map((r) => r.blob);
  }

  /** Screenshots are saved immediately too, so they survive a crash. Serialised to keep ids ordered. */
  addScreenshot(shot: ScreenshotMeta, blob: Blob): Promise<void> {
    this.writes = this.writes.then(async () => {
      const db = await openDb();
      const tx = db.transaction([MEDIA, PENDING], "readwrite");
      tx.objectStore(MEDIA).put({ key: mediaKey(this.pending.id, `shot/${shot.id}`), recordingId: this.pending.id, blob });
      this.pending = { ...this.pending, screenshots: [...this.pending.screenshots, shot], updatedAt: Date.now() };
      tx.objectStore(PENDING).put(this.pending);
      await done(tx);
    });
    return this.writes;
  }

  get screenshots(): ScreenshotMeta[] {
    return this.pending.screenshots;
  }

  /** Waits for queued screenshot writes. */
  flush(): Promise<void> {
    return this.writes;
  }
}

export interface FinalizeInput {
  meta: RecordingMeta;
  /** Patched first chunk (duration written) per track; replaces seq 0. */
  heads: Partial<Record<Track, Blob>>;
  /** Chunks that failed to write during recording (kept in memory), written now. */
  unstored: Array<{ track: Track; seq: number; blob: Blob }>;
  media: Partial<Record<MediaKind, Blob>>;
}

/** Turns a pending recording into a saved one, atomically. */
export async function finalizeRecording({ meta, heads, unstored, media }: FinalizeInput): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RECORDINGS, CHUNKS, MEDIA, PENDING], "readwrite");
  const chunks = tx.objectStore(CHUNKS);
  for (const [track, blob] of Object.entries(heads) as [Track, Blob | undefined][]) {
    if (blob) chunks.put({ recordingId: meta.id, track, seq: 0, blob } satisfies ChunkRecord);
  }
  for (const u of unstored) chunks.put({ recordingId: meta.id, track: u.track, seq: u.seq, blob: u.blob } satisfies ChunkRecord);
  for (const [kind, blob] of Object.entries(media)) {
    if (blob) tx.objectStore(MEDIA).put({ key: mediaKey(meta.id, kind as MediaKind), recordingId: meta.id, blob });
  }
  tx.objectStore(RECORDINGS).put(meta);
  tx.objectStore(PENDING).delete(meta.id);
  await done(tx);
}

export async function getPending(id: string): Promise<PendingRecording | null> {
  const db = await openDb();
  return ((await request(db.transaction(PENDING).objectStore(PENDING).get(id))) as PendingRecording) ?? null;
}

/**
 * Pending recordings no tab is working on: their Web Lock isn't held. Without
 * the Locks API, falls back to "not updated for 20s".
 */
export async function listRecoverable(): Promise<PendingRecording[]> {
  const db = await openDb();
  const all = (await request(db.transaction(PENDING).objectStore(PENDING).getAll())) as PendingRecording[];
  if (all.length === 0) return [];
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  let held: Set<string> | null = null;
  if (locks?.query) {
    try {
      const q = await locks.query();
      held = new Set([...(q.held ?? []), ...(q.pending ?? [])].map((l) => l.name ?? ""));
    } catch {
      held = null;
    }
  }
  const now = Date.now();
  return all
    .filter((p) => (held ? !held.has(lockName(p.id)) : now - p.updatedAt > 20_000))
    .sort((a, b) => b.startedAt - a.startedAt);
}
