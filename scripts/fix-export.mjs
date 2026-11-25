#!/usr/bin/env node
/**
 * Works around a Next.js static-export bug on Windows.
 *
 * The exporter names prefetch segment files with
 *   `__next${segmentPath.replace(/\//g, ".")}.txt`
 * but on Windows the segment path uses backslashes, so instead of
 *   out/record/__next.record.__PAGE__.txt
 * it writes a nested folder
 *   out/record/__next.record/__PAGE__.txt
 * and the client's prefetch requests 404 (navigation still works, just slower).
 * This flattens such folders back into dotted file names. On macOS/Linux there's nothing to fix.
 */
import { readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
let moved = 0;

async function files(dir, prefix = "") {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}.${e.name}` : e.name;
    if (e.isDirectory()) list.push(...(await files(path.join(dir, e.name), rel)));
    else list.push({ from: path.join(dir, e.name), rel });
  }
  return list;
}

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "_next") continue;
    const full = path.join(dir, e.name);
    if (e.name.startsWith("__next.")) {
      for (const f of await files(full)) {
        await rename(f.from, path.join(dir, `${e.name}.${f.rel}`));
        moved++;
      }
      await rm(full, { recursive: true, force: true });
    } else {
      await walk(full);
    }
  }
}

try {
  await stat(out);
  await walk(out);
  if (moved) console.log(`fix-export: renamed ${moved} prefetch file(s) (Next.js Windows export bug)`);
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}
