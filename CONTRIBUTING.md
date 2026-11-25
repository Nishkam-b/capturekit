# Contributing to CaptureKit

Thanks for helping! CaptureKit aims to be simple, reliable and private.

## Before you start
- Read [ARCHITECTURE.md](ARCHITECTURE.md) and the status in [PROJECT_PLAN.md](PROJECT_PLAN.md).
- For anything bigger than a small fix, open an issue first to agree on the approach.
- Good first contributions: items on the [manual release checklist](docs/TESTING.md#manual-release-checklist)
  (run them and report results), Firefox/Safari fixes, translations of the user guide.

## Ground rules
1. **No fake features.** Don't add buttons, progress bars or screens that don't really work.
   Unbuilt features may appear only as clearly labelled, disabled items.
2. **Be honest about browser limits.** Detect capabilities at runtime and explain what isn't available.
3. **Local first.** No requests to other origins, no analytics, no paid APIs, no required accounts.
   The production build's Content-Security-Policy blocks other origins, and a test checks it, so don't loosen it.
4. **Engines stay framework-free.** `src/engines/*` must not import React or Next.js.
5. **Release media.** Stop every `MediaStream` track and close every `AudioContext` on every exit path.
6. **Few dependencies.** Justify any new runtime dependency in your PR (we currently have three: Next.js, React, Lucide).
7. **Keep data readable.** If you change a stored shape, add a migration (`normalizeProject`, IndexedDB upgrade)
   and a test that old data still loads.

## Workflow
```bash
npm install
npm run dev                     # http://localhost:3000
npm run lint && npm run typecheck
npm run test:unit
npm run build && npm run test:e2e   # real Chrome + Edge with fake devices (headed)
npm run test:extension          # cursor extension (Edge)
```
- Add or update tests for behaviour you change. Recording paths are tested end to end with Chrome's fake
  devices; see [docs/TESTING.md](docs/TESTING.md) for what automation can and can't prove.
- Stop any server on port 3100 before e2e runs: Playwright reuses it.
- Update `CHANGELOG.md` (Unreleased) and, when a roadmap item is verified, `PROJECT_PLAN.md`.
- Keep PRs focused, and say what you tested and in which browsers (the PR template asks).

## Style
TypeScript strict; Tailwind with the tokens in `src/app/globals.css`; Lucide icons; an 8px spacing grid.
Prefer clear names over comments, and use comments for the *why*. UI copy is plain, friendly and honest.
