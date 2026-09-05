# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.12] - 2026-09-06

### Fixed

- **Share Links on `file://` Pages** — the share URL was built from `location.origin`, which browsers report as the literal string `"null"` for pages opened from disk, so the URL constructor threw and no link was produced. The link is now built from the page URL with its query and hash removed; the no-leaking-of-existing-params behaviour is unchanged.
- **`DiagView.state` and `DiagView.utils` Missing From the Script-Tag Global** — both were only members of the default export, and the UMD build attaches named exports to `window.DiagView`, so CDN users found them `undefined` (they were reachable only as `DiagView.default.state`) while the typings and API docs promised them. Both are now named exports as well; bundler users are unaffected.
- **Gradients, Markers and Filters Referenced From Inline `style` Lost in Modal and Export** — when a diagram is cloned for fullscreen or export its IDs get a unique prefix and references are rewritten to match, but only elements with a `fill`, `stroke`, `filter`, `clip-path`, `mask` or marker _attribute_ were scanned. SVGs from Inkscape, Illustrator and hand-written files put those references in `style="fill:url(#grad)"` instead, so the clone kept pointing at the un-prefixed IDs. In fullscreen that usually resolved to the original diagram still on the page, but with two diagrams sharing an ID it borrowed the other diagram's definition, and exports taken from the fullscreen view (which serialise the clone on its own) lost the gradient, marker or filter entirely. Elements with `style` references (and `marker-mid`) are now rewritten too, including the quoted `url('#id')` form.
- **Arrow Keys Panned the Wrong Way While Rotated** — Rotation lives on an inner SVG group while Panzoom moves the outer element, so pan deltas are already in screen axes. The leftover inverse-rotation of the arrow-key delta made `ArrowUp` pan sideways at 90°/270° and inverted every arrow at 180°. Removed; arrows now match the screen at every angle.
- **`T` Text-Select Shortcut Stopped Working After the First Close** — The shortcut's event subscription is created once per modal DOM but was torn down by the per-session modal cleanup, so it silently died from the second fullscreen session onward (the toolbar button kept working). The subscription now lives until `destroy()`.
- **`security.allowOverrides: false` Was Bypassed in the Modal** — The fullscreen clone read `data-diagview-sanitize` / `data-diagview-allow-remote` directly, ignoring `allowOverrides` and accepting any value. Per-element overrides are now resolved through a single gate shared by init and modal: honoured only when `allowOverrides` is `true` and the value is `strict`, `permissive` or `off`; otherwise the global mode applies.
- **`init()` Right After `destroy()` Left Nothing Initialized** — `destroy()` is async, so an `init()` issued before it finished saw the instance as still initialized, warned and returned, and the pending teardown then reset everything. React StrictMode and hot module reload trigger exactly this sequence in development. `init()` now queues behind an in-flight `destroy()` and returns a promise that resolves when ready; a second `destroy()` during teardown returns the same promise. Normal synchronous `init()` behaviour is unchanged.
- **`backgroundColor`, `textColor` and `panAnimationDuration` Did Nothing** — All three were documented and validated but never read. `backgroundColor` and `textColor` now override auto-detection (text still passes the WCAG contrast guard); `panAnimationDuration` is applied to arrow-key panning. `configure()` clears the theme cache so colour changes apply immediately.
- **Auto-Init Pre-Empted Manual `init()` in Module, `defer` and Bundler Scripts** — auto-init ran synchronously as soon as the document was past `loading`, which is always the case when a module or deferred script evaluates, so the library initialised itself with defaults and the user's `DiagView.init({ layout: "header" })` one line later was refused with "Already initialized". Auto-init is now scheduled one task later and a synchronous manual `init()` cancels it; a bare `<script src="diagview.umd.js">` page still self-initialises. The `data-diagview-no-auto-init` opt-out is also found on any diagview script tag, not just the first one on the page.
- **SVGs Without a `viewBox` Attribute Were Hidden** — the validity check read `viewBox.baseVal`, which browsers report as a 0×0 rect when the attribute is absent, so every width/height-only SVG (Inkscape default, hand-written) got `display:none` and an error box. Only a `viewBox` that is present and declares zero width or height is rejected now.
- **`destroy()` Left Diagrams Half Initialised** — only wrapped diagrams were torn down, so `layout: "off"` diagrams kept their init flag, pointer cursor and click listener, error-boundary diagrams kept the placeholder and hidden SVG, shadow-root diagrams stayed wrapped, and the index attribute, `dv-svg-content` class, inline styles, per-element accent and the root `--dv-*` variables survived. Because the init flag survived, a following `init({ layout: "header" })` skipped those diagrams. Everything DiagView touches is now recorded and restored. `refresh()` also re-validates diagrams that previously failed and initialises them once their SVG is valid, as the docs already promised.
- **An Invalid `diagramSelector` Bricked the Instance** — `configure({ diagramSelector: "[[[" })` was accepted, the teardown's `querySelector` then threw, `destroy()` rejected before the state reset and every later `init()` was refused. The selector is validated (warn and keep the previous one) and teardown runs in try/finally so state is always reset.
- **Modern CSS Colours Forced White Text on Light Modals** — `getComputedStyle` returns `oklch()`, `lab()` and `color()` verbatim; the parser's digit scan turned `oklch(0.98 0.01 250)` into `rgb(0, 98, 0)`, the contrast guard then reported low contrast and switched to white text. Colours are parsed through the engine now (`CSS.supports` for acceptance, canvas read-back for the modern spaces). Invalid `backgroundColor`/`textColor` values such as `#zzzzzz` or `notacolour` are rejected with a warning instead of silently reusing the previous colour.
- **`data-diagview-scale` and Per-Element Watermarks Were Ignored on Export** — the attribute was parsed but never reached the exporter, and watermark overrides were only read from the diagram open in the modal, so the inline toolbar and `exportToPNG(el)` used the global values. Both are now resolved from the element being exported.
- **Shadow DOM: Unstyled Toolbar and Wrong Share Index** — styles were only injected into `document.head`, so a toolbar built by `initShadowRoot()` rendered unstyled, and shadow diagrams were indexed as `-1`, which share links encoded as the first page diagram. The stylesheet is now installed in each shadow root (`adoptedStyleSheets` where available) and removed on `destroy()`; diagrams are numbered from one list, page diagrams first then each shadow root in registration order.
- **Empty Containers Filled After `init()` Were Never Picked Up** — the mutation observer only looked at added nodes, so an SVG rendered later into a pre-existing `.diagram` container (Mermaid, fetch) did not initialise until a manual `refresh()`. The closest uninitialised container of an added node is now queued too.
- **Config Validation Gaps** — `NaN`, strings and `null` passed the numeric range checks; `security`, `watermark`, `ui` and `performance` could be replaced by non-objects; `allowedImageTypes` was never checked (a string made the modal clone throw); `minZoomScale` above `maxZoomScale` was accepted. Each case now warns and keeps the previous value.
- **`DiagView.state` Was Writable Below the Top Level** — `DiagView.state.events.clear()` dropped the library's own subscribers and nested objects such as `touchState` could be mutated. Nested values are now read-only views; `activePanzoom` stays the live instance and `events` still exposes `on`/`off`/`emit`.
- **`?` Could Not Be Typed Into the Search Box** — the help shortcut ran before the input-focus check. It now defers to focused inputs like every other shortcut. The `M`, `L` and `R` lazy chunk imports also report a failed load instead of raising an unhandled rejection.
- **Share Link Accepted 5- and 7-Digit `dv-c` Colours** — the canvas colour pattern allowed any 3–8 hex digits; only 3, 4, 6 or 8 are valid CSS.
- **Focus Trap Broken on Desktop** — hidden topbar controls (children of a `display:none` row, or the collapsed mobile search) still counted as focusable, so Tab from the last control went nowhere and Shift+Tab from the first control left the dialog. Only rendered controls outside a collapsed search container count now, and the trap steps through its own list on every Tab.
- **`rememberZoom` Ignored Wheel, Keyboard and Button Zooms** — the zoom was saved only on `panzoomend`, which Panzoom fires from pointer-up alone. It is now saved on a debounced `panzoomchange` and flushed on close.
- **Closing During an In-Flight Open Corrupted the Session** — a `closeModal()` that landed during `openFullscreen()`'s awaits let the open resume afterwards: modal listeners were re-registered after cleanup had run, a temp menu was left behind, `onOpen` fired after `onClose` and later opens were dropped. Each phase of the open now re-checks a session token and bails out; the initial-focus frame is cancelled on close as well, so it no longer steals focus back into a closed modal.
- **`openFullscreen()` While Already Open Leaked State** — a second call re-ran the open on top of the live session, stashed the wrong `scroll-behavior` (which stuck after close), leaked visual-viewport listeners and replaced the Panzoom instance without destroying it. It now returns early; switch diagrams by awaiting `closeModal()` first (documented).
- **Text-Select Mode Froze the Laser Pointer** — the viewport stopped `mousemove` in the capture phase while text selection was on, so meeting mode never saw it. Only the events that would start a pan are intercepted now.
- **Export Dropped the First `<g style="transform:…">`** — a leftover "stale Panzoom matrix" heuristic removed structural transforms authored by the diagram. Panzoom only writes to the root `<svg>`, so the block is gone.
- **Self-Hosted Fonts Were Never Embedded in Exports** — only `url(https://…)` sources were inlined; relative and root-relative `@font-face` sources are now resolved against the stylesheet URL before fetching. A failed fetch keeps the original reference and never fails the export.
- **Per-Format Export Functions Threw on Elements Without an SVG** — `exportToSVG/PNG/JPEG/WebP/PDF` and `copyToClipboard` rejected with a `TypeError`; they now show the same "No diagram found" toast as `exportDiagram`.
- **Clipboard Copy Failed on Safari** — the write happened after several awaits, outside the user gesture, and Safari rejects it with `NotAllowedError`. That case now falls back to the download path already used when the clipboard API is unavailable.
- **A Tap Right After a Pinch Reset the Zoom** — the pinch's final `touchend` recorded a tap time, so a single tap within 300 ms counted as a double tap. Pinch-ending touches no longer arm the double-tap detector.
- **Minimap Off by the `viewBox` Origin** — the thumbnail and indicator assumed a `0 0` origin, so Mermaid sequence, gitGraph and mindmap diagrams (negative origin) navigated and indicated off by exactly `(x, y)`. The rotated thumbnail is also re-fitted into its box instead of being clipped, the minimap hides after a rotation resets to 1×, and small window resizes reposition the indicator.
- **Laser Dot Sat 14px Down-Right of the Cursor** — the inline transform replaced the centring translate, and a leftover `visualViewport.scale` factor made it drift under pinch zoom. Both removed.
- **Search Counted Nested Nodes Multiple Times** — a Mermaid `g.node > g.label > text` reported "3 matches"; a whitespace-only query matched everything; and highlight classes were never removed on clear, leaking into exports. Nested candidates are de-duplicated, a blank query clears, and highlights are removed synchronously.
- **Desktop Tooltip Was Never Visible** — it was positioned above the topbar button and clipped by the modal's `overflow:hidden`. It now shows below the element.
- **CSS Cleanup** — dead `.dv-selection-allowed`/`.dv-exp-trans-hint` rules, an invalid `brightness` keyframe property, per-control `outline` rules that always lost to the modal-wide reset, an out-of-range help-modal `z-index`, and a mobile closed-search rule that was overridden by a later rule of equal specificity are fixed or removed. Under `prefers-reduced-motion` the loading spinner keeps turning while everything else, including pseudo-elements, is frozen.

