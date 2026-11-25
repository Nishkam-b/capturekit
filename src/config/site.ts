export const site = {
  name: "CaptureKit",
  by: "Nishtek",
  author: "Nishkam",
  tagline: "Free, open-source screen recorder",
  /** Set once the public repository exists. Links are hidden while null. */
  githubUrl: "https://github.com/Nishkam-b/capturekit" as string | null,
  instagram: { handle: "nishkambhatia", url: "https://www.instagram.com/nishkambhatia/" },
  version: "0.10.0",
};

/** Base path the site is served under ("" locally, "/capturekit" on GitHub Pages). */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL for a static file in public/ (plain <a href> doesn't get the base path automatically). */
export const asset = (p: string) => `${basePath}${p.startsWith("/") ? p : `/${p}`}`;

/** The packaged cursor extension (built by scripts/build-extension.mjs). */
export const extensionZip = asset("/capturekit-extension.zip");
