# CaptureKit Architecture

CaptureKit is a local-first, browser-based screen recorder, built as a **static site** (Next.js `output: "export"`,
served from `out/`; a production Content-Security-Policy blocks requests to other origins). Everything — capture,
encoding, storage, playback — happens on the user's device. There is no backend.

## 1. Layout (MVP)

The brief suggests a multi-package monorepo. For the MVP we use **one Next.js app**
with engine code isolated under `src/engines/`. Each engine is framework-free
TypeScript (no React imports), so it can be lifted into `packages/<name>` later
without rewrites. This avoids build tooling for packages that don't exist yet.

```
capturekit/
├── src/
│   ├── app/                  Next.js App Router pages (UI only)
│   │   ├── page.tsx          Dashboard
│   │   ├── record/           Recording setup → recording → saving
│   │   ├── recordings/       Library + single-recording preview (/recordings/view?id=)
│   │   └── help/             Permissions, browser support, privacy
│   ├── components/           React UI (app shell, primitives, record flow)
│   ├── hooks/                React glue around engines
│   ├── config/               Site config (brand, links)
│   └── engines/              Framework-free logic  ──► future packages/*
│       ├── shared/           Types, formatting, ids
│       ├── recorder/         Capture, mixing, MediaRecorder sessions
│       └── storage/          IndexedDB repository
├── tests/
│   ├── unit/                 Pure-logic tests (Playwright test runner, Node)
│   └── e2e/                  Real-Chrome tests with fake devices + auto-selected capture source
└── docs: README, PROJECT_PLAN, ARCHITECTURE, CONTRIBUTING, SECURITY, ...
```

Planned engines (not yet created): `cursor-engine`, `zoom-engine`, `video-editor`,
`screenshot-editor`, `export-engine`. A Chrome extension (`extension/`) and a Tauri
companion are later phases.

## 2. Recorder engine (Phase 1)

```
 user click ──► requestDisplayStream()          getDisplayMedia (browser picker)
                     │
 setup screen ──► mic stream, camera stream     getUserMedia (acquired earlier, for previews)
                     │
                     ▼
              RecordingSession
   ┌───────────────────────────────────────────────────────────┐
   │ AudioMixer (Web Audio)                                    │
   │   system audio ─► gain ─┐                                 │
   │   microphone   ─► gain ─┴─► MediaStreamDestination ─┐     │
   │                                                     ▼     │
   │ display video track ───────────────────────► MediaRecorder A ──► screen blob (video + mixed audio)
   │ camera video track  ───────────────────────► MediaRecorder B ──► camera blob (video only)
   │ timer (active time, excludes pauses)                      │
   └───────────────────────────────────────────────────────────┘
                     │ stop (button, or "Stop sharing" in browser UI)
                     ▼
     fix WebM duration header ─► thumbnail ─► IndexedDB ─► /recordings/view
```

Key decisions:

- **Display stream is requested first, inside the click handler.** `getDisplayMedia`
  requires transient user activation; awaiting other prompts first can lose it.
  Mic/camera are acquired earlier on the setup screen (they power the previews and
  mic meter) and handed to the session.
- **The session owns all tracks once started** and stops every track and closes the
  `AudioContext` on finish, success or failure.
- **Webcam is recorded as a separate file**, not composited. Compositing on a canvas
  is unreliable during recording because browsers throttle `requestAnimationFrame`
  and timers in background tabs — and the CaptureKit tab is in the background while
  the user records another window. A separate track also lets the editor
  (Phase 2/5) reposition and restyle the webcam. The preview page plays both in sync.
- **Audio is always mixed through Web Audio**, even with one source, so the mic can
  be muted mid-recording (gain 0) without renegotiating tracks.
- **Container/codec is negotiated** via `MediaRecorder.isTypeSupported`
  (WebM VP9 → VP8 → generic WebM → MP4 for Safari). The actual MIME type is stored
  and drives the file extension. We do not advertise MP4 *export* yet.
- **WebM duration fix.** Chrome's MediaRecorder writes WebM without a duration, so
  files can't be seeked. Our own `patchWebmHead` (src/engines/recorder/webm.ts) inserts the
  Duration into the first chunk's Info element, reading only the first 64 KB.
- **Stopping from browser UI** ("Stop sharing") ends the display track; the session
  listens for `ended` and finishes normally, so no data is lost.
- **Pop-out controls** use the Document Picture-in-Picture API where available
  (Chrome/Edge 116+), so pause/stop stay reachable while another window is focused.
  The timer inside the pop-out ticks on the pop-out window's own clock to avoid
  background-tab timer throttling.

## 3. Storage (crash-safe, v0.3)

IndexedDB database `capturekit` (version 3), no external wrapper:

| store        | key                              | value                                     |
|--------------|----------------------------------|-------------------------------------------|
| `recordings` | `id`                             | `RecordingMeta` (small; listed on dashboard) |
| `chunks`     | `[recordingId, track, seq]`      | one ~1 s MediaRecorder chunk (`track` = screen \| camera) |
| `pending`    | `id`                             | `PendingRecording`: a recording in progress (or interrupted) |
| `media`      | `"<id>/thumb"`, `"<id>/shot/<n>"` (+ `"<id>/screen"`/`camera` for v1–v2 recordings) | `{ key, recordingId, blob }` |
| `projects`   | `recordingId`                    | `EditProject` (editor) |

**While recording** (`StorageSink`, `src/engines/storage/recording-store.ts`):
- The session is created with a `ChunkSink`. Each `dataavailable` chunk is written in
  one transaction together with an updated `pending` record (active time, bytes). Chunks are
  **not** kept in memory, so long recordings don't grow RAM.
- Screenshots are written immediately too.
- If a write fails (e.g. quota), that chunk and later ones fall back to memory, the user is
  warned, and the save at the end writes them (or offers a direct download).
- The recording tab holds a **Web Lock** `capturekit-recording-<id>` for the whole session.

**On stop:** the first chunk of each track gets its WebM duration patched
(`patchWebmHead`, which reads only the first 64 KB), and `finalizeRecording` atomically
replaces chunk 0, writes the meta and thumbnail, and deletes the `pending` record. The video data
is never copied. `getMedia()` assembles `new Blob(chunks)` from disk-backed IndexedDB blobs.

**Crash recovery:** any `pending` record whose lock isn't held (or, without the Locks API,
that hasn't been updated for 20 s) is offered on the dashboard and library as
"A recording was interrupted — Recover / Discard". Recover patches the headers using the
last stored active time and finalises it as a normal recording, marked "(recovered)".

**Storage budget** (`src/lib/storage-budget.ts`): the setup screen estimates the
minutes that fit in `navigator.storage.estimate()`. It warns under 10 min and blocks under
1 min. While recording, a check runs on each chunk event (not a timer, because background tabs
throttle timers). It warns under 2 min and stops cleanly under 20 s so the recording is still saved.

`navigator.storage.persist()` is requested after the first save so the browser is
less likely to evict recordings. Old v1/v2 recordings (single blob in `media`) remain readable.

## 4. Cursor telemetry (Phase 3, built)

`getDisplayMedia` does **not** expose cursor coordinates, and tab captures don't even
contain the cursor. Cursor data comes from pluggable **telemetry providers**
(`src/engines/cursor/types.ts`) and is stored separately from the video:

```ts
interface CursorTelemetryProvider {
  source: 'extension' | 'native';
  start(track: MediaStreamTrack, onEvents: (e: { perfMs, x, y, kind }[]) => void): Promise<boolean>;
  stop(): void;
}
```

**Extension provider (browser tabs)**, `extension/` + `extension-provider.ts`:

```
CaptureKit tab                       extension                         recorded tab
──────────────                       ─────────                         ────────────
postMessage(arm, nonce) ──► content-script bridge ──port──► background ──► every tab: setCaptureHandleConfig(
                                                                             "capturekit:<nonce>:<tabId>")
track.getCaptureHandle()  ◄── browser exposes the shared tab's handle ◄──────────────────────┘
postMessage(track, tabId) ──► bridge ──► background ──► that tab: start listening; others: clear handle
window "message" (events) ◄── bridge ◄── background ◄── pointermove/down/up/leave, batched every 50 ms
```

- An **origin allow-list** in the content script means only CaptureKit pages can drive it.
- **Positions** are normalised to the tab's viewport, which is exactly what tab capture records.
- **Timestamps** are `performance.timeOrigin + now()` in the tab, converted to the app's `performance.now()`
  and then to *active* recording time by `ActiveClock.toActive()`, which drops events while paused.
- MV3 workers can be stopped: routing state lives in `chrome.storage.session`, and the bridge reconnects and
  replays the session on disconnect.

**Storage:** `CursorRecorder` saves the packed events (`[t, x, y, kind]…`) to the `cursor` store every
~5 s during recording (crash-safe) and on stop. `RecordingMeta.cursor` holds the event count.

**Rendering:** `buildCursorPath()` resamples events at 60 Hz with linear gap-filling and an optional
critically damped spring (smoothing), plus click times and idle time. `cursorStateAt(t)` is O(1).
`drawCursor()` draws the click ripple, highlight, arrow (pressed state) and the hide-when-still fade.
`drawFrame()` maps source coordinates through crop/fit/padding (`sourcePointMapper`) and clips to the
video area. Preview and export call the same code, using the source time of the current frame plus the
user's sync offset.

