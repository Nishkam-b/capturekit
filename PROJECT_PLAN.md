# CaptureKit — Project Plan

Legend: ✅ verified (works + tested) · 🧪 built, automated tests pass, needs a manual check · ⬜ not started · ⛔ blocked by platform

Last updated: 2026-11-25 (Phase 7)

## Environment findings
- Windows 11, Node 24, npm 11. Chrome and Edge installed; Firefox and Safari not available on this machine.
- Next.js 16.4 (App Router), React 19.3, Tailwind 4, Lucide 1.x (no brand icons).
- Browser limits that shape the design (details in ARCHITECTURE.md §5):
  - `getDisplayMedia` gives **no cursor coordinates** → cursor/zoom features need an extension or native companion.
  - The app can only *hint* screen/window/tab; the browser picker decides. We read back the real choice.
  - System audio: tab audio (Chromium) and whole-screen audio (Chromium on Windows/ChromeOS) only. Never window audio.
  - Background tabs throttle timers/rAF → no live canvas compositing; webcam is recorded as its own track.
  - Chromium MediaRecorder WebM has no duration → patched after recording.

## Phase 1 — Functional browser recorder
| Task | Status | Evidence |
|---|---|---|
| Dashboard (hero, quick tools, recent recordings, storage usage) | ✅ | visual check + e2e (list, delete) |
| Recording setup (source, mic, webcam, system audio, countdown) | ✅ | e2e drives every control |
| Device selection + mic level meter + camera preview | 🧪 | e2e with fake devices; picker only shows with 2+ devices |
| Entire-screen capture | ✅ | `screen.spec.ts` (Chrome + Edge) asserts surface = Entire screen |
| Window capture | ✅ | `window.spec.ts` asserts surface = Window |
| Tab capture + tab audio | ✅ / 🧪 | `tab.spec.ts` asserts surface = Browser tab and an audio track present |

**Correction (found in Phase 3):** the screen, window and tab e2e tests use `--use-fake-ui-for-media-stream`.
With that flag Chromium hands back a capture of the requested *type* (for tabs, the requesting tab itself),
not the source the `--auto-select-…` flag names. So automation verifies each capture path end to end (the
reported surface, recording, saving, preview and download), but **not that the user's pick in the real picker
is what gets recorded**. That's covered by manual check 1 below.
| Microphone capture | ✅ | e2e asserts audio track in saved file |
| Webcam capture (separate track) | ✅ | e2e downloads the webcam WebM and checks the header |
| Pause / resume (timer and file exclude paused time) | ✅ | e2e: timer frozen while paused; file duration 3–6.5s for ~4.4s active |
| Stop + save to IndexedDB | ✅ | e2e |
| Preview with synced webcam overlay, seeking | ✅ | e2e (finite duration, seek) + visual check |
| Download screen / webcam / screenshots | ✅ | e2e checks WebM EBML header and PNG signature |
| Screenshots during recording | ✅ | e2e |
| Mic mute during recording | 🧪 | built; not asserted in e2e |
| Stop via browser "Stop sharing" bar | 🧪 | handled via track `ended`; can't be triggered from automation |
| Pop-out controls (Document PiP) | 🧪 | opens in automation; needs a hand check while recording another window |
| Friendly errors (picker cancelled, device blocked/busy/missing) | ✅ / 🧪 | cancelled picker is e2e-tested; device errors mapped but not tested |
| Save-failed fallback download | 🧪 | built; needs a quota-exceeded test |
| Help & privacy page | ✅ | visual check |

**Manual checks still to do (need a person in front of the browser):**
1. Real picker flow in Chrome and Edge for all three sources, including ticking "Share audio".
2. Stop sharing from the browser's own bar → recording is saved.
3. Pop-out controls while working in another app; pause/stop from there.
4. Unplug the mic/webcam mid-recording → a warning appears and the screen recording continues.
5. A 10+ minute 1080p recording: memory use and saved-file playback.
6. Firefox and Safari (not installed here).

**Open note:** in 1 of 13 automated Edge entire-screen runs (first run, while another
server was also using port 3100), the Stop click timed out. A likely cause is the
recording ending on its own before the click. It didn't reproduce in 12 later runs (6 of them
back-to-back). Worth watching during the manual Edge check; failure snapshots are kept in `test-results/`.

