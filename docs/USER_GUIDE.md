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

## 2. Edit a video

Open a recording and press **Edit & export**. Everything is non-destructive and saves automatically.

| Tool | What it does |
|---|---|
| Trim & cut | Drag clip edges to trim; **S** splits at the playhead; **Delete** removes a clip |
| Crop & size | Drag the crop box; choose 16:9, 9:16, 1:1 or 4:5 with Fit or Fill |
| Screen | Size, position, opacity, rotation and corner curve of the screen recording |
| Background | Colours, gradients, wallpapers, your own image or a blurred copy of the video; padding |
| Webcam | Its own shape, size, position, opacity, rotation, corner curve, border, shadow, mirror (or drag it on the preview) |
| Layout | Multicam: screen + webcam, full webcam or screen only, switched at the playhead (keys **1**, **2**, **3**) |
| Zoom | Manual zooms (**Z**): amount and position sliders, or click the preview to centre it |
| Annotations | Text, arrows, rectangles, circles, highlighter and **blur** for sensitive info |
| Audio | Volume and mute |

Other shortcuts: **Space** play/pause, **←/→** step a frame (Shift: 1 second), **Ctrl+Z / Ctrl+Shift+Z** undo/redo.

**Export** to WebM or MP4 (where your browser can encode MP4) at 1080p, 720p or the original size. Export runs
in real time (a 5-minute video takes about 5 minutes) and pauses if you switch to another tab.

### Zoom

Zooms are manual. Move the playhead, press **Z** (or **Zoom › Add zoom at playhead**), then set **Zoom amount**,
**Horizontal position** and **Vertical position** with the sliders, or click the preview to centre it. Drag the zoom on
the timeline to move it; drag its edges to change how long it lasts. Each zoom holds a steady view.

### Layout (multicam)

With a webcam recording, **Layout** switches what's on screen from the playhead onwards: **Screen + webcam**, **Full
webcam** or **Screen only** (keys **1**, **2**, **3**). The Layout lane on the timeline shows each part; remove a switch
from the list in the panel. Export follows the layout.

### Speed

In **Trim & cut**, select a clip (split first to speed up only part of the video) and pick 0.5× to 4×.

### Looks

- **Background:** colours, gradients, wallpapers, your own image (kept on this device), or a blurred copy of the video,
  with an optional blur.
- **Screen:** size, position, opacity, rotation and corner curve.
- **Webcam:** shape, size, position, opacity, rotation, corner curve, edge margin, border, shadow and mirror.

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
