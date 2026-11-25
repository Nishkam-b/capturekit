import type { CursorTrack } from "../cursor/types";
import type { ScreenshotProject } from "../screenshot/project";
import type { EditProject } from "../editor/project";
import type { RecordingMeta } from "../shared/types";

const DB_NAME = "capturekit";
const DB_VERSION = 5;
export const RECORDINGS = "recordings";
export const MEDIA = "media";
const PROJECTS = "projects";
export const CHUNKS = "chunks";
export const PENDING = "pending";
export const CURSOR = "cursor";
export const SCREENSHOTS = "screenshots";

export type MediaKind = "screen" | "camera" | "thumb" | "image" | "background" | `shot/${string}` | `overlay/${string}` | `audio/${string}`;

interface MediaRecord {
  key: string;
  recordingId: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser (private mode may block it)."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) {
        db.createObjectStore(RECORDINGS, { keyPath: "id" }).createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS, { keyPath: ["recordingId", "track", "seq"] }).createIndex("recordingId", "recordingId");
      }
      if (!db.objectStoreNames.contains(SCREENSHOTS)) {
        db.createObjectStore(SCREENSHOTS, { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(CURSOR)) {
        db.createObjectStore(CURSOR, { keyPath: "recordingId" });
      }
      if (!db.objectStoreNames.contains(PENDING)) {
        db.createObjectStore(PENDING, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: "recordingId" });
      }
      if (!db.objectStoreNames.contains(MEDIA)) {
        db.createObjectStore(MEDIA, { keyPath: "key" }).createIndex("recordingId", "recordingId");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Could not open local storage."));
    };
  });
  return dbPromise;
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("Storage transaction failed."));
  });
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const mediaKey = (id: string, kind: MediaKind) => `${id}/${kind}`;

/** Saves metadata and media atomically. */
export async function saveRecording(meta: RecordingMeta, media: Partial<Record<MediaKind, Blob>>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RECORDINGS, MEDIA], "readwrite");
  tx.objectStore(RECORDINGS).put(meta);
  const store = tx.objectStore(MEDIA);
  for (const [kind, blob] of Object.entries(media)) {
    if (blob) store.put({ key: mediaKey(meta.id, kind as MediaKind), recordingId: meta.id, blob } satisfies MediaRecord);
  }
  await done(tx);
}

export async function updateRecordingMeta(id: string, patch: Partial<Omit<RecordingMeta, "id">>): Promise<RecordingMeta> {
  const db = await openDb();
  const tx = db.transaction(RECORDINGS, "readwrite");
  const store = tx.objectStore(RECORDINGS);
  const existing = (await request(store.get(id))) as RecordingMeta | undefined;
  if (!existing) throw new Error("Recording not found.");
  const next = { ...existing, ...patch, id };
  store.put(next);
  await done(tx);
  return next;
}