### Security

- **`fixIds` Missed `textPath`, `a`, `feImage` and ARIA References** — after ID prefixing those elements still pointed at the old IDs, which in a multi-diagram page could resolve to another diagram's element. They are rewritten now, as are `aria-labelledby`/`aria-describedby` lists.
- **`fixIds` Mistook Hex-Looking IDs for Colours** — IDs such as `bed`, `fade` or `1234` were left alone inside `<style>` blocks even in `url(#…)` and `#id` selectors, breaking gradients and per-ID CSS after prefixing. The colour heuristic now applies only to property values outside `url()`; upper-case `URL(` and IDs containing `.` or `:` are handled too.
- **Export Ignored Per-Element Security Overrides** — the export clone sanitized with the global mode only, so a diagram marked `data-diagview-sanitize="permissive"` or `data-diagview-allow-remote="true"` lost animations and remote fonts on export. Modal and export now resolve the same overrides through the same `allowOverrides` gate.
- **Prefixed XML Names Bypassed the Sanitizer** — `<svg:script>`, `<svg:animate>`, `<h:iframe>` inside `foreignObject` and `xl:href="javascript:…"` slipped past the blocklists on the string path because tag and attribute names were compared with their prefix, and the serializer then emitted them unprefixed. Names are compared by local name now.
- **CSS Escape Variants Defeated the Remote-Resource Check** — with `allowRemoteResources: false`, `url(\/\/evil…)`, `url(h\ttps://…)`, `@\import`, `@import"…"` and `url(' https://…')` were not recognised. Single-character escapes are decoded and the pattern tolerates the whitespace variants; local `url(#id)` and `data:` images are unaffected.
- **Permissive Mode Let SMIL Write `href` and `on*` Attributes** — `<animate attributeName="href" values="javascript:…">` survived permissive sanitization. Animations targeting `href`/`xlink:href` or any `on*` attribute are dropped in permissive mode; other animations are kept.
- **`<link>`, `<base>` and `<meta>` Inside `foreignObject` Passed Both Modes** — they can load remote stylesheets, rebase every relative URL or redirect the page and are never legitimate in a diagram. Both modes remove them.
- **`performance.criticalFileLimit` Never Triggered** — the size guard only measured string input while the clone path always passes a Node, so the "Diagram blocked" branch was unreachable. Node input is measured by its serialized length; `sanitizeSVG(svg, mode, null)` no longer throws. The export style capture keeps its previous one-million-node cap under its own constant instead of misusing `largeFileThreshold`.

