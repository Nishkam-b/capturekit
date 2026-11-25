# Release process

CaptureKit follows [semantic versioning](https://semver.org/). Until 1.0, minor versions may change the
storage format; migrations keep older recordings readable (see `normalizeProject` and the IndexedDB upgrade).

## Before a release

1. All CI checks are green on `main`.
2. `npm test` passes locally (Chrome, Edge, extension).
3. The **manual release checklist** in [TESTING.md](TESTING.md) is done for the areas the release touches.
4. Update the version in `package.json`, `src/config/site.ts` and, if the extension changed, `extension/manifest.json`.
5. Move the "Unreleased" notes in `CHANGELOG.md` under the new version and date.
6. Update `PROJECT_PLAN.md` statuses.

## Publishing

1. Commit with a message like `Release v0.8.0`.
2. Tag it: `git tag v0.8.0 && git push --tags`.
3. Create a GitHub release from the tag and paste that version's changelog section.
4. Attach a zip of `extension/` (for people who load the extension unpacked).
5. GitHub Pages deploys automatically from `main` (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## What 1.0 means

1.0 is tagged once the full manual checklist has passed in Chrome and Edge on Windows and macOS, and the Firefox
smoke test has run. Until then, releases are 0.x so users know some real-world behaviour isn't verified yet.
