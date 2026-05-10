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

Open `demo/index.html` directly in your browser after building. The demo pages reference `../dist/diagview.umd.js` (relative path).

---

## Production Build

```bash
# Clean previous build artifacts + generate all bundles + TypeScript declarations
npm run build
```

This runs four steps internally:

1. `npm run version:sync` — Updates version strings in `demo/demo-runtime.js` and `README.md`
2. `npm run clean` — Removes `dist/` and `tsconfig.tsbuildinfo`
3. `npm run build:lib` — Runs Rollup to produce all bundles
4. `npm run build:types` — Generates `.d.ts` files via `tsc`

### Build outputs

| File                       | Format       | Purpose                             |
| -------------------------- | ------------ | ----------------------------------- |
| `dist/diagview.umd.js`     | UMD          | Browser `<script>` tag (unminified) |
| `dist/diagview.umd.min.js` | UMD minified | Browser `<script>` tag (production) |
| `dist/esm/index.js`        | ESM          | Bundlers (Vite, Webpack, Rollup)    |
| `dist/index.d.ts`          | TypeScript   | Type definitions                    |

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
npx jest tests/search.test.js

# Watch mode
npx jest --watch
```

Coverage thresholds are enforced. The build will fail if coverage drops below:

| Metric     | Threshold |
| ---------- | --------- |
| Statements | 53%       |
| Lines      | 53%       |
| Functions  | 48%       |
| Branches   | 38%       |

---

## Code Quality

### Lint

```bash
npm run lint         # check
npm run lint:fix     # auto-fix
```

### Format

```bash
npm run format       # runs Prettier on src/ and tests/
```

### Bundle size check

```bash
npm run size
```

Size limits defined in `package.json` under `"size-limit"`:

| Bundle       | Limit |
| ------------ | ----- |
| UMD minified | 34 KB |
| ESM          | 38 KB |

### Bundle analysis

Generates a visual treemap of the bundle at `dist/bundle-stats.html`:

```bash
ANALYZE=1 npm run build:analyze
# Then open dist/bundle-stats.html in your browser
```

---

## Versioning

### Sync version across files

The `version:sync` script updates version strings in:

- `demo/demo-runtime.js` (`var DV_VERSION = '...'`)
- `README.md` (all `diagview@x.x.x` CDN references)

```bash
npm run version:sync
```

This is called automatically as part of `npm run build`.

### Release

Releases are managed by `release-it` with the `@release-it/conventional-changelog` plugin:

```bash
npm run release
```

This will:

1. Detect the next version from commit messages
2. Update `package.json`, `CHANGELOG.md`, and version strings
3. Create a git tag
4. Push to GitHub
5. Create a GitHub Release

> **Note:** Publishing to npm is handled separately by the CI pipeline after a tag is pushed. The `npm.publish` key in `.release-it.json` is set to `false`.

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
