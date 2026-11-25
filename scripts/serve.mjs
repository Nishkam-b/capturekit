#!/usr/bin/env node
/**
 * Minimal static server for the exported site (`out/`). No dependencies.
 * Usage: node scripts/serve.mjs [--port 3000] [--dir out]
 * Honours BASE_PATH (same as the build) and maps /path → /path.html like most static hosts.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", arg("dir", "out"));
const port = Number(arg("port", process.env.PORT ?? 3000));
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (basePath) {
      if (!pathname.startsWith(basePath)) {
        res.writeHead(302, { Location: basePath + "/" }).end();
        return;
      }
      pathname = pathname.slice(basePath.length) || "/";
    }
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const base = path.join(root, safe);
    if (!base.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    const candidates = [base, `${base}.html`, path.join(base, "index.html")];
    let file = null;
    for (const c of candidates) {
      if (await isFile(c)) {
        file = c;
        break;
      }
    }
    const status = file ? 200 : 404;
    file ??= path.join(root, "404.html");
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    const cache = file.includes(`${path.sep}_next${path.sep}static${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(status, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, () => {
  console.log(`CaptureKit static site: http://localhost:${port}${basePath}/  (serving ${root})`);
});
