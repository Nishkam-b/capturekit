# Testing CaptureKit

## Automated

| Command | What runs |
|---|---|
| `npm run test:unit` | Pure logic: timeline, layout, zoom camera, layout and multicam scenes, annotations, WebM header patch, screenshot layout, storage maths |
| `npm run build && npm run test:e2e` | Real recordings in headed **Chrome and Edge**: Chrome's fake camera/mic and fake-UI screen capture, through recording, saving, crash recovery, editing, zoom, annotations, screenshots, export (WebM/MP4/PNG/JPG/WebP file signatures) and privacy (CSP, no outside requests) |
| `npm run test:firefox` | Firefox smoke test (needs `npx playwright install firefox`) |
| `npm test` | Unit + Chrome + Edge |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and the build, then the Chrome browser tests
under a virtual display on Linux. **The CI workflow hasn't run yet**; check its first run after pushing.


On a busy Windows desktop, running Chrome and Edge e2e together has once ended with several tests failing with "Target page, context or browser has been closed" (the browser windows were closed mid-test, no assertion failed). The same specs passed when rerun per browser. Close other browser automation windows before a full run.

### What automation can't prove

- **Which source gets recorded.** With `--use-fake-ui-for-media-stream`, Chromium records a source of the
  requested *type* (for tabs, the requesting tab itself), not the one picked in a real dialog.
- **Feel and quality.** Zoom smoothness, A/V sync on long videos, and whether a blur is truly unreadable.
- **Real hardware events.** Unplugging devices, a full disk, browser crashes, OS-level interruptions.
- **Firefox/Safari.** Firefox couldn't be launched on the development machine; Safari needs a Mac.

## Manual release checklist

Run in the latest Chrome **and** Edge on Windows, and on macOS if possible. Tick each item before a release.

### Recording
- [ ] Entire screen, a window and a browser tab via the **real** picker; the right source is recorded
- [ ] "Share tab audio" / "Share system audio" ticked → sound is in the file
- [ ] Browser's **Stop sharing** bar → recording is saved
- [ ] Pop-out controls: pause, resume and stop while working in another app; shortcuts work in the pop-out
- [ ] Unplug the mic or webcam mid-recording → warning shown, screen recording continues
- [ ] 30+ minute 1080p recording: memory stays flat (Task Manager), file plays and seeks
- [ ] Kill the browser process mid-recording → reopen → **Recover** works
- [ ] Nearly full disk → warning, then automatic stop and save

### Editor & export
- [ ] Edit and export a 5+ minute recording; audio stays in sync at the end and around cuts
- [ ] Exported MP4 plays in Windows Media Player / QuickTime and on a phone; uploads to a social app
- [ ] Switch tabs during export → "Paused", then resumes correctly
- [ ] Manual zoom sliders and multicam layout switches look right in the exported video
- [ ] Blur over a real email or password is unreadable in a 1080p export

### Screenshots
- [ ] Paste with Ctrl+V; drag-and-drop a file
- [ ] Copy → paste into a chat or document app
- [ ] Device frame on a portrait phone screenshot

### Other browsers
- [ ] Firefox: record screen + mic + webcam, preview, export WebM
- [ ] Safari 17+: record screen, preview, export (MP4)
