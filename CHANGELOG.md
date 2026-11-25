# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.11.0] — 2026-11-25 — Click-based auto zoom from the video, finished video after recording

### Added
- **Cursor detection in the video.** Screen and window recordings include the mouse pointer; the editor now finds it
  (motion blobs + arrow-template matching, Windows- and macOS-style cursors) and **infers clicks**: the cursor arrives,
  stops, and the screen reacts next to it. No extension needed.
- **Zooms with meaning:** one zoom per group of clicks, starting as the cursor approaches the click and fully in
  250 ms before it, following the cursor, zooming out after. Fewer zooms overall (wider grouping and merging).
- **Finished video after recording:** stopping opens the editor directly with zooms, a wallpaper background, padding,
  rounded corners and a shadow already applied, and a "Your video is ready" bar with an Export button.
- Cursor panel for recordings with a detected cursor: highlight and click effects around the real pointer.
- Help page section explaining how automatic zoom works.

### Changed
- No prompts to install the extension: the recording setup shows an "Automatic zoom" status instead, and the extension
  moved to an "Advanced" section of the Help page (only useful for browser-tab recordings).
- Recordings analysed by v0.9–v0.10 (screen activity only) are re-analysed with cursor detection when opened.
- Auto-zoom transition starts during the approach (zoom.spec timing updated).

## [0.10.0] — 2026-11-25 — Image annotations and music tracks

### Added
- **Image annotations:** put a logo, sticker or screenshot on the video (PNG, JPG, WebP, GIF, SVG), move and resize
  it on the preview, and time it on the timeline like any annotation. Images are stored with the recording.
- **Music & voice-over tracks:** add audio files in the Audio panel, set where each starts, its volume, and whether it
  repeats to the end. Tracks follow the edited timeline (across cuts and speed changes), play in the preview, and are
  mixed into MP4/WebM exports. GIFs stay silent.
- `.capturekit` project files include annotation images and audio tracks.

### Fixed
- Exporting a recording with no audio no longer plays the video's sound through the speakers while rendering.

## [0.9.0] — 2026-11-25 — Phase 8: automatic zoom for every recording, one-click extension, editor features

### Added
- **Automatic zoom without the extension.** The editor analyses screen, window and tab recordings on the device
  (low-resolution frame differences; constant animations and full-screen changes ignored) and zooms where things
  happen. Shown with progress, labelled as an estimate, saved with the recording. Auto zoom is on by default.
- **"Zoom in here"** while recording: a button in the controls, Alt+Shift+Z, and (with the extension) a browser-wide
  shortcut. Marks become manual zooms.
- **Extension download:** the extension is packaged as a zip (with icons) by a dependency-free script during the
  build; the Help page has a 3-step install with a copy button. Extension 0.3.0 adds the zoom shortcut.
- **Speed regions:** per-clip speed 0.5×–4× in the preview, timeline and export.
- **Cursor:** dark/light/dot styles, click bounce, motion blur, sway.
- **Backgrounds:** six procedural wallpapers, your own image, a blurred copy of the video, background blur.
- **Webcam:** roundness, edge margin, shrink while zoomed in.
- **GIF export** with size, frame rate and loop options (built-in encoder, no new dependency).
- **Import video** files; save and open **`.capturekit` project files**.
- Keyboard shortcut reference in the editor (**?**).
- **FAQ, privacy policy and terms** pages, and a site footer.

### Changed
- Help page: the extension is presented as optional, with the shorter install.
- Manual zooms follow the pointer only with precise (extension) cursor data.

## [0.8.0] — 2026-11-25 — Phase 7: open-source release candidate

### Added
- **Static site build** (`npm run build` → `out/`) that any static host can serve, with optional `BASE_PATH`
  for sub-path hosting, and a dependency-free local server (`npm start`).
- **Content-Security-Policy** in production builds: the browser blocks any request to another origin.
  New tests check the policy and that browsing the app makes no outside requests.
- GitHub Actions: CI (lint, typecheck, unit tests, build, Chrome browser tests) and a GitHub Pages deployment.
- Issue and pull-request templates; Dependabot.
- Docs: rewritten README with real screenshots, user guide, deployment guide, testing guide with a manual release
  checklist, release process.

### Changed
- `npm start` serves the static build instead of running a Next.js server.

## [0.7.0] — 2026-11-25 — Phase 6: screenshot editor