/** Newest first. */
export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await openDb();
  const all = (await request(db.transaction(RECORDINGS).objectStore(RECORDINGS).getAll())) as RecordingMeta[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(id: string): Promise<RecordingMeta | null> {
  const db = await openDb();
  return ((await request(db.transaction(RECORDINGS).objectStore(RECORDINGS).get(id))) as RecordingMeta) ?? null;
}

export interface ChunkRecord {
  recordingId: string;
  track: "screen" | "camera";
  seq: number;
  blob: Blob;
}

/** Stored chunks of one track, in order. Blobs from IndexedDB are disk-backed handles, not loaded into memory. */
export async function getChunks(id: string, track: ChunkRecord["track"]): Promise<Blob[]> {
  const db = await openDb();
  const range = IDBKeyRange.bound([id, track, 0], [id, track, Number.MAX_SAFE_INTEGER]);
  const recs = (await request(db.transaction(CHUNKS).objectStore(CHUNKS).getAll(range))) as ChunkRecord[];
  return recs.sort((a, b) => a.seq - b.seq).map((r) => r.blob);
}

/**
 * Screen/camera media: new recordings are stored as 1-second chunks (assembled
 * here into one Blob without copying); older ones as a single blob in `media`.
 */
export async function getMedia(id: string, kind: MediaKind): Promise<Blob | null> {
  if (kind === "screen" || kind === "camera") {
    const parts = await getChunks(id, kind);
    if (parts.length > 0) return new Blob(parts, { type: parts[0].type || "video/webm" });
  }
  const db = await openDb();
  const rec = (await request(db.transaction(MEDIA).objectStore(MEDIA).get(mediaKey(id, kind)))) as MediaRecord | undefined;
  return rec?.blob ?? null;
}

/** Stores (or replaces) one media blob of a recording, e.g. an uploaded editor background. */
export async function saveMedia(recordingId: string, kind: MediaKind, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MEDIA, "readwrite");
  tx.objectStore(MEDIA).put({ key: mediaKey(recordingId, kind), recordingId, blob } satisfies MediaRecord);
  await done(tx);
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RECORDINGS, MEDIA, PROJECTS, CHUNKS, PENDING, CURSOR], "readwrite");
  tx.objectStore(RECORDINGS).delete(id);
  tx.objectStore(PROJECTS).delete(id);
  tx.objectStore(PENDING).delete(id);
  tx.objectStore(CURSOR).delete(id);
  for (const store of [MEDIA, CHUNKS]) {
    const keys = await request(tx.objectStore(store).index("recordingId").getAllKeys(IDBKeyRange.only(id)));
    for (const key of keys) tx.objectStore(store).delete(key);
  }
  await done(tx);
}

export { mediaKey };

export async function getProject(recordingId: string): Promise<EditProject | null> {
  const db = await openDb();
  return ((await request(db.transaction(PROJECTS).objectStore(PROJECTS).get(recordingId))) as EditProject) ?? null;
}

export async function saveProject(project: EditProject): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PROJECTS, "readwrite");
  tx.objectStore(PROJECTS).put({ ...project, updatedAt: Date.now() });
  await done(tx);
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) return null;
  const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return { usage, quota, persisted };
}

/** Ask the browser not to evict our data. Chromium decides silently; Firefox may prompt. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function saveCursorTrack(track: CursorTrack): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CURSOR, "readwrite");
  tx.objectStore(CURSOR).put(track);
  await done(tx);
}

export async function getCursorTrack(recordingId: string): Promise<CursorTrack | null> {
  const db = await openDb();
  return ((await request(db.transaction(CURSOR).objectStore(CURSOR).get(recordingId))) as CursorTrack) ?? null;
}

// ---------------------------------------------------------------- screenshots

/** Creates or replaces a screenshot project, optionally with its source image. */
export async function saveScreenshotProject(project: ScreenshotProject, image?: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(image ? [SCREENSHOTS, MEDIA] : [SCREENSHOTS], "readwrite");
  tx.objectStore(SCREENSHOTS).put({ ...project, updatedAt: Date.now() });
  if (image) tx.objectStore(MEDIA).put({ key: mediaKey(project.id, "image"), recordingId: project.id, blob: image });
  await done(tx);
}

export async function getScreenshotProject(id: string): Promise<ScreenshotProject | null> {
  const db = await openDb();
  return ((await request(db.transaction(SCREENSHOTS).objectStore(SCREENSHOTS).get(id))) as ScreenshotProject) ?? null;
}

/** Newest first. */
export async function listScreenshotProjects(): Promise<ScreenshotProject[]> {
  const db = await openDb();
  const all = (await request(db.transaction(SCREENSHOTS).objectStore(SCREENSHOTS).getAll())) as ScreenshotProject[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteScreenshotProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([SCREENSHOTS, MEDIA], "readwrite");
  tx.objectStore(SCREENSHOTS).delete(id);
  const keys = await request(tx.objectStore(MEDIA).index("recordingId").getAllKeys(IDBKeyRange.only(id)));
  for (const key of keys) tx.objectStore(MEDIA).delete(key);
  await done(tx);
}