### Changed

- **npm Provenance** — the publish workflow now runs `npm publish --provenance`, so every release carries a signed attestation linking the package on npm to the exact GitHub Actions run and commit that built it. Visible as the "Provenance" badge on the npm package page.

### Added

- **React 18 + StrictMode demo and e2e check** — `demo/framework-react.html` is a real React dev-build tree (StrictMode on) with floating, header and off layout cards that mount, unmount, remount and replace DiagView diagrams, a "Detach DiagView" button that shows `destroy()`/`init()` with everything still mounted, and an "unsafe pattern" toggle that reproduces the DOM-ownership error the framework docs now warn about, contained per card by an error boundary and explained on the page. `tests/e2e/verify-react-strictmode.mjs` drives it in headless Chrome against the local build (21 checks) and, with `--cdn`, against the published version (1.0.11 fails 10 of 21).
- **Browser sweep for every fix above** — `tests/e2e/verify-fixes.mjs` loads `tests/e2e/fixtures/fix-sweep.html` from `file://` (attribute, inline-style, `<style>`-block, sanitizer-override and Mermaid diagrams) and checks the modal clone and fullscreen export for dangling `url(#id)`/`href` references, the `allowOverrides` gate, `backgroundColor`/`textColor`/`panAnimationDuration`, arrow-key panning at every rotation, the `T` shortcut across reopen, the share link on `file://` (including restoring it), the `destroy()`/`init()` race and the UMD `state`/`utils` globals — 30 checks; with `--cdn` the published 1.0.11 passes 14 of 30.

