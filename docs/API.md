# DiagView public API reference

All methods are available on the `DiagView` global (UMD) or the default export (ESM). The ESM build also exports each of them by name, along with `state`, `utils` and `version`.

---

## Table of Contents

- [Core Methods](#core-methods)
- [Export Methods](#export-methods)
- [Modal Methods](#modal-methods)
- [Utility Methods](#utility-methods)
- [State (read-only)](#state-read-only)
- [Configuration Reference](#configuration-reference)
- [TypeScript](#typescript)

---

## Core Methods

### `DiagView.init(options?)`

Initialize DiagView. Injects styles, creates the modal DOM, sets up keyboard shortcuts, starts the MutationObserver, and processes all matching diagrams on the page.

**Signature:** `init(options?: DiagViewOptions): Promise<void>`

```javascript
DiagView.init();
DiagView.init({ layout: "header", showMinimap: false });
```

Initialization runs synchronously, so you do not need to await it in normal use. The returned promise exists for one case: if a `destroy()` is still in flight when `init()` is called, the initialization is queued behind it and the promise resolves once DiagView is ready. This is what happens under React StrictMode and hot module reload, where cleanup calls `destroy()` and the effect immediately calls `init()` again.

Calling `init()` more than once without an intervening `destroy()` is a no-op (logs a warning).

---

### `DiagView.destroy()`

Fully tear down DiagView. Removes all DOM elements, stops observers, destroys Panzoom, forgets remembered zoom states, and resets all internal state. The configuration goes back to the defaults, the Canvas Theme to Auto and Text Colours to Original.

**Signature:** `destroy(): Promise<void>`

```javascript
await DiagView.destroy();
// Safe to call init() again afterward
DiagView.init({ layout: "floating" });
```

Calling `destroy()` again while a teardown is in flight returns the same promise rather than starting a second teardown. Calling `init()` during that window is also safe; see `init()` above.

---

### `DiagView.refresh()`

Scan the document for any new diagrams added after initialization and initialize them. Also re-checks for share link parameters.

**Signature:** `refresh(): void`

```javascript
// After dynamically adding diagram elements
document.getElementById("container").innerHTML = newDiagramHtml;
DiagView.refresh();
```

---

### `DiagView.configure(options)`

Update configuration at runtime without re-initializing. Syncs the theme, Readable text colours, the canvas grid and branding visibility immediately.

**Signature:** `configure(options?: DiagViewOptions): void`

```javascript
DiagView.configure({
  backgroundColor: "#0f172a",
  showBranding: false,
});
```

DiagView checks some options on `init()` and `configure()`. An invalid value logs a warning and keeps the value that was in effect before. The exception is `layout`, which falls back to `'floating'`. `highResScale`, `mobileScale`, `maxZoomScale`, `minZoomScale` and `maxPixels` must be finite numbers in their documented range, and `minZoomScale` may not exceed `maxZoomScale`. Timing options such as `toastDuration` must be 0 or more. `canvasGrid` must be `'none'` or `'dots'`, and `exportFonts` must be `'used'`, `'all'` or `'none'`. `diagramSelector` must be a selector the browser accepts, and `allowedImageTypes` must be an array of strings. The `security`, `watermark`, `ui` and `performance` groups must be objects, and DiagView merges them into the current settings. DiagView does not check the values inside those groups, booleans, callbacks or the PDF options, with these exceptions. An unknown `security.mode` such as `'stirct'` logs one warning, and DiagView stores and uses `'strict'`. An unknown `security.exportMode` logs one warning, and DiagView stores and uses `'same'`. Export checks the watermark. An unknown `watermark.style`, `watermark.position` or `watermark.placement` logs a warning and uses the default, `'corner'`, `'bottom-right'` or `'diagram'`. An `opacity` below 0 or above 1 logs a warning and uses 0 or 1. An `opacity` that is not a number logs a warning and uses 0.2. A missing or empty value uses the default without a warning. An `accentColor`, `backgroundColor` or `textColor` the browser cannot parse logs a warning, and DiagView detects that colour from the page instead. A `warningColor` the browser cannot parse logs a warning, and warning notices use the default amber. DiagView ignores unknown top-level keys and logs a warning.

---

### `DiagView.getConfiguration()`

Return a copy of the current configuration. Changing the copy does not change DiagView; use `configure()` for that.

**Signature:** `getConfiguration(): DiagViewConfig`

```javascript
const config = DiagView.getConfiguration();
console.log(config.layout); // 'floating'
console.log(config.highResScale); // 4
```

---

### `DiagView.initShadowRoot(shadowRoot)`

Initialize diagrams inside a Shadow DOM root. Must be called after `DiagView.init()`.

**Signature:** `initShadowRoot(shadowRoot: ShadowRoot): void`

```javascript
DiagView.init();
DiagView.initShadowRoot(myElement.shadowRoot);
```

---

## Export Methods

All export methods are async. `exportDiagram()` resolves to a boolean that says whether the export worked. The others resolve to `undefined`.

### `DiagView.exportDiagram(element, mode, options?)`

Generic export dispatcher.

**Signature:** `exportDiagram(element: HTMLElement, mode: ExportMode, options?: ExportOptions | SVGSVGElement | null): Promise<boolean>`

```typescript
type ExportMode =
  | "png"
  | "svg"
  | "jpeg"
  | "webp"
  | "pdf"
  | "copy"
  | "copy-svg"
  | "png-transparent"
  | "webp-transparent"
  | "download";
```

```javascript
await DiagView.exportDiagram(el, "png", { transparent: true });
await DiagView.exportDiagram(el, "svg");
await DiagView.exportDiagram(el, "pdf");
await DiagView.exportDiagram(el, "copy");
```

`"copy"` puts a PNG on the clipboard and `"copy-svg"` copies the SVG markup as text. When the browser cannot copy, they download the PNG or the .svg file instead. `"png-transparent"` and `"webp-transparent"` export with a transparent background. `"download"` exports a PNG. An unknown mode exports a PNG. You may omit `options` or pass `null`. An `<svg>` element in place of `options` works as `modalClone`, which keeps code written for the older `exportDiagram(element, mode, svg)` form working. `exportDiagram()` uses `filename` when you pass one. Otherwise it names the file from the diagram's title and the local date and time, as in `checkout_sequence_2026-09-28_011554`. The title is `data-title` first, then a `<title>` directly inside the `<svg>`, then a chart title Mermaid draws, and `diagram_export` when there is none. DiagView lowercases it, turns spaces into underscores and drops every character other than letters, digits, `.`, `-` and `_`. `silent` hides the progress notice for PNG, JPEG, WebP and Copy Image, the JPEG transparency notice, and the hard-to-read labels and linked images warnings in every mode (see [Text Colours](USAGE.md#text-colours) and [Linked images](USAGE.md#linked-images)). It is the call the toolbar and the fullscreen menu use, and the only export call that fires the `onExport` callback. It fires only after the export succeeds, so a failed or blocked export does not fire it. The promise resolves to `true` when the export succeeds, after `onExport`, and to `false` when it fails or is blocked. Success and failure follow the same rules as `onExport`. The `exportTo*()` methods and `copyToClipboard()` do not fire it.

### `DiagView.exportToPNG(element, options?)`

```javascript
await DiagView.exportToPNG(el);
await DiagView.exportToPNG(el, { transparent: true, filename: "my-chart" });
```

### `DiagView.exportToSVG(element, options?)`

```javascript
await DiagView.exportToSVG(el);
await DiagView.exportToSVG(el, { transparent: true });
```

### `DiagView.exportToJPEG(element, options?)`

```javascript
await DiagView.exportToJPEG(el);
await DiagView.exportToJPEG(el, { filename: "export" });
```

### `DiagView.exportToWebP(element, options?)`

```javascript
await DiagView.exportToWebP(el);
await DiagView.exportToWebP(el, { transparent: true });
```

### `DiagView.exportToPDF(element, options?)`

Lazy-loads jsPDF on first call.

```javascript
await DiagView.exportToPDF(el);
await DiagView.exportToPDF(el, { filename: "report" });
```

### `DiagView.copyToClipboard(element, options?)`

Copies a PNG to the system clipboard. Requires HTTPS or localhost. If the browser denies the write (Safari does once the click that started the export is over), the PNG is downloaded instead and the toast says so.

```javascript
await DiagView.copyToClipboard(el);
```

All export methods resolve without throwing when `element` contains no `<svg>`; they show a "No diagram found" toast instead. Per-diagram `data-diagview-scale` and `data-diagview-watermark-*` attributes on the element are honoured by every export path, inline or fullscreen. On touch devices and narrow screens, `mobileScale` applies instead.

SVG exports and the images drawn from them embed the page fonts their labels use. Set `exportFonts` to `'all'` to embed every `@font-face` rule on the page, or to `'none'` to embed no fonts.

An export of the diagram open in fullscreen during a search keeps the dimming and the outline. Set `exportSearchHighlight` to `false` to leave them out. The search in the viewer stays as it was.

### Export Options

```typescript
interface ExportOptions {
  transparent?: boolean; // Transparent background (default: false)
  filename?: string; // Base filename without extension (default: auto)
  silent?: boolean; // Skip the progress and JPEG transparency toasts (PNG, JPEG, WebP and Copy Image), and the hard-to-read labels and linked images warnings (default: false)
  modalClone?: SVGSVGElement | null; // The viewer's copy to export in place of the page SVG, as the fullscreen menu does (default: null)
}
```

`copyToClipboard()` ignores `transparent`. `exportToPDF()` keeps the background and shows a warning when `transparent` is set.

While Readable is on under Text Colours, every export with a background recolours hard-to-read labels against that background, as the viewer does. Transparent exports and `"copy-svg"` keep the author's colours. See [Text Colours](USAGE.md#text-colours).

---

## Modal Methods

### `DiagView.openFullscreen(element, options?)`

Open the fullscreen viewer for a diagram element.

**Signature:** `openFullscreen(element: HTMLElement, options?: OpenOptions): Promise<void>`

```typescript
interface OpenOptions {
  zoom?: number; // Initial zoom scale (e.g. 2.5)
  searchQuery?: string; // Pre-fill the search input
}
```

```javascript
const el = document.querySelector(".diagram");

await DiagView.openFullscreen(el);
await DiagView.openFullscreen(el, { zoom: 2.5 });
await DiagView.openFullscreen(el, { searchQuery: "database" });
await DiagView.openFullscreen(el, { zoom: 1.5, searchQuery: "auth" });
```

While the modal is already open or still opening, `openFullscreen()` returns without doing anything. To switch to another diagram, close first:

```javascript
await DiagView.closeModal();
await DiagView.openFullscreen(otherEl);
```

---

### `DiagView.closeModal()`

Programmatically close the fullscreen modal. Runs all cleanup, restores focus, and fires `onClose`.

**Signature:** `closeModal(): Promise<void>`

```javascript
DiagView.closeModal();
```

---

## Utility Methods

### `DiagView.utils.sanitizeSVG(input, mode?, options?)`

Sanitize an SVG string or DOM Node to prevent XSS injection.

**Signature:**

```typescript
sanitizeSVG(
  input: string | Node,
  mode?: 'strict' | 'permissive' | 'off',
  options?: number | SanitizeOptions | null
): string | Node | null
```

```typescript
interface SanitizeOptions {
  maxChars?: number; // Block input longer than this (Nodes are measured by their serialized length)
  allowRemoteResources?: boolean; // Allow external CSS/fonts
  allowedImageTypes?: string[]; // Allowed data: URI image types
  removed?: RemovedCode; // Filled in with the code the sanitizer removed
}

interface RemovedCode {
  scripts: number; // <script> elements
  handlers: string[]; // on* attribute names, one entry per removal
  urls: number; // javascript: links, including ones an animation would write
}
```

```javascript
// Sanitize a string
const clean = DiagView.utils.sanitizeSVG(rawSvg, "strict");

// With a size limit
const clean = DiagView.utils.sanitizeSVG(rawSvg, "strict", { maxChars: 500000 });

// Sanitize a DOM node. It returns a new node and leaves the original as it was.
const cleanNode = DiagView.utils.sanitizeSVG(svgElement, "permissive");

// Find out what code it removed
const removed = { scripts: 0, handlers: [], urls: 0 };
DiagView.utils.sanitizeSVG(rawSvg, "strict", { removed });
```

Input over `maxChars` is blocked with a console error: a string returns `""`, a Node returns `null`. `options` may be omitted or `null`.

---

### `DiagView.version`

The current library version string.

```javascript
console.log(DiagView.version); // e.g. "1.0.12"
```

---

## State (read-only)

`DiagView.state` is a read-only Proxy over the internal state object, at every depth: nested objects come back as read-only views, and collections (Sets, Arrays, Maps) as snapshots. Writes and deletes log a warning and are ignored. Two exceptions: `activePanzoom` is the live Panzoom instance while the modal is open (its methods are safe to call), and `events` exposes `on`, `off` and `emit` bound to the internal event bus.

```typescript
interface PublicState {
  isInitialized: boolean;
  isModalOpen: boolean;
  isModalOpening: boolean;
  rotationAngle: 0 | 90 | 180 | 270;
  currentDiagramIndex: number;
  meetingMode: boolean;
  searchMatches: Element[];
  activeCanvasThemeMode: "auto" | "light" | "dark" | "custom"; // Canvas theme picked in the menu
  customCanvasColor: string | null; // Canvas colour when the mode is "custom"
  readableText: boolean; // Text Colours set to Readable in the menu
  // Internal collections returned as snapshots:
  cleanupFunctions: Set<Function>;
  modalCleanupFunctions: Set<Function>;
}
```

```javascript
// Check if modal is open
if (DiagView.state.isModalOpen) { ... }

// Get current rotation
console.log(DiagView.state.rotationAngle); // 0 | 90 | 180 | 270

// Current search matches (read-only snapshot)
console.log(DiagView.state.searchMatches.length);
```

> **Do not attempt to mutate `DiagView.state` directly.** Writes are ignored with a warning. Use `configure()`, `openFullscreen()`, and other API methods to change behaviour.

---

## Configuration Reference

### Full type definition

```typescript
interface DiagViewConfig {
  // Selectors
  diagramSelector: string; // default: '.diagram, .chart, [data-diagram]'

  // Theme
  accentColor: string | null; // default: null (auto-detect)
  warningColor: string; // default: '#f59e0b' (warning notices)
  backgroundColor: string | null; // default: null (auto-detect)
  textColor: string | null; // default: null (auto-detect)

  // Layout
  layout: "header" | "floating" | "off"; // default: 'floating'

  // UI
  ui: {
    buttons: {
      style: "transparent" | "accent" | "solid" | "neutral"; // default: 'accent'; header and floating layouts alike, transparent has no border
      icons: {
        copy: string | null; // null = built-in outline icon; a custom SVG draws as written, use currentColor to follow the button colour
        download: string | null;
        fullscreen: string | null;
      };
    };
  };
  showBranding: boolean; // default: true
  showKeyboardHelp: boolean; // default: true; false also hides the "Press ? for shortcuts" hint
  helpTimeout: number; // default: 8000 (ms); 0 = never
  animateOpen: boolean; // default: true

  // Interaction
  naturalPanning: boolean; // default: false; true = arrow keys move the diagram in the arrow's direction
  rotateKeepsView: boolean; // default: false; true = rotate keeps the view (size on screen and centre), zoom % adjusts
  rememberZoom: boolean; // default: false
  showMinimap: boolean; // default: true
  canvasGrid: "none" | "dots"; // default: 'none'; dot grid behind the fullscreen diagram

  // Zoom / Pan
  maxZoomScale: number; // default: 25 (range: 1 to 50)
  minZoomScale: number; // default: 0.05 (range: 0.01 to 1)
  zoomAnimationDuration: number; // default: 200 (ms)
  panAnimationDuration: number; // default: 200 (ms)

  // Export
  highResScale: number; // default: 4 (range: 1 to 10)
  mobileScale: number; // default: 2 (range: 1 to 5)
  maxPixels: number; // default: 16777216 (16MP), range: 1000000 to 268435456
  exportSearchHighlight: boolean; // default: true; false = exports made during a search leave out its dimming and outline
  exportFonts: "used" | "all" | "none"; // default: 'used'; page fonts to embed in exports

  // Security
  security: {
    mode: "strict" | "permissive" | "off"; // default: 'strict'
    allowOverrides: boolean; // default: true
    allowRemoteResources: boolean; // default: false
    exportMode: "same" | "strict"; // default: 'same'; 'strict' cleans every export and copy in strict mode
  };
  allowedImageTypes: string[]; // default: ['png', 'jpeg', 'webp', 'gif']

  // Performance
  performance: {
    largeFileThreshold: number; // default: 1000000; no effect in this version
    criticalFileLimit: number; // default: 50000000 characters of SVG markup
  };

  // Notifications
  toastDuration: number; // default: 2500 (ms), success and info notices
  errorToastDuration: number; // default: 5000 (ms), error notices (warnings always stay 5000)
  showFirstTimeThemeHint: boolean; // default: true

  // PDF
  pdfLibraryUrl: string; // default: cdnjs jsPDF URL
  pdfLibraryIntegrity: string | null; // SRI hash; null when using custom URL

  // Callbacks
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
  onExport: ((format: string, filename: string) => void) | null;
  onZoomChange: ((scale: number) => void) | null;
  onError: ((error: Error) => void) | null;

  // Watermark (Silent Branding)
  watermark: {
    enabled: boolean; // default: false
    text: string; // branding text
    style: "corner" | "background" | "both"; // default: 'corner'
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "four-sides"; // default: 'bottom-right'; four-sides needs the corner or both style
    placement: "diagram" | "margin"; // default: 'diagram'; 'margin' draws corner and side text in the blank margin around the diagram
    opacity: number; // default: 0.2 (range: 0 to 1)
  };
}
```

---

## TypeScript

DiagView ships TypeScript declarations at `dist/index.d.ts`.

```typescript
import DiagView from "diagview";

DiagView.init({
  layout: "floating",
  showMinimap: false,
  onOpen: () => console.log("opened"),
});

const el = document.querySelector<HTMLElement>(".diagram")!;
await DiagView.openFullscreen(el, { zoom: 2 });
await DiagView.exportToPNG(el, { transparent: true });
```

The declarations come from the JSDoc in the source. `init()` and `configure()` take `DiagViewOptions`, `getConfiguration()` returns `DiagViewConfig`, and the export functions take `ExportOptions`. The package exports all four types, with `ExportMode`:

```typescript
import type { DiagViewOptions, ExportMode } from "diagview";
```

`DiagViewOptions` is `DiagViewConfig` with every key optional, nested groups included. Unknown keys still compile, because DiagView only warns about them at runtime.

The declarations describe the package import. The `DiagView` global that the script-tag build creates has no type declaration.

---

## Browser Support

| Browser         | Minimum Version |
| --------------- | --------------- |
| Chrome          | 90              |
| Firefox         | 88              |
| Safari          | 14              |
| Edge (Chromium) | 90              |
| iOS Safari      | 14              |
| Android Chrome  | 90              |

Internet Explorer is not supported.

The custom colour swatch in the ☰ menu shows its keyboard focus ring through `:has()`. Chrome before 105, Firefox before 121 and Safari before 15.4 lack `:has()`, so there the swatch shows no ring. The picker still works from the keyboard.
