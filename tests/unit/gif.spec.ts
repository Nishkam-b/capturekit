import { expect, test } from "@playwright/test";
import { GifEncoder, quantize } from "../../src/engines/editor/gif";

test.describe("GIF encoder", () => {
  test("writes a valid GIF89a with a loop block and one image per frame", async () => {
    const w = 64;
    const h = 32;
    const enc = new GifEncoder({ width: w, height: h, loop: true });
    for (let f = 0; f < 3; f++) {
      const px = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        px[i * 4] = (i * 7 + f * 40) % 256;
        px[i * 4 + 1] = (i * 3) % 256;
        px[i * 4 + 2] = f * 80;
        px[i * 4 + 3] = 255;
      }
      enc.addFrame(px, 100);
    }
    const bytes = new Uint8Array(await enc.finish().arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
    expect(bytes[6] | (bytes[7] << 8)).toBe(w);
    expect(bytes[8] | (bytes[9] << 8)).toBe(h);
    expect(new TextDecoder().decode(bytes.slice(16, 27))).toBe("NETSCAPE2.0");
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    // three image descriptors (0x2C right after a graphic control extension)
    let images = 0;
    for (let i = 0; i < bytes.length - 8; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 8] === 0x2c) images++;
    expect(images).toBe(3);
  });

  test("quantize keeps exact colours when there are few", () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
    const { palette, indices } = quantize(px, 4);
    expect(indices[0]).toBe(indices[2]);
    const c = (i: number) => Array.from(palette.slice(indices[i] * 3, indices[i] * 3 + 3));
    expect(c(0)).toEqual([255, 0, 0]);
    expect(c(1)).toEqual([0, 255, 0]);
    expect(c(3)).toEqual([0, 0, 0]);
  });
});
