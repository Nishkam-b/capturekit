# CaptureKit Cursor Tracker (browser extension)

Optional companion for CaptureKit. Browsers don't tell web pages where your cursor is in a
screen recording, so this extension records cursor positions and clicks in the **browser tab
you're recording**. CaptureKit uses them for cursor effects and automatic smart zoom.

## Install (Chrome or Edge 116+)

1. Download `capturekit-extension.zip` from the CaptureKit Help page and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Drag the unzipped `capturekit-extension` folder onto the page (or click **Load unpacked** and pick it), then
   reload the CaptureKit tab. The recording setup shows "Extension connected" when you pick **Browser tab**.

From source: `npm run build` (or `node scripts/build-extension.mjs`) writes the icons and
`public/capturekit-extension.zip`; you can also load this `extension/` folder directly.

## Shortcut

**Alt+Shift+Z** ("Zoom in here") works from any Chrome tab while CaptureKit is recording. Change it at
`chrome://extensions/shortcuts`.

## What it does, exactly

- Runs a small content script in each tab's top frame. It does nothing until CaptureKit starts
  a tab recording.
- When you start a tab recording, every tab gets a temporary random **capture handle**. Chrome
  passes the shared tab's handle to CaptureKit, so the extension knows exactly which tab you picked.
  The handles are cleared again right away. (Pages that set their own capture handle, such as some
  slide and meeting apps, have theirs replaced for the duration of the recording.)
- Only the recorded tab then reports pointer moves (up to ~120/s), presses, releases and "pointer
  left the page". Positions are relative to the page's visible area.
- Events go **only** to the CaptureKit tab, through the extension. Nothing is sent to any server,
  and nothing is stored by the extension.
- It only talks to CaptureKit pages on allow-listed origins (currently `localhost` and
  `127.0.0.1`, plus the official site `https://nishtek.in`; edit `APP_ORIGINS` in `content.js` for
  your own deployment).

## Permissions

- **Read data on all websites** (content script on `<all_urls>`): needed because you can record
  any tab. The script stays idle unless that tab is being recorded.
- **storage**: keeps routing state (which tab is being recorded) if Chrome restarts the
  extension's background worker during a long recording.

## Limits

- Cursor tracking covers browser tabs only. Screen and window recordings already contain the system cursor, and
  automatic zoom for them comes from on-device video analysis in the editor.
- Pointer movement inside cross-origin iframes (embedded videos, some editors) isn't seen.
- Chrome pages (`chrome://`, the Web Store) can't run extensions.