**Native provider:** a planned Tauri companion for screen and window recordings (desktop-wide cursor).

The zoom engine (Phase 4) will consume the same events to generate zoom keyframes; recordings without
telemetry will offer manual keyframes only and say why.

## 5. Browser support

| Capability               | Chrome/Edge (desktop) | Firefox | Safari 17+ |
|--------------------------|-----------------------|---------|------------|
| Screen / window / tab    | ✅ (user picks in browser dialog) | ✅ screen/window, no tab | ✅ screen/window |
| Preferred-surface hint   | ✅ `displaySurface`    | ignored | ignored |
| Tab audio                | ✅                     | ❌      | ❌ |
| Whole-screen system audio| ✅ Windows / ChromeOS  | ❌      | ❌ |
| Window audio             | ❌                     | ❌      | ❌ |
| Mic + webcam             | ✅                     | ✅      | ✅ |
| Pause / resume           | ✅                     | ✅      | ✅ |
| Pop-out controls (Doc PiP)| ✅ 116+               | ❌ (falls back to in-page controls) | ❌ |
| Container                | WebM                   | WebM    | MP4 |
| Mobile                   | ❌ no screen capture APIs | ❌   | ❌ |

The app detects these at runtime and explains anything unavailable instead of
hiding or faking it. Note: the app can only *hint* the source type; the browser's
own picker is the final say, and we read back what the user actually chose.

## 6. Dependencies