### Removed

- **`immersiveMode`** — Documented as rewriting the host page's viewport meta tag, but never implemented. The pinch-zoom drift it was meant to fix is already handled by the visual-viewport sync on modal open, so the option is removed rather than implemented. Docs and FAQ updated.
- **`printFriendly`** — Never read; the print stylesheet always hides DiagView controls and the modal, which is what the default already promised.
- **`sanitize: "auto"`** — Legacy key that nothing mapped to `security.mode`. Use `security.mode` (`strict` | `permissive` | `off`).

> Passing a removed key logs `DiagView: Unknown config key "…" ignored.` and has no other effect, since none of them ever did anything.

---

## [1.0.11] - 2026-08-31

### Fixed

- **Blurry Diagrams at Zoom on Mobile** — The static `will-change: transform` introduced in v1.0.10 made browsers cache the SVG as a fixed-resolution texture, so zooming stretched a bitmap (worst on mobile). The compositor-layer hint is now gesture-scoped: applied on mouse/touch/wheel activity and released 400 ms after the last change, so the browser re-rasterizes the vectors at the final scale. Smooth panning (including Firefox) _and_ sharp rendering at rest, at any zoom.
- **Escape While Searching Closed the Modal** — Escape is now two-stage during search: with a query it clears the query, with an empty query it exits search mode and returns focus to the modal, and the next Escape closes the modal.
- **Double-Fired Close Sequence** — Rapid Escape presses during a slow close could run the entire modal teardown twice (`onClose` fired twice, focus restore double-ran). A re-entrancy guard makes the close sequence run exactly once.
- **Minimap Broken While Rotated** — Clicking the minimap on a rotated diagram navigated to the wrong location and the viewport indicator was misplaced. Coordinate mapping now goes through the internal rotation group's CTM, pan no longer applies an incorrect rotation "correction" (pan responds in screen axes at every angle), the indicator maps through the snapshot's own CTM (correct at 90°/270° axis swaps) and re-positions after animated pans settle. Verified at 0/90/180/270 with a new e2e suite.
- **Rotation Not Restored by Share Links / rememberZoom** — Restoring a view with `dv-r` (or a remembered rotation) only wrote `state.rotationAngle` without rotating the DOM: recipients saw a rotated minimap over an unrotated diagram at the shared zoom. The rotation is now actually applied (same code path as pressing R) before the zoom/pan restore, and the share corrective pan drops its incorrect rotation compensation. Verified end-to-end: a rotated+zoomed share restores rotation on both diagram and minimap with the center within 1 SVG unit.