## Phase 1.5 — Reliability (v0.3.0; done after Phase 2 at the owner's request)
| Task | Status | Evidence |
|---|---|---|
| Save each ~1 s chunk to IndexedDB while recording (no RAM growth) | ✅ | e2e: `pending` + `chunks` present mid-recording, finalised on stop |
| Crash recovery (Recover / Discard banner, Web Lock for live recordings) | ✅ | e2e: tab closed mid-recording → recovered file plays and seeks; discard; second tab doesn't offer a live recording |
| Header-only WebM duration patch (replaces `fix-webm-duration`) | ✅ | unit tests on synthetic WebM; every e2e checks finite, seekable duration |
| Storage estimate on setup (warn < 10 min, block < 1 min) | ✅ | e2e with mocked quota |
| Low-space warning + automatic safe stop while recording | ✅ / 🧪 | auto-stop e2e (mocked quota); the 2-minute warning isn't asserted |
| Write failure / quota error → memory fallback + warning | 🧪 | built; not forced in a test |
| Keyboard shortcuts Alt+Shift+P / S / C (tab + pop-out) | ✅ / 🧪 | e2e in the tab; pop-out window not automated |
| Upgrade from DB v2 keeps old recordings | ✅ | e2e seeds a v2 database |
| Firefox | ⛔ here | smoke test written (`npm run test:firefox`), but Playwright's Firefox won't start on this machine (Windows "side-by-side configuration" error loading `mozglue`). Needs a run on another machine or after repairing the VC++ runtime |
| Safari | ⛔ | can't be automated on Windows; needs a Mac |

**Manual checks for 1.5:** a 30+ minute recording (watch memory in Task Manager; it should stay flat);
kill the browser process mid-recording, reopen and recover; fill a small disk to see the real low-space path.

## Phase 2 — Basic video editor (v0.2.0)
| Task | Status | Evidence |
|---|---|---|
| Editor layout (tools · preview · properties · timeline), full-screen route `/editor?id=` | ✅ | visual check at 1440×900 |
| Edit project model, auto-saved to IndexedDB (`projects` store, DB v2) | ✅ | e2e reads the stored project; survives reload |
| Timeline: ruler, filmstrip, waveform, webcam lane, playhead, scrub, zoom | ✅ / 🧪 | e2e scrubs via ruler; zoom only checked visually |
| Playback across cuts on a canvas preview (same renderer as export) | ✅ | e2e: canvas has pixels, time advances |
| Trim (drag clip edges), split (S), delete clip, reset cuts | ✅ | e2e drags the trim handle; unit tests for timeline math |
| Undo / redo (buttons + Ctrl+Z / Ctrl+Shift+Z), drags are one step | ✅ / 🧪 | e2e uses the buttons; shortcuts not asserted |
| Crop by dragging on preview | ✅ | e2e drags a corner handle |
| Aspect ratio 16:9 / 9:16 / 1:1 / 4:5 + Fit / Fill | ✅ | e2e (1:1 export is 720×720); unit tests for layout math |
| Background, padding, corner radius, shadow | 🧪 | visual check; not asserted in e2e |
| Webcam overlay in edit + export (visible, position, size, shape) | ✅ / 🧪 | composited in export (webcam on in e2e); options checked visually |
| Volume / mute | 🧪 | built; not asserted |
| Export WebM with progress + cancel + size estimate | ✅ | e2e: dims, duration within 0.8s of edit, EBML header; cancel test |
| Export MP4 (offered only if MediaRecorder can encode it) | ✅ | e2e in Chrome and Edge: `ftyp` header, plays, correct dims and duration |
| Export pauses while the tab is hidden | 🧪 | built (visibilitychange); not automated |
| Entry points: recording page "Edit & export", dashboard tool, library hint | ✅ | e2e clicks "Edit & export" |

