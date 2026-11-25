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

### Zoom in here

Press the zoom button in the recording controls (or **Alt+Shift+Z**) at a moment you want to highlight. Each press
becomes a zoom in the editor that you can move, resize or delete. With the extension installed, the shortcut also
works from any Chrome or Edge tab.

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

### Automatic zoom

When you stop recording, the editor opens and finds your mouse pointer in the video ("Finding your cursor and
clicks…"). A click is the cursor arriving somewhere, stopping, and the screen reacting next to it. Each zoom starts as
you move toward the click, is fully in before you click, follows the cursor and zooms out afterwards; nearby clicks
share one zoom. Record the **entire screen** or a **window** for this (browser-tab recordings don't contain the
pointer, so zooms there follow on-screen changes). Turn it off in the Zoom panel or edit any zoom.

### Speed

In **Trim & cut**, select a clip (split first to speed up only part of the video) and pick 0.5× to 4×.

### Looks

- **Background:** colours, gradients, wallpapers, your own image (kept on this device), or a blurred copy of the video,
  with an optional blur.
- **Webcam:** roundness, edge margin, and "Shrink while zoomed in" so it covers less of the action.
- **Cursor** (extension recordings): dark, light or dot style, click bounce, motion blur and sway.

### Images and music

- **Annotations › Image** adds a picture (logo, sticker, screenshot) at the playhead. Drag it on the preview and drag
  its corners to resize; drag its bar on the timeline to change when it shows.
- **Audio › Add audio file** adds music or a voice-over at the playhead. Set its volume, move its start to the
  playhead, or let it repeat to the end. It plays over the edited video, across cuts, and is mixed into MP4/WebM
  exports (GIFs have no sound).

### Export, import and project files

- Export MP4, WebM or **GIF** (small/medium/large, 10–20 fps, loop on/off). GIFs have no sound.
- **Save project file** (editor toolbar) downloads one `.capturekit` file with the recording and all edits.
  **Open project file** on the Recordings page continues it in any browser.
- **Import video** on the Recordings page adds an MP4 or WebM so you can edit it like a recording.
- Press **?** in the editor for all keyboard shortcuts.

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