---

## [1.0.10] - 2026-08-31

### Fixed

- **Share Links Restoring the Wrong Position** — `@panzoom/panzoom`'s constructor schedules a forced `pan(0,0)` on a 0ms timer, which silently clobbered the restored pan of share links and `rememberZoom` (zoom was kept, position reset to the diagram center — most visible above ~200% zoom). The corrective pan is now deferred past that timer and converges over up to 3 frames; restore accuracy at 3× zoom improved from ~281 SVG units off to <1 unit.
- **Minimap Click Navigation** — Clicks navigated to the wrong location (or blank space) at higher zoom levels because viewBox coordinates were multiplied by the panzoom scale, ignoring the base render scale and letterboxing. Clicks and the viewport indicator now map through the SVG's `ScreenCTM`, landing exactly on the clicked point at any zoom or rotation.
- **Focus Trap Lost After First Modal Close** — Focus management was set up once at modal creation but torn down on every close, so from the second open onward Tab escaped the fullscreen dialog (WCAG failure) and single-key shortcuts died after clicking a toolbar button. It is now re-established on every open.
- **Memory Leak with `onZoomChange`** — The `panzoomchange` listener was registered destroy-scoped per modal open, pinning each discarded SVG clone in memory. Now modal-scoped and cleaned up on close.
- **Sanitizer URL Scheme Bypass** — `javascript:` URLs with embedded whitespace/control characters (e.g. `java&#9;script:`) passed the scheme check while browsers execute them. URL values are now normalized before testing; the anchored scheme colon also stops benign hrefs like `javascript-guide.html` from being stripped. Strict mode's external `<use>` block now also catches protocol-relative `//host/...` references.
- **Cloned Diagram Style Corruption** — Original→clone style and text-attribute copies paired nodes by index _after_ sanitization; any removed node shifted every subsequent pair, corrupting rendering and re-injecting `<style>` content the sanitizer removed. Positional copies now run before sanitization, and inlined computed styles get scrubbed by the sanitizer.
- **Broken `diagview/style` Package Export** — The exports map pointed at `dist/diagview.css`, which no build step produced; `import "diagview/style"` failed. The build now emits the CSS file and the invalid `types` condition was removed.
- **Version Sync Drift** — `scripts/sync-version.js` now also syncs the jest `__DV_VERSION__` global (stale at 1.0.6 since three releases).

