import type { NextConfig } from "next";

/**
 * CaptureKit is a fully client-side app, built as a static site (`out/`) that
 * any static host can serve (GitHub Pages, Netlify, Cloudflare Pages, a USB stick…).
 *
 * BASE_PATH: set when hosting under a sub-path, e.g. BASE_PATH=/capturekit for
 * https://<user>.github.io/capturekit.
 */
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
