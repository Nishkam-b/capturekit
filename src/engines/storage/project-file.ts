import type { EditProject } from "../editor/project";
import type { RecordingMeta } from "../shared/types";

/**
 * `.capturekit` project file: one portable file with the recording, its edits and
 * cursor data, so a project can be moved to another browser or computer.
 *
 * Layout: "CAPTUREKIT-PROJECT\n" · u32 header length (LE) · JSON header · media blobs in header order.
 */
const MAGIC = "CAPTUREKIT-PROJECT\n";
export const PROJECT_FILE_EXT = ".capturekit";

export interface ProjectFileHeader {
  format: 1;
  meta: RecordingMeta;
  project: EditProject | null;
  /** Unused since v0.12 (kept in the format; always null). */
  cursor?: null;
  media: Array<{ kind: string; type: string; size: number }>;
}

export interface ProjectFileContents {
  meta: RecordingMeta;
  project: EditProject | null;
  /** Unused since v0.12 (kept in the format; always null). */
  cursor?: null;
  media: Record<string, Blob>;
}

export function packProjectFile(c: ProjectFileContents): Blob {
  const entries = Object.entries(c.media);
  const header: ProjectFileHeader = {
    format: 1,
    meta: c.meta,
    project: c.project,
    cursor: null,
    media: entries.map(([kind, b]) => ({ kind, type: b.type, size: b.size })),
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.length, true);
  return new Blob([MAGIC, len, json, ...entries.map(([, b]) => b)], { type: "application/octet-stream" });
}

export async function unpackProjectFile(file: Blob): Promise<ProjectFileContents> {
  const magicLen = MAGIC.length;
  const head = new Uint8Array(await file.slice(0, magicLen + 4).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, magicLen)) !== MAGIC) throw new Error("This isn't a CaptureKit project file.");
  const jsonLen = new DataView(head.buffer).getUint32(magicLen, true);
  if (jsonLen <= 0 || jsonLen > 50_000_000) throw new Error("The project file is damaged.");
  let offset = magicLen + 4;
  let header: ProjectFileHeader;
  try {
    header = JSON.parse(await file.slice(offset, offset + jsonLen).text()) as ProjectFileHeader;
  } catch {
    throw new Error("The project file is damaged.");
  }
  if (header.format !== 1 || !header.meta?.id) throw new Error("This project file was made by a newer version of CaptureKit.");
  offset += jsonLen;
  const media: Record<string, Blob> = {};
  for (const m of header.media) {
    const end = offset + m.size;
    if (end > file.size) throw new Error("The project file is incomplete.");
    media[m.kind] = file.slice(offset, end, m.type);
    offset = end;
  }
  if (!media.screen) throw new Error("The project file has no video in it.");
  return { meta: header.meta, project: header.project, cursor: null, media };
}
