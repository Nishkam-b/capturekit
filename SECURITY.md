# Security Policy

## Model
CaptureKit has no backend. Recordings, screenshots and settings are stored in the
browser's IndexedDB/localStorage for this site's origin only, and are never uploaded.

What CaptureKit accesses, and when:
- **Screen**: only after the user picks a surface in the browser's own dialog. The
  CaptureKit tab itself is excluded from the picker.
- **Microphone / camera**: only after the user turns them on.
- **Network**: static app files only. Fonts are self-hosted at build time.

## Supported versions
Only the latest release receives fixes.

## Reporting a vulnerability
Please **do not open a public issue**. Report privately via GitHub's
"Report a vulnerability" (Security Advisories) on the repository once published.
Include steps to reproduce and the browser/OS used. We aim to acknowledge within 7 days.

In scope: data leaving the device, permission misuse, XSS, unsafe handling of
imported files (future import features), dependency vulnerabilities.
