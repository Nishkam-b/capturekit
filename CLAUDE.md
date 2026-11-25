@AGENTS.md

# CaptureKit — development instructions

Free, open-source (MIT), local-first browser screen recorder by Nishtek.
Read `PROJECT_PLAN.md` (status) and `ARCHITECTURE.md` (design) before changing code.

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npm run build` — static export to `out/` (must pass before a phase is "done"); `npm start` serves it (scripts/serve.mjs)
- `npm run lint` / `npm run typecheck`
- `npm run test:unit` — pure logic tests
- `npm run test:e2e` — real Chrome + Edge with fake camera/mic and auto-selected screen source (headed; build first)
- `npm run test:extension` — cursor tracking with the real unpacked extension (Edge; branded Chrome ignores `--load-extension`)
- `npm run test:firefox` — opt-in Firefox smoke test
- Before running e2e, stop any server on port 3100: Playwright reuses it, and a stale build there causes confusing failures

## Rules
1. **Work phase by phase.** Only start the next phase in PROJECT_PLAN.md after the
   current one is verified (build + tests + manual check in the browser).
2. **No fakes.** No mock recordings, simulated progress, or buttons that do nothing.
   Unbuilt features appear as clearly-labelled disabled items ("Phase N") or not at all.
3. **Be honest about browser limits.** Never claim `getDisplayMedia` gives cursor
   coordinates. Detect capabilities at runtime and explain what's unavailable.
4. **Local only.** No network calls with user data, no analytics, no paid APIs (the production CSP
   blocks other origins, and `tests/e2e/privacy.spec.ts` checks it),
   no required accounts. Recordings live in IndexedDB.
5. **Engines are framework-free.** Code in `src/engines/*` must not import React or
   Next. UI glue goes in `src/hooks` / `src/components`.
6. **Clean up media.** Every acquired `MediaStream` track must be stopped and every
   `AudioContext` closed on every exit path (including errors and unmount).
7. **Design tokens** live in `src/app/globals.css` (`@theme`). Use them instead of
   raw colours. Lucide icons, 2px stroke. 8px spacing grid.
8. Minimal dependencies. Justify any new runtime dependency in ARCHITECTURE.md.
9. Update `PROJECT_PLAN.md` and `CHANGELOG.md` when a task is verified.
