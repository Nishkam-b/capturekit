# Deploying CaptureKit

CaptureKit builds to a **static site** in `out/`: HTML, JS, CSS and fonts. There's no server code, database or API,
so any static host works.

```bash
npm ci
npm run build            # → out/
npm start                # serve out/ locally on http://localhost:3000
```

**Screen capture needs HTTPS** (or `localhost`). All the hosts below provide HTTPS.

## GitHub Pages (included workflow)

`.github/workflows/pages.yml` builds with `BASE_PATH=/<repository name>` and publishes on every push to `main`.

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The site appears at `https://<user>.github.io/<repository>/`.

Hosting at a domain root (a custom domain, or a `<user>.github.io` repository)? Remove the `BASE_PATH` line from the workflow.

## Netlify, Cloudflare Pages, Vercel or any static host

- Build command: `npm run build`
- Output directory: `out`
- Set `BASE_PATH` only if the site lives under a sub-path.
- Extension-less URLs (`/record`) must serve `record.html`. Netlify, Cloudflare Pages, Vercel and GitHub Pages
  do this by default.

## Building on Windows

Next.js's static exporter names prefetch files incorrectly on Windows (it nests them in folders, because the paths
use backslashes). `npm run build` runs `scripts/fix-export.mjs` afterwards to rename them, so a Windows build
behaves exactly like a Linux one. On macOS and Linux the script does nothing.

If you build in Git Bash, set `MSYS_NO_PATHCONV=1` before using `BASE_PATH=/something`. Otherwise Git Bash
rewrites the value into a Windows path and the build fails.

## Security headers

The pages include a Content-Security-Policy `<meta>` tag that blocks requests to other origins. If your host lets you
set headers, also add:

```
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), payment=(), usb=()
```

Don't block `camera`, `microphone` or `display-capture`: the app needs them.

## Cursor extension and your domain

The extension only talks to allow-listed CaptureKit origins. Add your production origin to `APP_ORIGINS` in
`extension/content.js` (for example `/^https:\/\/capturekit\.example\.com$/`), bump the version in
`extension/manifest.json`, and distribute that build (Chrome Web Store, or "Load unpacked").
Don't use a broad pattern such as `*.github.io`: any page on that domain could then use the bridge.
