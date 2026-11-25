# Publishing the cursor extension to the Chrome Web Store / Edge Add-ons

A store listing turns the 3-step install into one click ("Add to Chrome"). It needs the project owner's own
developer account, so it isn't automated.

## 1. Build the package

```bash
npm run build            # or: node scripts/build-extension.mjs
```

Upload `public/capturekit-extension.zip`. (The zip contains a top-level `capturekit-extension/` folder; if the store
asks for `manifest.json` at the root, zip the contents of `extension/` instead.)

## 2. Accounts

- **Chrome Web Store:** register at the Chrome Web Store Developer Dashboard (one-time US$5 fee) and verify an email.
- **Microsoft Edge Add-ons:** register in Partner Center (free).

## 3. Listing text

- **Name:** CaptureKit Cursor Tracker
- **Summary (≤132 chars):** Adds exact cursor tracking and a "zoom here" shortcut to CaptureKit, the free private browser screen recorder.
- **Category:** Productivity / Developer tools
- **Description:**
  > Optional companion for CaptureKit (nishtek.in/capturekit), a free, open-source screen recorder that runs in your
  > browser. Browsers don't record the cursor in tab recordings or tell web apps where it is. This extension records
  > pointer positions and clicks in the tab you are recording, only while you record, and sends them only to your
  > CaptureKit tab. The editor then draws a cursor with click effects and zooms precisely where you click.
  > Alt+Shift+Z adds a zoom from any tab. Nothing is sent over the network and nothing is stored.
- **Icon:** `extension/icons/icon-128.png`. **Screenshots:** 1280×800 from the editor (see `docs/images/`).
- **Privacy policy URL:** https://nishtek.in/capturekit/privacy

## 4. Permission justifications (asked during review)

| Permission | Why |
|---|---|
| Content script on all sites | You can record any tab; the script stays idle unless that tab is being recorded. |
| `storage` | Keeps which tab is being recorded if the browser restarts the extension's background worker. |
| Commands (Alt+Shift+Z) | "Zoom in here" from any tab while recording. |

**Data use:** collects no user data; pointer positions go only to the user's own CaptureKit tab, in the browser.

## 5. After approval

Put the store link on the Help page (`src/components/extension-install.tsx`) above the manual steps, and keep
`APP_ORIGINS` in `extension/content.js` matching the official site.
