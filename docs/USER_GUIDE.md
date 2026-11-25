# CaptureKit user guide

CaptureKit runs entirely in your browser. Nothing you record is uploaded, and there's no account to create.
It works best in the latest **Chrome or Edge** on a desktop computer.

## 1. Record

1. Open **Record**.
2. Choose what to record: **Entire screen**, **Window** or **Browser tab**. Your browser asks you to pick
   the exact screen, window or tab when you start.
3. Turn on **Webcam** and **Microphone** if you want them. The mic level meter shows it's working.
4. **System audio:** for a tab, tick "Share tab audio" in the browser dialog. For the whole screen this works
   on Windows and ChromeOS only. Browsers can't record audio from a single window.
5. Press **Start recording**. A 3-second countdown gives you time to get ready (you can turn it off).

While recording:

| Action | Button | Shortcut |
|---|---|---|
| Pause / resume | ❚❚ | Alt+Shift+P |
| Stop and save | ■ | Alt+Shift+S |
| Screenshot | ◎ | Alt+Shift+C |

- **Pop out controls** opens a small floating window (Chrome/Edge) so you can pause and stop while using other apps.
- The browser's own **Stop sharing** button also stops and saves the recording.
- Recordings are saved **second by second**. If the tab closes or crashes, the dashboard offers to **recover** it.
- If storage gets low, CaptureKit warns you and stops in time to save what you have.

### Cursor tracking (optional)

Browsers don't tell web pages where your cursor is, and tab recordings don't show it at all. Install the
**CaptureKit Cursor Tracker** extension (see the [extension README](../extension/README.md)) and record a
**Browser tab**. Cursor moves and clicks are then recorded for cursor effects and automatic zoom.

## 2. Edit a video

Open a recording and press **Edit & export**. Everything is non-destructive and saves automatically.

| Tool | What it does |
|---|---|
| Trim & cut | Drag clip edges to trim; **S** splits at the playhead; **Delete** removes a clip |
| Crop & size | Drag the crop box; choose 16:9, 9:16, 1:1 or 4:5 with Fit or Fill |
| Background | Colours and gradients, padding, rounded corners, shadow |
| Webcam | Drag it anywhere on the preview, resize from its corner, shape, border, shadow, mirror |
| Cursor | Draw the cursor, size, smoothing, highlight, click ripple, hide when still, timing |
| Zoom | Automatic zoom around clicks (with cursor data) and manual zooms (**Z**) |
| Annotations | Text, arrows, rectangles, circles, highlighter and **blur** for sensitive info |
| Audio | Volume and mute |

Other shortcuts: **Space** play/pause, **←/→** step a frame (Shift: 1 second), **Ctrl+Z / Ctrl+Shift+Z** undo/redo.

**Export** to WebM or MP4 (where your browser can encode MP4) at 1080p, 720p or the original size. Export runs
in real time (a 5-minute video takes about 5 minutes) and pauses if you switch to another tab.

## 3. Edit a screenshot

Open **Screenshots** and import an image (button, drag-and-drop or **Ctrl+V**), capture your screen, or press
**Edit** under a screenshot taken during a recording. Then:

- **Annotate:** text, arrows, shapes, highlighter, blur. Drag on the image to move and resize.
- **Crop.**
- **Background:** a colour, a gradient or transparent; padding, rounded corners, shadow; canvas sizes for social posts.
- **Frame:** browser window (light or dark), app window or device.
- **Export** PNG, JPG or WebP at 0.5×, 1× or 2×, or **Copy** to the clipboard.

## 4. Where your data lives

Recordings, edits and screenshots are stored in your browser's storage for this site, on this computer only.
Clearing the site's data in your browser settings deletes them, so download anything you want to keep.
CaptureKit asks the browser to protect its storage from automatic clean-up after your first recording.