### Added
- **Screenshots** page: import (picker, drag-and-drop, paste), capture a screen/window/tab, list and delete.
  Imports are validated (type, size, decodable, dimensions).
- **Screenshot editor** (`/screenshots/edit`): annotations (text, arrow, rectangle, circle, highlighter, blur) edited
  on the image; crop; background presets or transparent; padding; rounded corners; shadow; canvas aspect for
  social posts; frames (browser light/dark, app window, phone/tablet device); undo/redo; auto-save; rename.
- **Export** PNG, JPG or WebP at 0.5×, 1× or 2× with quality control, live preview, size info, download and
  copy to clipboard.
- Screenshots taken during a recording open in the editor with one click.
- Screenshot engine (`src/engines/screenshot`): pure layout (unit-tested), renderer, import/capture/export helpers.
  Database version 5 adds a `screenshots` store.
- Tests: screenshot layout unit tests; e2e for import (incl. rejection), editing, all export formats, clipboard,
  editing from a recording and direct capture (Chrome, Edge).

### Changed
- The annotation side panel and preview overlay are now shared components used by both editors.

### Fixed
- Square (and other fixed-aspect) screenshot exports could be off by a pixel at 2×; crop sizes now snap to whole pixels.

## [0.6.0] — 2026-11-25 — Phase 5: webcam & visual effects

### Added
- **Webcam overlay editing:** drag the webcam anywhere on the preview, drag its corner to resize, snap to corners;
  circle / rounded / 4:3 rectangle; border width and colour; shadow; mirror. Old projects migrate automatically.
- **Annotations:** text (size, bold, colour, background pill), arrow, rectangle, ellipse, highlighter and blur
  (pixelation for hiding sensitive info). They stay attached to the screen content through crop, zoom and cuts,
  and fade in and out briefly.
- Edit annotations directly on the preview (select, move, resize, arrow endpoints); zoom pauses while annotating.
- Timeline "Notes" lane: drag to move, drag edges to change timing, overlapping notes stack into rows.
- Delete key, undo, persistence and export support for all of the above.
- Tests: webcam box and annotation unit tests; e2e for webcam editing and annotations (Chrome, Edge).

### Not included
- Webcam background replacement/blur: it needs an on-device segmentation model; the app says so.

## [0.5.0] — 2026-11-25 — Phase 4: smart zoom

### Added
- Zoom engine (`src/engines/zoom`): zoom segments in source time (survive cuts), levels 1.25–3×, follow-cursor
  or fixed-point focus, eased transitions, smooth blending of overlapping zooms. The camera never leaves the frame.
- **Automatic zoom** from cursor telemetry: zooms around clicks (and optionally pauses after movement), clusters
  nearby interactions into one calm zoom, merges short gaps, and never zooms on plain movement. On by default for
  recordings with cursor data.
- Editor **Zoom** tool: auto on/off, zoom on pauses, level, transition, hold and follow smoothness; list of zooms;
  add a zoom at the playhead (Z); per-zoom level and focus (click the preview for a fixed point); delete (Delete key).
  Deleted auto zooms stay deleted; edited auto zooms become manual.
- Timeline **zoom lane**: drag to move, drag edges to resize, ramps shaded, auto vs manual colours.
- The cursor scales gently with zoom. Preview and export use the same zoom maths.
- Tests: detection and camera unit tests; manual-zoom e2e (Chrome, Edge); auto-zoom e2e with the extension.

### Fixed
- Pause detection no longer treats the end of the data as a pause, which could have added a zoom at the very end.
- Extension: cursor events now go to the CaptureKit tab that started the recording, not whichever connected last.

## [0.4.0] — 2026-11-25 — Phase 3: cursor tracking

### Added
- **CaptureKit Cursor Tracker** browser extension (`extension/`, Manifest V3, Chrome/Edge 116+). It records
  cursor moves and clicks in the shared browser tab and identifies that tab exactly with the Capture Handle API.
  Data goes only to the CaptureKit tab, never over the network.
- Cursor telemetry engine (`src/engines/cursor`): provider interface, recording-timeline mapping (pauses
  excluded), compact storage (new `cursor` store, database version 4), crash-safe periodic saves.
