import { expect, test } from "@playwright/test";
import { patchWebmDurationBytes } from "../../src/engines/recorder/webm";

const bytes = (...xs: number[]) => Uint8Array.from(xs);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// EBML header: id 1A45DFA3, size 4, body (DocType-ish filler)
const ebml = concat(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x84), bytes(0x42, 0x82, 0x81, 0x77));
// Info: TimecodeScale = 1_000_000 (0x0F4240) + MuxingApp "Chr"
const infoBody = concat(bytes(0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40), bytes(0x4d, 0x80, 0x83, 0x43, 0x68, 0x72));
const info = concat(bytes(0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length), infoBody);
// Tracks (opaque) and a Cluster with unknown size
const tracks = concat(bytes(0x16, 0x54, 0xae, 0x6b, 0x82), bytes(0xae, 0x80));
const cluster = concat(bytes(0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff), bytes(1, 2, 3, 4, 5));

function segment(unknownSize: boolean, body: Uint8Array) {
  const size = unknownSize ? bytes(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff) : bytes(0x40, body.length); // 2-byte size
  return concat(bytes(0x18, 0x53, 0x80, 0x67), size, body);
}

/** Finds Info/Duration (float64) in a patched file. */
function readDuration(b: Uint8Array): number | null {
  for (let i = 0; i < b.length - 10; i++) {
    if (b[i] === 0x44 && b[i + 1] === 0x89 && b[i + 2] === 0x88) {
      return new DataView(b.buffer, b.byteOffset + i + 3, 8).getFloat64(0);
    }
  }
  return null;
}

test.describe("WebM duration patch", () => {
  test("inserts Duration into Info and grows Info's size (unknown-size segment)", () => {
    const file = concat(ebml, segment(true, concat(info, tracks, cluster)));
    const out = patchWebmDurationBytes(file, 4321)!;
    expect(out).not.toBeNull();
    expect(out.length).toBe(file.length + 11);
    expect(readDuration(out)).toBe(4321);
    // Info size byte updated (1-byte vint)
    const infoAt = ebml.length + 4 + 8;
    expect(out[infoAt + 4]).toBe(0x80 | (infoBody.length + 11));
    // The cluster bytes are untouched at the end
    expect(Array.from(out.subarray(out.length - 5))).toEqual([1, 2, 3, 4, 5]);
  });

  test("updates a known segment size too", () => {
    const body = concat(info, tracks, cluster);
    const file = concat(ebml, segment(false, body));
    const out = patchWebmDurationBytes(file, 1000)!;
    const segSizeAt = ebml.length + 4;
    const newSize = ((out[segSizeAt] & 0x3f) << 8) | out[segSizeAt + 1];
    expect(newSize).toBe(body.length + 11);
  });

  test("respects TimecodeScale", () => {
    const scaled = concat(bytes(0x2a, 0xd7, 0xb1, 0x83, 0x00, 0x03, 0xe8)); // 1000 ns = 1 µs units
    const inf = concat(bytes(0x15, 0x49, 0xa9, 0x66, 0x80 | scaled.length), scaled);
    const out = patchWebmDurationBytes(concat(ebml, segment(true, concat(inf, cluster))), 2)!;
    expect(readDuration(out)).toBe(2000); // 2 ms = 2000 µs
  });

  test("overwrites an existing Duration in place", () => {
    const withDur = concat(infoBody, bytes(0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0));
    const inf = concat(bytes(0x15, 0x49, 0xa9, 0x66, 0x80 | withDur.length), withDur);
    const file = concat(ebml, segment(true, concat(inf, cluster)));
    const out = patchWebmDurationBytes(file, 777)!;
    expect(out.length).toBe(file.length);
    expect(readDuration(out)).toBe(777);
  });

  test("refuses unexpected layouts", () => {
    expect(patchWebmDurationBytes(bytes(1, 2, 3, 4), 1000)).toBeNull();
    expect(patchWebmDurationBytes(concat(ebml, segment(true, cluster)), 1000)).toBeNull(); // no Info
    expect(patchWebmDurationBytes(concat(ebml, segment(true, concat(info, cluster))), 0)).toBeNull();
  });
});
