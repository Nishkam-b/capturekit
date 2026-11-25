/**
 * Minimal animated-GIF encoder (GIF89a), dependency-free.
 * Each frame gets its own 256-colour palette (median cut on a 15-bit histogram),
 * so screen recordings with crisp UI colours stay clean. LZW per the GIF spec.
 */

export interface GifOptions {
  width: number;
  height: number;
  /** Repeat forever (true) or play once. */
  loop: boolean;
}

export class GifEncoder {
  private parts: Uint8Array[] = [];
  private readonly w: number;
  private readonly h: number;

  constructor(o: GifOptions) {
    this.w = o.width;
    this.h = o.height;
    const head = new ByteWriter();
    head.str("GIF89a");
    head.u16(o.width);
    head.u16(o.height);
    head.byte(0x70); // no global colour table, 8-bit colour resolution
    head.byte(0);
    head.byte(0);
    if (o.loop) {
      // NETSCAPE2.0 application extension: loop forever
      head.bytes([0x21, 0xff, 0x0b]);
      head.str("NETSCAPE2.0");
      head.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
    }
    this.parts.push(head.done());
  }

  /** Adds an RGBA frame shown for `delayMs`. */
  addFrame(rgba: Uint8ClampedArray, delayMs: number): void {
    const { palette, indices } = quantize(rgba, this.w * this.h);
    const out = new ByteWriter();
    // Graphic control extension: delay in 1/100 s, no transparency
    out.bytes([0x21, 0xf9, 0x04, 0x00]);
    out.u16(Math.max(2, Math.round(delayMs / 10)));
    out.bytes([0x00, 0x00]);
    // Image descriptor with a local colour table of 256 entries
    out.byte(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(this.w);
    out.u16(this.h);
    out.byte(0x87);
    out.bytes(palette);
    out.byte(8); // LZW minimum code size
    lzw(indices, out);
    out.byte(0); // block terminator
    this.parts.push(out.done());
  }

  finish(): Blob {
    this.parts.push(new Uint8Array([0x3b]));
    return new Blob(this.parts as BlobPart[], { type: "image/gif" });
  }
}

class ByteWriter {
  private buf = new Uint8Array(4096);
  private n = 0;
  private grow(k: number) {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
  }
  byte(b: number) {
    this.grow(1);
    this.buf[this.n++] = b & 0xff;
  }
  u16(v: number) {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }
  bytes(a: ArrayLike<number>) {
    this.grow(a.length);
    for (let i = 0; i < a.length; i++) this.buf[this.n++] = a[i];
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

/** 256-colour palette (768 bytes) + one index per pixel. */
export function quantize(rgba: Uint8ClampedArray, pixels: number): { palette: Uint8Array; indices: Uint8Array } {
  const hist = new Uint32Array(32768);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) hist[((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3)]++;
  const colors: number[] = [];
  for (let c = 0; c < 32768; c++) if (hist[c]) colors.push(c);

  const palette = new Uint8Array(768);
  const lookup = new Uint8Array(32768);
  const comp = (c: number, ch: number) => (c >> (10 - ch * 5)) & 31;

  let boxes: number[][] = [colors];
  if (colors.length > 256) {
    // Median cut: split the box with the widest channel range (weighted by population).
    while (boxes.length < 256) {
      let best = -1;
      let bestScore = 0;
      let bestCh = 0;
      for (let b = 0; b < boxes.length; b++) {
        const box = boxes[b];
        if (box.length < 2) continue;
        let pop = 0;
        const lo = [31, 31, 31];
        const hi = [0, 0, 0];
        for (const c of box) {
          pop += hist[c];
          for (let ch = 0; ch < 3; ch++) {
            const v = comp(c, ch);
            if (v < lo[ch]) lo[ch] = v;
            if (v > hi[ch]) hi[ch] = v;
          }
        }
        for (let ch = 0; ch < 3; ch++) {
          const score = (hi[ch] - lo[ch]) * Math.sqrt(pop);
          if (score > bestScore) {
            bestScore = score;
            best = b;
            bestCh = ch;
          }
        }
      }
      if (best < 0) break;
      const box = boxes[best].sort((a, b) => comp(a, bestCh) - comp(b, bestCh));
      // split at the population median
      let total = 0;
      for (const c of box) total += hist[c];
      let acc = 0;
      let cut = 1;
      for (; cut < box.length - 1; cut++) {
        acc += hist[box[cut - 1]];
        if (acc >= total / 2) break;
      }
      boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
  } else {
    boxes = colors.map((c) => [c]);
  }

  boxes.forEach((box, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let pop = 0;
    for (const c of box) {
      const n = hist[c];
      r += comp(c, 0) * n;
      g += comp(c, 1) * n;
      b += comp(c, 2) * n;
      pop += n;
      lookup[c] = i;
    }
    pop = Math.max(1, pop);
    palette[i * 3] = Math.round(((r / pop) * 255) / 31);
    palette[i * 3 + 1] = Math.round(((g / pop) * 255) / 31);
    palette[i * 3 + 2] = Math.round(((b / pop) * 255) / 31);
  });

  const indices = new Uint8Array(pixels);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) indices[i] = lookup[((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3)];
  return { palette, indices };
}

/** GIF LZW with 8-bit minimum code size, written as 255-byte sub-blocks. */
function lzw(indices: Uint8Array, out: ByteWriter) {
  const CLEAR = 256;
  const EOI = 257;
  let codeSize = 9;
  let next = 258;
  // dictionary: key = prefix * 256 + byte  →  code
  let dict = new Map<number, number>();
  let bitBuf = 0;
  let bitCount = 0;
  const block: number[] = [];
  const flushBlock = () => {
    if (!block.length) return;
    out.byte(block.length);
    out.bytes(block);
    block.length = 0;
  };
  const emit = (code: number) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitCount -= 8;
      if (block.length === 255) flushBlock();
    }
  };

  emit(CLEAR);
  if (indices.length === 0) {
    emit(EOI);
  } else {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = prefix * 256 + k;
      const hit = dict.get(key);
      if (hit !== undefined) {
        prefix = hit;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(CLEAR);
        dict = new Map();
        next = 258;
        codeSize = 9;
      }
      prefix = k;
    }
    emit(prefix);
    emit(EOI);
  }
  if (bitCount > 0) block.push(bitBuf & 0xff);
  flushBlock();
}
