# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.6] - 2026-05-11

### Added

- **Silent Watermark Branding** — Configurable watermark system for exports (`corner`, `background`, or `both` styles) with automatic theme-based contrast-aware strokes.
- **Proportional Safe-Fit Scaling** — New boundary-aware math engine that automatically fits branding text into any aspect ratio without squashing or overflow.
- **Support for 'four-sides' Position** — Ultimate protection mode that places attribution on all four edges of the exported image.

### Fixed

- **Firefox Mobile UI Stability** — Resolved "Search bar jumping" bug by pinning the modal height to `window.innerHeight` and using GPU-accelerated `translate3d` positioning.
- **Cross-Site UI Isolation** — Replaced native checkboxes with custom-styled, theme-isolated components to prevent host-site CSS bleeding (e.g. from Bootstrap/Tailwind resets).
- **Z-Index Collision Protection** — Reinforced modal stacking context and background opacity with `!important` overrides to ensure DiagView always stays on top of sticky website headers.
- **Global Shortcut Reliability** — Overhauled focus management to ensure keyboard shortcuts (M, Space, R, etc.) remain active after using Search, UI tools, or clicking complex diagram elements.
- **Meeting Mode Cursor Artifacts** — Resolved "double pointer" bug by correctly hiding the system cursor in presentation mode.
- **Panzoom Sluggishness When Browser Zoomed** — Replaced the old counter-scaling viewport approach with a "Scale-Free" `position:fixed` layout. The modal now uses exact visual viewport dimensions with no scale transform, ensuring 1:1 CSS pixel interaction for Panzoom regardless of browser zoom level. Also fixes Firefox layout shifts caused by `pageLeft`/`pageTop` discrepancies.
- **Viewport Test Regression** — Fixed pre-existing test failure in `viewport.test.js` by aligning expectations with the Scale-Free viewport refactor.

### Changed

- **Mobile Troubleshooting Docs** — Documented known 3-finger gesture limitations in Firefox Mobile in the FAQ.
- **Codebase Audit & Cleanup** — Removed 13 dead exported functions across 7 modules (`utils.js`, `svg-clone.js`, `panzoom-integration.js`, `rotate.js`, `minimap.js`, `button-factory.js`). Eliminated duplicate `addModalCleanupFunction` definition, removed redundant `LARGE_FILE_THRESHOLD_DEFAULT` constant, added missing `UI_SYNC_THROTTLE` timing constant. Net reduction: 220 lines deleted.
- **Documentation Accuracy** — Updated Node.js version requirements in BUILD.md and CONTRIBUTING.md to match `package.json` engines (`>=20.17.0`). Corrected stale bundle size limits in BUILD.md.

---

## [1.0.5] - 2026-05-05

### Added

- **Premium UI Aesthetics** — Rebuilt the entire UI with glassmorphism, backdrop-filters, and smooth animations.
- **Enterprise Security Overhaul** — New `DOMParser`-based recursive SVG sanitization engine (Strict/Permissive modes).
- **Native Text Selection** — Added toggle to suspend Panzoom and enable native browser text selection over SVG labels.
- **Shadow DOM Support** — Full support for diagrams inside Web Components/Shadow roots.
- **Per-Diagram Overrides** — Support for mixing layout modes (`header`, `floating`, `off`), accent colors, and export scales on the same page via `data-diagview-layout`, `data-diagview-accent`, and `data-diagview-scale` attributes.
- **Sync Version Script** — Automated version synchronization across README and demo files.

### Changed

- **Optimized Interactions** — Refined Minimap, Laser Pointer (Meeting Mode), and 90° Rotation for better performance and stability.
- **Lazy Feature Loading** — Heavy modules (PDF export, search cache, minimap) are now lazy-loaded on demand.
- **Mobile Stability** — Implemented Visual Viewport Synchronization to fix UI drift on pinch-zoom.
- **Documentation Overhaul** — Audited and rewrote all primary documentation (README, API, USAGE, FAQ) for total accuracy.

### Removed

- **Legacy Regex Sanitizer** — Replaced with a more robust DOM-walking sanitizer.

---

## [1.0.4] - 2026-04-20

### Fixed

- **Minimap clipping** — Tall portrait-oriented diagrams (e.g. Mermaid `graph TD`) were partially clipped in the minimap thumbnail. Root cause: coordinate space mismatch. Fix: use `getBoundingClientRect()` for both measurements.
- **Minimap ghosting** — The minimap SVG inherited CSS transforms from Panzoom on the clone element. Fix: snapshot the original SVG via a Data URL.
- **Mobile viewport drift** — UI chrome elements drifted when the browser was pinch-zoomed. Fix: Visual Viewport Synchronization.
- **Double-prefixing of SVG IDs** — IDs on the host page's original SVG were being mutated. Fix: `fixIds()` is now called only on the internal clone.
- **`panzoom.pause()` / `panzoom.resume()` crash** — Fix: replaced with `panzoom.setOptions({ disablePan, disableZoom })`.

### Changed

- **Minimap hidden on mobile** — Minimap is now hidden on viewports narrower than 768 px.
- **Responsive CSS** — Key UI elements now use `clamp()`, `dvh`, and `min()`.
- **`resetConfig()` scope** — Now resets the entire internal state (not just `config`).

### Added

- **Visual Viewport Synchronization** (`viewport.js`) — Keeps the fullscreen modal correctly positioned when pinch-zoomed.
- **`immersiveMode` config option** — Opt-in mobile viewport locking.
- **`onError` callback** — Fires when a diagram container's SVG fails validation.
- **Per-element `data-diagview-sanitize` and `data-diagview-allow-remote`** — Fine-grained security control.

---

## [1.0.3] - 2026-04-07

### Fixed

- Resolved "Exit Code 128" issue in the automated npm publish workflow.

### Changed

- Upgraded GitHub Actions build environment to Node.js 24.

---

## [1.0.2] - 2026-04-07

### Added

- **GitHub Actions CI/CD** — Automated test, lint, build, and publish pipeline.
- **Jest unit test suite** — 25+ test files covering all major modules.
- **Coverage reporting** — Istanbul/c8 coverage with enforced thresholds.
- **`SECURITY.md`** — Responsible disclosure policy.

### Fixed

- Extracted CSS from a 1,151-line JS string into `src/ui/styles.css`.
- Standardized all demo CDN references to `@panzoom/panzoom@4.5.1`.
- Stale `dist/esm/` artifacts from previous builds no longer accumulate.

---

## [1.0.1] - 2026-02-10

### Fixed

- TypeScript declaration files (`.d.ts`) were not generated due to a stale `tsconfig.tsbuildinfo` incremental build cache.

### Changed

- Updated CDN version reference from pinned `@1.0.0` to floating `@1`.

---

## [1.0.0] - 2026-02-07

Initial public release.

[Unreleased]: https://github.com/khadirullah/diagview/compare/v1.0.6...HEAD
[1.0.6]: https://github.com/khadirullah/diagview/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/khadirullah/diagview/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/khadirullah/diagview/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/khadirullah/diagview/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/khadirullah/diagview/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/khadirullah/diagview/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/khadirullah/diagview/releases/tag/v1.0.0