### Performance

- **Firefox Pan/Zoom Smoothness** — `will-change: transform` on the modal SVG promotes it to a compositor layer, eliminating Firefox's per-frame re-rasterization during panning (Chromium already did this on its own).

### Testing

- New sanitizer test suite, including a Mermaid-shaped fixture asserting strict mode preserves text labels, `foreignObject` htmlLabels, style blocks, classes, and marker references; clone-alignment regression tests (187 tests total, up from 175).

---

## [1.0.9] - 2026-07-31

### Fixed

- **Mobile Hamburger Menu Touch Scrolling** — Excluded scrollable UI panels (`.diagview-menu`, `.diagview-help-content`) from global `touchmove` `preventDefault()` locks, restoring smooth touch momentum scrolling inside the floating menu on iOS Safari and Android Chrome.

---

## [1.0.8] - 2026-07-30

### Fixed

- **Chrome & Brave Fullscreen Color Picker Alignment** — Re-ordered swatch controls and adjusted input transform origin so the native OS color picker dialog anchors safely inside the screen in fullscreen mode on Chromium browsers (Chrome, Brave, Edge).

---

## [1.0.7] - 2026-07-30

### Added

- **ShareLink Canvas Theme Retention** — Encodes and restores canvas theme mode (`dv-t`) and custom background hex (`dv-c`) in shareable URLs while preserving all existing parameters (`dv-idx`, `dv-z`, `dv-cx`, `dv-cy`, `dv-r`, `dv-q`).
- **Canvas Theme Controls & Color Swatches** — Interactive canvas background customization menu with Light/Dark presets, 6 color swatches (`#ffffff`, `#000000`, `#0b0f19`, `#090d16`, `#0f172a`, `#18181b`), and custom `<input type="color">` hex picker.
- **First-Time Theme Hint Toast** — 6-second informational hint toast (`showFirstTimeThemeHint: true`) with `localStorage` memory (`diagview-canvas-hint-shown`).
- **iOS-Style Transparent Export Toggle** — Modern sliding toggle switch with dynamic disabling for raster background-dependent export formats (JPEG/PDF).

### Changed

- **SVG Text Contrast Normalization** — Stores original text fill in `data-original-fill` attribute. Automatically brightens low-contrast SVG text (< 4.5:1) in Dark mode with `important` priority and restores original colors when switching back to Light mode.
- **Export Grid Layout** — Updated "Copy Image" button layout to span full width (`grid-column: 1 / -1`) in the export menu grid.

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

[Unreleased]: https://github.com/khadirullah/diagview/compare/v1.0.12...HEAD
[1.0.12]: https://github.com/khadirullah/diagview/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/khadirullah/diagview/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/khadirullah/diagview/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/khadirullah/diagview/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/khadirullah/diagview/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/khadirullah/diagview/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/khadirullah/diagview/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/khadirullah/diagview/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/khadirullah/diagview/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/khadirullah/diagview/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/khadirullah/diagview/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/khadirullah/diagview/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/khadirullah/diagview/releases/tag/v1.0.0