- Editor **Cursor** tool: draws the cursor (tab recordings don't include it), plus size, smoothing, highlight
  circle, click ripple, hide when still and sync offset. Preview and export use the same rendering.
- Timeline cursor lane with click markers; "Cursor data" badge on recordings.
- Setup and recording screens show whether cursor tracking is available, on, or not possible.
- Help page: extension install guide and privacy notes.
- Tests: cursor path, smoothing and clock unit tests; Edge e2e with the real unpacked extension (`npm run test:extension`).

### Fixed
- The editor preview could overlap the play controls when the timeline was taller; it now sizes to the space available.

### Notes
- Corrected an earlier claim: automated screen/window/tab tests use fake-UI capture, which records a source of
  the requested type rather than the one the test names. Picking a specific source is a manual check.

## [0.3.0] — 2026-11-25 — Phase 1.5: reliability

### Added
- **Crash-safe recording:** every ~1 s chunk is saved to IndexedDB as it is recorded, so long
  recordings no longer grow memory and a closed or crashed tab loses at most about a second.
- **Recovery:** interrupted recordings are offered on the dashboard and library ("Recover" / "Discard").
  A Web Lock keeps a recording that is still running in another tab from being offered.
- **Storage checks:** the setup screen shows how many minutes fit, warns when low and blocks when
  nearly full. During recording it warns, then stops automatically and saves before space runs out.
- **Keyboard shortcuts while recording:** Alt+Shift+P pause/resume, Alt+Shift+S stop,
  Alt+Shift+C screenshot (this tab and the pop-out controls).
- Firefox smoke test (`npm run test:firefox`, opt-in).
- e2e tests for chunk saving, crash recovery, discard, live-lock, shortcuts, low storage,
  auto-stop and the database upgrade.

### Changed
- IndexedDB schema version 3 (`chunks`, `pending` stores). Older recordings remain readable.
- Replaced `fix-webm-duration` (read whole files into memory) with a 64 KB header patcher.

## [0.2.0] — 2026-11-25 — Phase 2: basic video editor

### Added
- Editor at `/editor?id=` (opened from a recording with **Edit & export**): tools panel, canvas preview,
  properties panel and timeline.
- Timeline with filmstrip thumbnails, audio waveform, webcam lane, ruler scrubbing, zoom and playhead.
- Non-destructive edits: trim clip edges, split at the playhead, delete clips, reset; undo/redo with
  keyboard shortcuts (Space, S, Delete, arrows, Ctrl+Z / Ctrl+Shift+Z).
- Crop by dragging on the preview; aspect ratios 16:9, 9:16, 1:1, 4:5 with Fit or Fill.
- Background colours and gradients, padding, corner radius, shadow.
- Webcam overlay composited into the video (show/hide, position, size, shape); volume and mute.
- Export to WebM, and to MP4 where the browser can encode it, at 1080p / 720p / original, with real
  progress, cancel, a size estimate and a preview before download. Pauses while the tab is hidden.
- Edit projects auto-save in IndexedDB (new `projects` store, database version 2).
- Unit tests for timeline and layout maths; e2e tests for the full edit + export flow in Chrome and Edge.

### Changed
- Recording page: **Edit & export** replaces the disabled Edit button; dashboard "Edit video" tool is live.

## [0.1.0] — 2026-11-25 — Phase 1: browser recorder

### Added
- Dashboard with recent recordings, storage usage and quick tools.
- Recording setup: entire screen / window / browser tab, webcam (device, position,
  size, shape, live preview), microphone (device, live level meter), system/tab audio
  where supported, optional 3-second countdown. Capabilities are detected at runtime and
  unavailable options are explained.
- Recording engine: `getDisplayMedia` + `getUserMedia`, Web Audio mixing of system and mic
  audio, separate webcam track, pause/resume, mic mute, automatic save when sharing is
  stopped from the browser UI, WebM duration fix so files are seekable.
- Screenshots during recording (PNG).
- Floating pop-out controls via Document Picture-in-Picture (Chrome/Edge).
- Local library in IndexedDB: preview player with synced webcam overlay, editable webcam
  layout, rename, delete, downloads for screen, webcam and screenshots.
- Fallback download screen if saving to browser storage fails.
- Help & privacy page with permissions and browser support.
- Unit tests and real-browser e2e tests (Chrome and Edge, fake devices).
- Project docs: README, ARCHITECTURE, PROJECT_PLAN, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE (MIT).