| Package | Why |
|---|---|
| `next`, `react`, `react-dom`, `tailwindcss` | App framework and styling (brief's stack) |
| `lucide-react` | Icons (design system: Lucide, 2px stroke) |
| `@playwright/test` (dev) | Unit tests and real-browser e2e recording tests |

## 7. Editor (Phase 2)

```
src/engines/editor/
  project.ts   EditProject model (clips, crop, aspect, fit, background, padding, radius, shadow, webcam, audio)
  timeline.ts  pure clip maths: locate / split / trim / remove (unit-tested)
  layout.ts    pure geometry (outputSize, frameLayout) + drawFrame() renderer (unit-tested geometry)
  player.ts    PreviewPlayer: plays the edit on a canvas from hidden <video>s, jumps over cuts
  analysis.ts  filmstrip thumbnails + waveform peaks (decoded at 8 kHz to keep memory low)
  export.ts    export pipeline v1
```

- **Non-destructive.** The source recording is never modified. An edit is a list of clips
  (`{start, end}` in source ms) played back-to-back plus layout settings. It's stored per recording in
  IndexedDB (`projects`, keyPath `recordingId`) and auto-saved 400 ms after each change.
- **WYSIWYG.** The preview and the exporter call the same `frameLayout()` + `drawFrame()`, so the
  exported pixels match the preview (only the resolution differs).
- **Undo/redo** keeps whole-project snapshots (max 100). Drags update the project "transiently" and
  commit one history step on release.
- **Export v1 (real time):** hidden `<video>` elements play each clip; every animation frame is drawn
  to a canvas whose `captureStream(30)` plus the Web Audio-routed screen audio feed a MediaRecorder.
  The recorder is paused while seeking across cuts, so exported files have no frozen frames at cuts.
  Progress is the playback position over the edited duration. Hidden tabs throttle rendering, so export
  pauses on `visibilitychange` and resumes when the tab is visible again. MP4 is offered only when
  `MediaRecorder.isTypeSupported` says the browser can encode it (Chrome/Edge do), and the e2e test
  verifies the file.
- **Next:** a WebCodecs pipeline (decode → draw → `VideoEncoder` → mux) for faster-than-real-time,
  background-safe export; it needs a demuxer/muxer library (to be chosen and justified in §6).

## 8. Smart zoom (Phase 4)

```
src/engines/zoom/
  types.ts   ZoomSegment { start, end (source ms), level, mode: follow|fixed, x, y, auto, key } + ZoomSettings
  detect.ts  findInteractions → detectZoomSegments → withAutoSegments (unit-tested)
  camera.ts  ease, segmentWeight, zoomAt(t) → { scale, cx, cy }, zoomRect (unit-tested)
```

- **Segments, not keyframes.** A zoom ramps in over `transitionMs` from `start`, holds, and ramps out from `end`
  (ease-in-out cubic). At any time, scale = max over active segments, and the centre is weighted by each
  segment's influence, so overlapping or adjacent zooms blend without jumps. Times are source ms, so trimming
  and cutting never shift a zoom onto the wrong content.
- **Auto detection** uses clicks, plus (opt-in) pauses of at least 1 s after at least 8% of frame travel. A pause
  only counts when a later event proves the cursor stopped. Interactions within 2.5 s form one cluster; each
  cluster becomes a zoom that's fully in by the first interaction and holds `holdMs` after the last. Zooms whose
  gap after zoom-out is under 1.2 s are merged. Plain movement never produces an interaction.
- **Regeneration** (`withAutoSegments`) replaces only `auto` segments, keeps manual ones (and auto ones that
  would overlap them out), and skips keys the user dismissed. Editing an auto zoom clears its `auto` flag.
- **Follow camera:** the editor builds a second, much calmer cursor path (spring smoothing 0.75–0.99) for the
  camera. `zoomRect` takes 1/scale of the layout's (cropped) source rect around the camera point and clamps it
  inside, so the view never shows outside the frame. At 1× this is the full frame.
- **Rendering:** `drawFrame(…, cursor, zoom)` draws the zoomed source rect into the same destination box; the cursor
  is mapped through the zoomed rect and scaled by √scale; the webcam overlay isn't zoomed. Preview (`PreviewPlayer`)
  and export call the same code per frame with the frame's source time.
- **Picking a focus point:** `outputToSource()` inverts the unzoomed layout, so a click on the preview canvas becomes
  a normalised source point.

## 9. Webcam styling & annotations (Phase 5)

**Webcam** (`src/engines/editor/webcam.ts`): `WebcamStyle { visible, x, y, size, shape, border, borderColor,
shadow, mirror }`. Position is the centre in output-frame fractions; `webcamBox()` clamps it inside a 4% margin,
so 0/1 means "hug that edge", and corner snapping is just x,y ∈ {0,1}. `drawWebcam()` centre-crops the camera
frame to the box aspect (1:1 or 4:3), clips to the rounded shape, and draws the border, shadow and mirror.
v0.2–v0.5 projects (`{ visible, layout: corner + S/M/L }`) are migrated in `normalizeProject()`.

**Annotations** (`src/engines/annotations/`): `Annotation { kind, start, end, x, y, w, h, color, stroke, text,
fontSize, bold, background }` in **source** coordinates and time, so they stay on the content through crop,
zoom and cuts. `drawAnnotations()` runs inside `drawFrame()` after the screen and before the cursor, clipped to
the video area, using the same zoomed source→output mapping (`toOutput`). Line widths and text grow by √zoom;
geometry follows the content exactly.
- **Blur** pixelates: it samples the *original source pixels* of the region into a tiny canvas (one cell per
  ~1/70 of the output's short side) and scales it up with smoothing off. This is more robust than a CSS blur
  and works in every browser.
- **Highlighter** uses `multiply` compositing; **text** uses the page's loaded UI font (`setAnnotationFont`).

**Editing:** the player has an `annotate` mode (zoom paused, so positions hold still). `AnnotationOverlay` and
`WebcamOverlay` are DOM layers over the canvas that map CSS px → output px → source units with the unzoomed
layout; `dragAnnotation()` (pure, unit-tested) implements move, corner resize with flipping, and arrow endpoints.
Gestures are one undo step (transient updates + commit on release). The timeline lane stacks overlapping notes
into rows (`stackRows`).

## 10. Screenshot editor (Phase 6)

```
src/engines/screenshot/
  project.ts  ScreenshotProject { image size, crop, annotations, background|"none", padding, radius, shadow, frame, aspect }
  layout.ts   screenshotLayout(p, scale) → { out, frame, content, src, chrome, radius } (pure, unit-tested) + renderScreenshot()
  io.ts       checkImageFile / decodeImage (validation), captureScreenshot, exportScreenshot (PNG/JPG/WebP), canEncode
```

- **Storage:** database version 5 adds `screenshots` (project records). The source image is stored once in `media`
  as `<id>/image`. Projects are non-destructive and auto-saved like video projects.
- **Layout:** the crop is snapped to whole image pixels first, so every size is an integer and fixed aspects stay
  exact at any export scale. Title-bar frames add `chrome` above the image; the device frame adds a bezel all round.
  Padding (dropped for a transparent background) is a fraction of the framed image's longer side, and a fixed canvas
  aspect then grows the background around the frame. Export scale multiplies everything, capped at 8192 px.
- **Reuse:** annotations use the same engine and renderer as video (`drawAnnotations`, evaluated at a time inside
  their whole-image range). The editor reuses `AnnotationEditor`, `AnnotationOverlay` (through a still-image
  `OverlayHost`), `CropOverlay`, the history hook and the panel primitives.
- **Import safety:** only PNG/JPG/WebP/GIF/BMP, at most 50 MB, decoded with `createImageBitmap` before acceptance,
  at most 16384 px per side. Nothing leaves the browser.
- **Export:** an offscreen canvas at the chosen scale. JPG is composited onto white (no alpha). WebP is offered only
  when the browser can encode it. Copy uses `navigator.clipboard.write` with a PNG (`ClipboardItem`).
