# DiagView — Build & Development Guide

---

## Prerequisites

| Tool    | Minimum Version |
| ------- | --------------- |
| Node.js | 20.17.0         |
| npm     | 8.0.0           |

---

## Initial Setup

```bash
git clone https://github.com/khadirullah/diagview.git
cd diagview
npm install
```

---

## Development

### Watch mode

Rebuilds all bundles whenever a source file changes. Terser minification is disabled for faster rebuilds.

```bash
npm run dev
```

### Serve the demo locally

Open a page in `demo/` directly in your browser. The demo pages load the released `diagview@<version>` from unpkg. To try a local build, run `npm run build` and switch a demo page other than `index.html` to its commented-out `../dist/diagview.umd.js` script tag.

---

## Production Build

```bash
# Clean previous build artifacts + generate all bundles + TypeScript declarations
npm run build
```

This runs five steps internally:

1. `npm run version:sync` updates version strings (see [Versioning](#versioning))
2. `npm run clean` removes `dist/` and `tsconfig.tsbuildinfo`
3. `npm run build:lib` runs Rollup to produce all bundles
4. `npm run build:css` copies `src/ui/styles.css` to `dist/diagview.css`
5. `npm run build:types` generates `.d.ts` files via `tsc`

### Build outputs

| File                       | Format       | Purpose                                |
| -------------------------- | ------------ | -------------------------------------- |
| `dist/diagview.umd.js`     | UMD          | Browser `<script>` tag (unminified)    |
| `dist/diagview.umd.min.js` | UMD minified | Browser `<script>` tag (production)    |
| `dist/esm/index.js`        | ESM          | Bundlers (Vite, Webpack, Rollup)       |
| `dist/esm/*-<hash>.js`     | ESM chunks   | Lazy-loaded features for the ESM build |
| `dist/diagview.css`        | CSS          | Optional stylesheet (`diagview/style`) |
| `dist/index.d.ts`          | TypeScript   | Type definitions                       |

### Clean only

```bash
npm run clean
```

---

## Testing

### Unit tests (Jest + JSDOM)

```bash
# Run all tests
npm test

# Run with coverage report (HTML + console summary)
npm run test:coverage

# Run a single file
npm test -- tests/search.test.js

# Watch mode
npm test -- --watch
```

### Type check

`npm run typecheck` compiles `tests/types/api.ts` against the built
declarations. Run it after `npm run build`.

### E2E geometry suites (Chromium, Firefox, WebKit)

Interaction paths JSDOM cannot test, such as pan/zoom geometry, share-link
restore accuracy, minimap click precision, rotation and focus trapping, are
checked by Playwright suites in `tests/e2e/`. CI runs them in all three
browsers. See `tests/e2e/README.md` for details:

```bash
npm run build
npx playwright install --with-deps   # once
npm run test:e2e
```

`npm run test:coverage` enforces coverage thresholds and fails if coverage drops below:

| Metric     | Threshold |
| ---------- | --------- |
| Statements | 80%       |
| Lines      | 83%       |
| Functions  | 78%       |
| Branches   | 65%       |

---

## Code Quality

### Lint

```bash
npm run lint         # check
npm run lint:fix     # auto-fix
```

### Format

```bash
npm run format       # runs Prettier on src/, tests/ and root *.js files
```

### Bundle size check

```bash
npm run size
```

Size limits defined in `package.json` under `"size-limit"`:

| Bundle       | Limit |
| ------------ | ----- |
| UMD minified | 40 KB |
| ESM          | 45 KB |

### Bundle analysis

Generates a visual treemap of the bundle at `dist/bundle-stats.html`:

```bash
npm run build:analyze
# Then open dist/bundle-stats.html in your browser
```

---

## Versioning

### Sync version across files

The `version:sync` script updates version strings in:

- `demo/demo-runtime.js` (`var DV_VERSION = '...'`)
- `README.md` and `docs/*.md` (all `diagview@x.y.z` CDN references)
- `demo/*.html` (`unpkg.com/diagview@...` script tags)
- `package.json` (the Jest global `__DV_VERSION__`)

```bash
npm run version:sync
```

This is called automatically as part of `npm run build`.

### Release

Releases are managed by `release-it` with the `@release-it/conventional-changelog` plugin:

```bash
npm run release
```

Run it from `main` with a clean working tree. `.release-it.json` requires both.

This will:

1. Detect the next version from commit messages
2. Update `package.json`, `package-lock.json` and `CHANGELOG.md`
3. Commit as `chore(release): vX.Y.Z` and create the `vX.Y.Z` tag
4. Push to GitHub
5. Create a GitHub Release

> **Note:** `release-it` does not publish to npm (`npm.publish` is `false` in `.release-it.json`). The `publish.yml` workflow publishes to npm when the GitHub Release is published.

---

## Pre-publish Checklist

The `prepublishOnly` script runs automatically before `npm publish`:

```bash
npm run lint && npm test && npm run build
```

---

## Environment Variables

| Variable       | Effect                                             |
| -------------- | -------------------------------------------------- |
| `ROLLUP_WATCH` | Set to `true` by `npm run dev`; disables terser    |
| `ANALYZE=1`    | Enables `rollup-plugin-visualizer` bundle analysis |
