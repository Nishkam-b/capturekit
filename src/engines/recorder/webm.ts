/**
 * Writes the missing Duration into a MediaRecorder WebM header, reading only
 * the head of the first chunk (no full-file read, so it's cheap for huge files).
 *
 * MediaRecorder WebM layout: EBML header → Segment (unknown size) → Info → Tracks → Clusters…
 * We add (or overwrite) Info/Duration and rewrite Info's size.
 */

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_CLUSTER = 0x1f43b675;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;

const HEAD_BYTES = 64 * 1024;

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

function readId(b: Uint8Array, pos: number): Vint | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23; // leading zeros within the byte, +1
  if (length < 1 || length > 4 || pos + length > b.length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + b[pos + i];
  return { value, length, unknown: false };
}

function readSize(b: Uint8Array, pos: number): Vint | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (length < 1 || length > 8 || pos + length > b.length) return null;
  let value = first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: allOnes };
}

/** Size vint of a fixed byte length, or null if the value doesn't fit. */
function encodeSize(value: number, length: number): Uint8Array | null {
  if (value >= 2 ** (7 * length) - 1) return null;
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (length - 1);
  return out;
}

function readUint(b: Uint8Array, pos: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[pos + i];
  return v;
}

/** Pure byte-level patch. Returns null if the layout isn't what we expect (caller keeps the original). */
export function patchWebmDurationBytes(head: Uint8Array, durationMs: number): Uint8Array | null {
  if (!(durationMs > 0)) return null;
  let pos = 0;
  const ebmlId = readId(head, pos);
  if (!ebmlId || ebmlId.value !== ID_EBML) return null;
  const ebmlSize = readSize(head, pos + ebmlId.length);
  if (!ebmlSize || ebmlSize.unknown) return null;
  pos += ebmlId.length + ebmlSize.length + ebmlSize.value;

  const segId = readId(head, pos);
  if (!segId || segId.value !== ID_SEGMENT) return null;
  const segSizePos = pos + segId.length;
  const segSize = readSize(head, segSizePos);
  if (!segSize) return null;
  pos = segSizePos + segSize.length;

  while (pos < head.length) {
    const id = readId(head, pos);
    if (!id) return null;
    const sizePos = pos + id.length;
    const size = readSize(head, sizePos);
    if (!size) return null;
    const bodyStart = sizePos + size.length;
    if (id.value === ID_CLUSTER) return null; // no Info before media data
    if (id.value !== ID_INFO) {
      if (size.unknown) return null;
      pos = bodyStart + size.value;
      continue;
    }
    if (size.unknown) return null;
    const bodyEnd = bodyStart + size.value;
    if (bodyEnd > head.length) return null;

    // Scan Info children for TimecodeScale and an existing Duration.
    let scale = 1_000_000;
    let durPos = -1;
    let durLen = 0;
    for (let p = bodyStart; p < bodyEnd; ) {
      const cid = readId(head, p);
      if (!cid) return null;
      const csize = readSize(head, p + cid.length);
      if (!csize || csize.unknown) return null;
      const cbody = p + cid.length + csize.length;
      if (cid.value === ID_TIMECODE_SCALE) scale = readUint(head, cbody, csize.value) || scale;
      if (cid.value === ID_DURATION) {
        durPos = cbody;
        durLen = csize.value;
      }
      p = cbody + csize.value;
    }
    const units = (durationMs * 1_000_000) / scale;

    if (durPos >= 0 && (durLen === 8 || durLen === 4)) {
      const out = head.slice();
      const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
      if (durLen === 8) view.setFloat64(durPos, units);
      else view.setFloat32(durPos, units);
      return out;
    }

    const durEl = new Uint8Array(11);
    durEl.set([0x44, 0x89, 0x88]);
    new DataView(durEl.buffer).setFloat64(3, units);

    const newInfoSize = encodeSize(size.value + durEl.length, size.length) ?? encodeSize(size.value + durEl.length, 8);
    if (!newInfoSize) return null;
    const delta = durEl.length + (newInfoSize.length - size.length);

    let segSizeBytes: Uint8Array | null = null;
    if (!segSize.unknown) {
      segSizeBytes = encodeSize(segSize.value + delta, segSize.length);
      if (!segSizeBytes) return null;
    }

    const parts: Uint8Array[] = [
      head.subarray(0, segSizePos),
      segSizeBytes ?? head.subarray(segSizePos, segSizePos + segSize.length),
      head.subarray(segSizePos + segSize.length, sizePos),
      newInfoSize,
      head.subarray(bodyStart, bodyEnd),
      durEl,
      head.subarray(bodyEnd),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
  return null;
}

/**
 * Returns `chunk` with the duration written into its header. `chunk` must be
 * the first piece of the file (it contains the header). Unknown layouts are
 * returned unchanged (still playable, just not seekable).
 */
export async function patchWebmHead(chunk: Blob, durationMs: number): Promise<Blob> {
  try {
    const headLen = Math.min(chunk.size, HEAD_BYTES);
    const head = new Uint8Array(await chunk.slice(0, headLen).arrayBuffer());
    const patched = patchWebmDurationBytes(head, durationMs);
    if (!patched) return chunk;
    return new Blob([patched as BlobPart, chunk.slice(headLen)], { type: chunk.type });
  } catch {
    return chunk;
  }
}