**Pipeline choice (documented in ARCHITECTURE §7):** export v1 is a real-time
canvas + MediaRecorder render. It works in every browser that can record, composites the webcam
and is truthful about progress, but runs at 1× speed and needs the tab visible.
A faster-than-real-time WebCodecs pipeline (and FFmpeg.wasm where that's not available) is planned.

**Manual checks for Phase 2:**
1. Edit and export a real 5+ minute recording; check A/V sync at the end of the file and around cuts.
2. Open the exported MP4 in Windows Media Player / QuickTime / a phone and upload a test file to a social app.
3. Switch tabs during export: progress shows "Paused" and resumes correctly.
4. Undo/redo keyboard shortcuts; background and webcam options look right in the exported file.

**Known limitations:** the waveform is skipped for recordings longer than 15 minutes (decoding holds the samples in memory).
At a cut there can be a few frames of the frame before the jump in the preview (the export pauses the encoder across
cuts, so exported files are clean). Export upscales if you pick 1080p for a smaller source.

### Phase 2.5 — Editor follow-ups
- ⬜ WebCodecs export (faster than real time, background-safe); FFmpeg.wasm fallback
- ⬜ Drag webcam directly on the preview (Phase 5 covers free positioning)
- ⬜ Playback speed; keyboard shortcut help overlay

## Phase 3 — Cursor tracking (v0.4.0)
| Task | Status | Evidence |
|---|---|---|
| `CursorTelemetryProvider` interface; events on the recording timeline (pauses excluded); `cursor` store (DB v4); crash-safe periodic saves | ✅ | unit tests (clock mapping, pack/unpack); e2e reads the stored events |
| Extension (MV3): content-script bridge, background router, capture-handle tab identification, origin allow-list | ✅ / 🧪 | Edge e2e with the unpacked extension: tab identified via capture handle; click stored at the right normalised position (±0.01). Recording a tab *other than* CaptureKit uses the same code with another tab id, but can only be checked by hand (see the Phase 1 correction) |
| Setup + recording status (extension connected / tabs only / tracking on / failed) | ✅ | e2e |
| Cursor rendering: arrow, size, smoothing (critically damped spring), highlight, click ripple, pressed state, hide when still, sync offset | ✅ / 🧪 | e2e: frame differs with cursor on vs off; visual check; unit tests for path, smoothing, clicks and idle time. Hide-when-still and the offset aren't asserted |
| Same renderer in preview and export | ✅ | e2e exports with cursor effects |
| Timeline cursor lane with click markers (respects cuts) | ✅ | e2e |
| Recovered recordings keep cursor data | 🧪 | built; not tested |
| Desktop-wide tracking (screen / window recordings) | ⛔ | needs the native (Tauri) companion; setup and the Cursor panel say so |

**Manual checks for Phase 3:**
1. With the unpacked extension in Chrome, record a *different* tab via the real picker, move and click, and check the cursor lines up in the editor.
2. Navigate inside the recorded tab mid-recording; tracking should resume after the page loads.
3. Leave the mouse still for over a minute mid-recording; the MV3 worker may restart, and tracking should continue.
4. See whether the cursor needs a sync offset on your machine.

**Known limits:** cross-origin iframes aren't tracked. Pages that set their own capture handle have it replaced
during a recording. Add the production origin to `APP_ORIGINS` in `extension/content.js` when deploying.

## Phase 4 — Smart zoom (v0.5.0)
| Task | Status | Evidence |
|---|---|---|
| Zoom model: segments (source time, level 1.25–3×, follow / fixed point), eased in/out transitions, overlapping zooms blend | ✅ | unit tests (easing, weights, follow, clamping) |
| Auto detection: clicks + optional pauses-after-movement; time clustering; merge short gaps; **no zoom on plain movement** | ✅ | unit tests incl. 20 s of wandering → 0 zooms; e2e: wander + two clicks → exactly one auto zoom |
| Auto zoom on by default for recordings with cursor data; toggle; level, transition, hold, follow smoothness, "zoom on pauses" | ✅ / 🧪 | e2e toggles auto off/on and changes level; hold/transition/smoothness sliders not asserted |
| Deleted auto zooms stay deleted when regenerating; editing an auto zoom makes it manual | ✅ / 🧪 | e2e covers delete + regenerate; edit→manual covered by unit-level logic only |
| Manual zooms: add at playhead (Z), level, fixed focus by clicking the preview, delete (Delete key), undo | ✅ | e2e (no telemetry needed) |
| Timeline zoom lane: drag to move, drag edges to resize, ramps shown, auto vs manual colours | ✅ / 🧪 | e2e resizes; moving the body checked visually only |
| Follow-cursor camera never leaves the frame; cursor scales gently with zoom; webcam not zoomed | ✅ | unit tests (zoomRect); visual check |
| Same zoom in preview and export | ✅ | e2e exports with a zoom (Chrome, Edge) |
| Clear message without telemetry | ✅ | e2e |

**Manual checks for Phase 4:** watch an exported tutorial at full speed, check whether the zoom feels calm (not seasick)
and lands before clicks, and tune the defaults (2×, 0.7 s transition, 1.5 s hold, 70% follow smoothness) if needed.

**Test-environment note:** with fake-UI capture, a shared browser profile with leftover tabs can make Chromium
capture a different tab than expected, so the auto-zoom e2e uses its own fresh profile. While looking into this I
fixed a real routing weakness: the extension now sends events to the CaptureKit tab that started the recording
(previously, whichever CaptureKit tab connected last).

## Phase 5 — Webcam & visual effects (v0.6.0)
| Task | Status | Evidence |
|---|---|---|
| Webcam style model (position anywhere, continuous size, circle / rounded / 4:3 rectangle, border width + colour, shadow, mirror), migration from v0.2–v0.5 projects | ✅ | unit tests (box clamping, 4:3, migration); e2e reads stored style |
| Drag the webcam on the preview; drag its corner to resize; snap to corners | ✅ | e2e (Chrome, Edge) |
| Webcam drawn the same in preview and export (centre-cropped to the box aspect) | ✅ | e2e export; visual check |
| Webcam background replacement / blur | ⛔ | needs an on-device person-segmentation model; not included (no cloud services). The Webcam panel says so |
| Annotations: text (size, bold, colour, background pill), arrow, rectangle, ellipse, highlighter, **blur (pixelate)** | ✅ / 🧪 | e2e covers text, blur, arrow; rectangle, ellipse and highlighter checked visually; unit tests for drag/resize/fade/mapping |
| Annotations live in source coordinates and source time (stay on content through crop, zoom and cuts); short fade in/out | ✅ / 🧪 | unit tests; zoomed rendering checked by code path, not asserted in e2e |
| Edit on the preview: select, move, corner-resize, arrow endpoints; zoom paused while annotating | ✅ | e2e |
| Timeline "Notes" lane: drag to move, drag edges to change timing; overlapping notes stack into rows | ✅ | e2e drags an end handle |
| Delete (Delete key), undo, persistence across reload, export with annotations | ✅ | e2e |

**Bugs found while testing Phase 5 and fixed:**
- A new annotation started its fade exactly at the playhead, so it was invisible on the frame where you added it. It now starts one fade earlier.
- Overlapping annotations covered each other in a single-row lane, so the ones underneath couldn't be grabbed. They now stack.
- New annotations all landed on the same spot. They're now offset slightly.

**Manual checks for Phase 5:** blur a real email address or password field and check it's unreadable in the exported
file at 1080p; check text annotations on a real (light) UI; try annotations together with an auto zoom.

## Phase 6 — Screenshot editor (v0.7.0)
| Task | Status | Evidence |
|---|---|---|
| Import by file picker, drag-and-drop or paste; validation of type, size, decodability and dimensions | ✅ / 🧪 | e2e: text file and fake PNG rejected, real PNG accepted; unit tests for checks. Drag-and-drop and paste not automated |
| Capture a new screenshot (screen / window / tab); open screenshots taken during a recording | ✅ | e2e (both) |
| Library page (list, open, delete); sidebar and dashboard entries | ✅ | e2e |
| Annotations (text, arrow, rectangle, circle, highlighter, blur) edited on the image, reusing the video annotation engine | ✅ | e2e (text, blur, arrow; move arrow head) |
| Crop on the full image | ✅ | e2e |
| Background (presets or transparent), padding, rounded corners, shadow, canvas aspect (Fit, 16:9, 1:1, 4:5, 9:16) | ✅ | e2e; unit tests for layout |
| Frames: browser light/dark, app window, phone/tablet device | ✅ / 🧪 | browser frame in e2e; others checked visually; unit tests for frame geometry |
| Undo/redo, auto-save, rename | ✅ | e2e |
| Export PNG / JPG / WebP at 0.5×, 1×, 2× with quality; size shown; download | ✅ | e2e checks real file signatures and that 2× doubles the size (Chrome, Edge) |
| Copy to clipboard (PNG) | ✅ | e2e (clipboard permission granted) |

**Bug found by the tests:** a "1:1" canvas exported at 2× came out 1721×1722 because a fractional crop size
rounded differently for width and height. Crop regions now snap to whole pixels, and a unit test checks squareness at several scales.

**Manual checks for Phase 6:** paste a screenshot with Ctrl+V; drag a file onto the page; paste the copied export
into a chat or document app; check the device frame on a portrait phone screenshot.

## Phase 7 — Open-source release (v0.8.0 release candidate)
| Task | Status | Evidence |
|---|---|---|
| Static export (`out/`), optional `BASE_PATH`, dependency-free static server (`npm start`) | ✅ | the full suite (106 tests) runs against the static build |
| Content-Security-Policy (production) blocking other origins; no outside requests while browsing | ✅ | `privacy.spec.ts` |
| Performance review | ✅ | ~1 MB of uncompressed JS across all routes, largest chunk 229 KB (React/Next); three runtime dependencies; recording no longer holds video in memory |
| CI workflow (lint, typecheck, unit, build, Chrome e2e under xvfb) | ✅ | green on GitHub Actions |
| GitHub Pages deploy workflow | ✅ | live at https://nishtek.in/capturekit/ |
| Issue/PR templates, Dependabot | ✅ | `.github/` |
| Docs: README (with real screenshots), user guide, deployment, testing + manual checklist, release process | ✅ | `docs/` |
| Create the GitHub repository, push, enable Pages | ✅ | github.com/Nishkam-b/capturekit |
| Tag v0.8.0 and publish a GitHub release | ⬜ | after the push |
| v1.0 | ⬜ | after the manual release checklist ([docs/TESTING.md](docs/TESTING.md)) |
| Desktop-wide cursor telemetry | ⛔ | needs a native (Tauri) companion: next roadmap item |

## Phase 8 — Automatic zoom for all recordings, extension download, editor features (v0.9.0)
| Task | Status | Evidence |
|---|---|---|
| Screen-activity analysis engine (frame differences → pseudo cursor events) | ✅ | `tests/unit/activity.spec.ts` (static, dialog, typing, moving cursor, animation, full-screen change) |
| Editor runs it automatically for recordings without cursor data; auto zoom on by default | ✅ | `zoom.spec.ts` (real recording: analysis finishes, estimated auto zoom shown) |
| "Zoom in here" button, Alt+Shift+Z, extension command | ✅ | `features.spec.ts`, `tests/unit/markers.spec.ts`; extension command not covered by automated tests |
| Extension zip + icons built by `scripts/build-extension.mjs`; 3-step install | ✅ | `features.spec.ts` downloads and checks the zip |
| Chrome Web Store / Edge Add-ons listing | ⬜ | needs the owner's developer account ([docs/EXTENSION_STORE.md](docs/EXTENSION_STORE.md)) |
| Speed regions | ✅ | unit + `features.spec.ts` |
| Cursor styles, bounce, motion blur, sway | ✅ | unit (bounce); visual check pending in the manual checklist |
| Wallpapers, image background, blurred video, background blur | ✅ | build + manual check pending |
| Webcam roundness, margin, shrink on zoom | ✅ | unit |
| GIF export | ✅ | unit (encoder) + `features.spec.ts` (decodes at the chosen size) |
| Import video; `.capturekit` project files | ✅ | `features.spec.ts` round trip |
| Shortcut reference, FAQ, privacy policy, terms, footer | ✅ | `features.spec.ts` |
| Image annotations | ✅ (v0.10.0) | `features.spec.ts` (frame changes when an image is added) |
| Music / voice-over tracks (start, volume, repeat; preview + export mix) | ✅ (v0.10.0) | unit (`trackPositionAt`) + `features.spec.ts` (export of a silent recording contains decoded audio) |

## Phase 9 — Click-based zoom from the video, finished video after recording (v0.11.0)
| Task | Status | Evidence |
|---|---|---|
| Research | ✅ | Screen Studio zooms on clicks and follows the cursor; desktop tools log the cursor natively. A browser can't, but screen/window recordings contain the pointer, so it is detected in the video (template matching) |
| Cursor detection + click inference (`src/engines/zoom/cursor-detect.ts`) | ✅ | `tests/unit/cursor-detect.spec.ts` (Windows + macOS cursors, menu click found, no-reaction stop and blinking caret ignored) |
| Real encoded video end to end | ✅ | `features.spec.ts` "real encoded video": 6/6 consecutive passes after fixes |
| Zoom starts on approach, fully in before the click | ✅ | unit + e2e (segment start + transition ≤ click) |
| Editor opens after recording with polished defaults and an Export bar | ✅ | e2e helpers now land on the editor |
| No extension prompts in setup/editor | ✅ | `features.spec.ts` checks the Cursor panel; extension test updated |
| Real desktop recording with a physical mouse | ⬜ | needs a manual check (automation can't move the real pointer) |

## Phase 10 — Simple recorder, manual editing, multicam (v0.12.0)
| Task | Status | Evidence |
|---|---|---|
| Remove automatic zoom, cursor detection/tracking, extension, zoom marks | ✅ | code and tests removed; `features.spec.ts` checks the recorder has no zoom marker and Help/FAQ have no extension or auto-zoom text |
| Manual zoom: amount + position sliders, click-to-centre, steady view | ✅ | `zoom.spec.ts` (unit + e2e) |
| Screen layer: size, position, opacity, rotation, corner curve | ✅ | unit (layout geometry) + `features.spec.ts` |
| Webcam: shape, size, position, opacity, rotation, corner curve | ✅ | `features.spec.ts` |
| Multicam layout track (screen + webcam / full webcam / screen only) | ✅ | unit (`sceneAt`, `setSceneAt`) + `features.spec.ts` (keys and panel, lane, saved, export) |
