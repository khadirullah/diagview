# DiagView public API reference

All methods are available on the `DiagView` global (UMD) or the default export (ESM). The ESM build also exports each of them by name, along with `state`, `utils` and `version`.

---

## Table of contents

- [Core methods](#core-methods)
- [Export methods](#export-methods)
- [Modal methods](#modal-methods)
- [Utility methods](#utility-methods)
- [State (read-only)](#state-read-only)
- [Configuration reference](#configuration-reference)
- [TypeScript](#typescript)
- [Browser support](#browser-support)

---

## Core methods

### `DiagView.init(options?)`

Initialize DiagView. Injects styles, creates the modal DOM, sets up keyboard shortcuts, starts the MutationObserver, and processes all matching diagrams on the page.

**Signature:** `init(options?: DiagViewOptions): Promise<void>`

```javascript
DiagView.init();
DiagView.init({ layout: "header", showMinimap: false });
```

Initialization runs synchronously in normal use, so you do not need to await it. The returned promise stays pending in two cases. If a `destroy()` is still in flight when `init()` is called, DiagView queues the initialization behind it. This is what happens under React StrictMode and hot module reload, where cleanup calls `destroy()` and the effect immediately calls `init()` again. If `init()` runs before the page has a `<body>`, as from a plain script in `<head>`, DiagView waits for `DOMContentLoaded` and initializes then. In both cases the promise resolves once DiagView is ready. On a page that has finished loading with no `<body>`, such as an SVG file, `init()` logs a warning and resolves without starting.

Calling `init()` more than once without an intervening `destroy()` is a no-op (logs a warning).

---

### `DiagView.destroy()`

Fully tear down DiagView. Removes all DOM elements, stops observers, destroys Panzoom, forgets remembered zoom states, and resets all internal state. The configuration goes back to the defaults, the Canvas Theme to Auto and Text Colours to Original.

Each diagram and its SVG get back their own classes and inline styles. DiagView removes the `data-diagview-*` attributes it added, the `--dv-*` variables on `<html>`, and the `tabindex="-1"` it gives a diagram to hold focus after the viewer closes. A `tabindex` the page set itself stays. DiagView removes a `style` or `class` attribute that it added and left empty from `<html>`, the diagram and its SVG, and closing the viewer does the same for `<body>`, also when `destroy()` closes it. An attribute the page wrote itself stays, even an empty one. The `diagview-canvas-hint-shown` key in `localStorage` stays, so the theme hint does not come back. See [Teardown and reinitialize](USAGE.md#teardown-and-reinitialize).

**Signature:** `destroy(): Promise<void>`

```javascript
await DiagView.destroy();
// Safe to call init() again afterward
DiagView.init({ layout: "floating" });
```

`destroy()` resets the options, so `init()` with no options afterward starts from the defaults. On a page that set its own `diagramSelector`, that `init()` looks for `.diagram, .chart, [data-diagram]` and finds none of the page's diagrams. DiagView logs a warning in that case. To start again with the same options, save them before `destroy()`:

```javascript
const options = DiagView.getConfiguration();
await DiagView.destroy();
DiagView.init(options);
```

Calling `destroy()` again while a teardown is in flight returns the same promise rather than starting a second teardown. Calling `init()` during that window is also safe; see `init()` above.

`destroy()` also cancels a start that is still waiting. With the script in `<head>`, that is the auto-init or an `init()` waiting for `DOMContentLoaded`. It is also an `init()` queued behind a teardown in flight. An `init()` called after that `destroy()` starts as usual.

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

DiagView checks some options on `init()` and `configure()`. An invalid value logs a warning and keeps the value that was in effect before. The exception is `layout`, which falls back to `'floating'`. `highResScale`, `mobileScale`, `maxZoomScale`, `minZoomScale` and `maxPixels` must be finite numbers in their documented range, and `minZoomScale` may not exceed `maxZoomScale`. Timing options must be 0 or more. `toastDuration` and `errorToastDuration` must be 1 or more, since a notice has no close button. `canvasGrid` must be `'none'` or `'dots'`, `offHint` must be `'none'`, `'icon'`, `'label'` or `'below'`, and `exportFonts` must be `'used'`, `'all'` or `'none'`. `diagramSelector` must be a selector the browser accepts, and `allowedImageTypes` must be an array of strings. The `security`, `watermark`, `ui`, `performance` and `offHintText` groups must be objects, and DiagView merges them into the current settings. `offHintText.mouse` and `offHintText.touch` must be strings. DiagView does not check the values inside those groups, booleans, callbacks or the PDF options, with these exceptions. An unknown `security.mode` such as `'stirct'` logs one warning, and DiagView stores and uses `'strict'`. An unknown `security.exportMode` logs one warning, and DiagView stores and uses `'same'`. Export checks the watermark. An unknown `watermark.style`, `watermark.position` or `watermark.placement` logs a warning and uses the default, `'corner'`, `'bottom-right'` or `'diagram'`. An `opacity` below 0 or above 1 logs a warning and uses 0 or 1. An `opacity` that is not a number logs a warning and uses 0.2. A missing or empty value uses the default without a warning. An `accentColor`, `backgroundColor` or `textColor` the browser cannot parse logs a warning, and DiagView detects that colour from the page instead. A `warningColor` the browser cannot parse logs a warning, and warning notices use the default amber. DiagView ignores unknown top-level keys and logs a warning. It also skips any `__proto__`, `constructor` or `prototype` key at every depth, so options parsed from JSON cannot change `Object.prototype`.

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

Closing the viewer puts focus back on the button or diagram inside the shadow root that opened it.

---

## Export methods

All export methods are async. `exportDiagram()` resolves to a boolean that says whether the export worked. The others resolve to `undefined`. Each one takes the diagram element, or the diagram's `<svg>` when the selector matches the SVG itself.

### `DiagView.exportDiagram(element, mode, options?)`

Generic export dispatcher.

**Signature:** `exportDiagram(element: HTMLElement | SVGSVGElement, mode: ExportMode, options?: ExportOptions | SVGSVGElement | null): Promise<boolean>`

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

`"copy"` puts a PNG on the clipboard and `"copy-svg"` copies the SVG markup as text. Safari and Firefox allow the write only during a click, so call these two from a click handler before any `await` of your own. When the browser cannot copy, they download the PNG or the .svg file instead. `"png-transparent"` and `"webp-transparent"` export with a transparent background. `"download"` exports a PNG. An unknown mode exports a PNG. You may omit `options` or pass `null`. An `<svg>` element in place of `options` works as `modalClone`, which keeps code written for the older `exportDiagram(element, mode, svg)` form working. `exportDiagram()` uses `filename` when you pass one. Otherwise it names the file from the diagram's title and the local date and time, as in `checkout_sequence_2026-09-28_011554`. The title is `data-title` on the element with the toolbar first, then a `<title>` directly inside the `<svg>`, then a chart title Mermaid draws, and `diagram_export` when there is none. The header shows the same title (see [Header](USAGE.md#header)). DiagView lowercases it, turns spaces into underscores and drops every character other than letters, digits, `.`, `-` and `_`. `silent` hides the progress notice for PNG, JPEG, WebP and Copy Image, the JPEG transparency notice, and the hard-to-read labels and linked images warnings in every mode (see [Text colours](USAGE.md#text-colours) and [Linked images](USAGE.md#linked-images)). It is the call the toolbar and the fullscreen menu use, and the only export call that fires the `onExport` callback. It fires only after the export succeeds, so a failed or blocked export does not fire it. The promise resolves to `true` when the export succeeds, after `onExport`, and to `false` when it fails or is blocked. A PDF export that falls back to PNG because jsPDF did not load also resolves to `false` and does not fire `onExport`, though the PNG is saved. An image or PDF export that leaves out linked images still succeeds. Its warning gives the count, and names hard-to-read labels too when the export finds both. Success and failure follow the same rules as `onExport`. The `exportTo*()` methods and `copyToClipboard()` do not fire it.

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

Safari cannot make WebP images. There the export saves a PNG with a `.png` name and shows the warning "This browser cannot make WebP, so it saved a 4.0x PNG". `exportDiagram()` then reports the format as `png` to `onExport`.

### `DiagView.exportToPDF(element, options?)`

Lazy-loads jsPDF on first call. When jsPDF does not load, it saves a PNG instead and shows the warning "PDF engine unavailable, falling back to PNG..."

```javascript
await DiagView.exportToPDF(el);
await DiagView.exportToPDF(el, { filename: "report" });
```

### `DiagView.copyToClipboard(element, options?)`

Copies a PNG to the system clipboard. Safari and Firefox allow the write only during a click, so call it from a click handler before any `await` of your own. DiagView starts the write within the click and hands the image over once it is drawn. If the page cannot write images to the clipboard, or the browser denies the write, DiagView downloads the PNG instead and the toast says so. That happens on plain HTTP, where browsers allow the clipboard only on HTTPS or localhost, and in Firefox before 127, which has no `ClipboardItem`.

```javascript
button.addEventListener("click", () => DiagView.copyToClipboard(el));
```

All export methods resolve without throwing when `element` contains no `<svg>`; they show a "No diagram found" toast instead. Per-diagram `data-diagview-scale` and `data-diagview-watermark-*` attributes on the element are honoured by every export path, inline or fullscreen. On touch devices and narrow screens, `mobileScale` applies instead. Every export path also follows `data-diagview-sanitize` while `security.allowOverrides` is on, unless `security.exportMode` is `'strict'`.

SVG exports and the images drawn from them embed the page fonts their labels use. Set `exportFonts` to `'all'` to embed every `@font-face` rule on the page, or to `'none'` to embed no fonts. With `'none'`, PNG, JPEG, WebP, PDF and Copy Image files show labels in a font installed on the computer, not in the page's web font.

An export of the diagram open in fullscreen during a search keeps the dimming and the outline. Set `exportSearchHighlight` to `false` to leave them out. The search in the viewer stays as it was.

### Export options

```typescript
interface ExportOptions {
  transparent?: boolean; // Transparent background (default: false)
  filename?: string; // Base filename without extension (default: auto)
  silent?: boolean; // Skip the progress and JPEG transparency toasts (PNG, JPEG, WebP and Copy Image), and the hard-to-read labels and linked images warnings (default: false)
  modalClone?: SVGSVGElement | null; // The viewer's copy to export in place of the page SVG, as the fullscreen menu does (default: null)
}
```

`copyToClipboard()` ignores `transparent`. `exportToPDF()` keeps the background and shows a warning when `transparent` is set.

While Readable is on under Text Colours, every export with a background recolours hard-to-read labels against that background, as the viewer does. Transparent exports and `"copy-svg"` keep the author's colours. See [Text colours](USAGE.md#text-colours).

---

## Modal methods

### `DiagView.openFullscreen(element, options?)`

Open the fullscreen viewer for a diagram element. It takes the diagram's `<svg>` too.

**Signature:** `openFullscreen(element: HTMLElement | SVGSVGElement, options?: OpenOptions): Promise<void>`

```typescript
interface OpenOptions {
  zoom?: number; // Initial zoom scale (e.g. 2.5)
  searchQuery?: string; // Pre-fill the search input (on a phone this also opens the search bar)
}
```

```javascript
const el = document.querySelector(".diagram");

await DiagView.openFullscreen(el);
await DiagView.openFullscreen(el, { zoom: 2.5 });
await DiagView.openFullscreen(el, { searchQuery: "database" });
await DiagView.openFullscreen(el, { zoom: 1.5, searchQuery: "auth" });
```

With `rememberZoom` on, a diagram that matches `diagramSelector` opens at its saved zoom, pan and rotation, even before it has scrolled into view. A `zoom` option replaces the saved view for that open, so the diagram opens without its saved pan and rotation. The view the diagram has when it closes then becomes the saved view, as after any open, and the next open without `zoom` does not go back to the older one. A `zoom` option also skips the view in a share link that points at the diagram, though the link's search query still applies.

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

## Utility methods

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
  maxChars?: number; // Block input longer than this (elements are measured by their serialized length, a DocumentFragment is not measured)
  allowRemoteResources?: boolean; // Keep external CSS/fonts in strict mode (permissive and off always keep them)
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
const limited = DiagView.utils.sanitizeSVG(rawSvg, "strict", { maxChars: 500000 });

// Sanitize a DOM node. It returns a new node and leaves the original as it was.
const cleanNode = DiagView.utils.sanitizeSVG(svgElement, "permissive");

// Find out what code it removed
const removed = { scripts: 0, handlers: [], urls: 0 };
DiagView.utils.sanitizeSVG(rawSvg, "strict", { removed });
```

Input over `maxChars` is blocked with a console error: a string returns `""`, a Node returns `null`. `options` may be omitted or `null`.

`strict` and `permissive` drop comments and processing instructions, and turn CDATA sections into plain text with the same content. An HTML parser ends all three at the first `>`, so markup hidden in them would otherwise run once you put the string in the page.

When the root element itself is one the mode removes, such as a lone `<script>` or `<iframe>`, nothing is left to return. A string returns `""` and a Node returns `null`, with no console error. A DocumentFragment is cleaned child by child and comes back as a fragment.

---

### `DiagView.version`

The current library version string.

```javascript
console.log(DiagView.version); // e.g. "1.2.0"
```

---

## State (read-only)

`DiagView.state` is a read-only Proxy over the internal state object, at every depth: nested objects come back as read-only views, and collections (Sets, Arrays, Maps) as snapshots. Writes and deletes log a warning and are ignored. Two exceptions: `activePanzoom` is the live Panzoom instance while the modal is open (its methods are safe to call), and `events` exposes `on`, `off` and `emit` bound to the internal event bus.

DiagView fires one event on that bus. `dv:toggle-text-select` carries no data. The `T` shortcut emits it while the viewer is open, and the viewer then turns Text Select Mode on or off. The Text Select buttons switch the mode without the event. Any other name is free for your own events.

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

## Configuration reference

### Full type definition

```typescript
interface DiagViewConfig {
  // Selectors
  diagramSelector: string; // default: '.diagram, .chart, [data-diagram]'; where matches nest, each diagram gets one toolbar

  // Theme
  accentColor: string | null; // default: null (auto-detect)
  warningColor: string; // default: '#f59e0b' (warning notices)
  backgroundColor: string | null; // default: null (auto-detect)
  textColor: string | null; // default: null (auto-detect)

  // Layout
  layout: "header" | "floating" | "off"; // default: 'floating'
  offHint: "none" | "icon" | "label" | "below"; // default: 'none'; hint that a diagram with layout 'off' opens
  offHintText: { mouse: string; touch: string }; // default: { mouse: 'Click to expand', touch: 'Tap to expand' }

  // UI
  ui: {
    buttons: {
      style: "transparent" | "accent" | "solid" | "neutral"; // default: 'accent'; header and floating layouts alike, transparent has no border
      icons: {
        copy: string | null; // null = built-in outline icon; a custom SVG draws as written after strict sanitizing, use currentColor to follow the button colour
        download: string | null;
        fullscreen: string | null;
      };
    };
  };
  showBranding: boolean; // default: true
  showKeyboardHelp: boolean; // default: true; false also hides the "Press ? for shortcuts" hint
  helpTimeout: number; // default: 8000 (ms) once focus and the mouse have left the ? panel; 0 = never
  animateOpen: boolean; // default: true

  // Interaction
  naturalPanning: boolean; // default: false; true = arrow keys move the diagram in the arrow's direction
  rotateKeepsView: boolean; // default: false; true = rotate keeps the view (size on screen and centre), zoom % adjusts
  rememberZoom: boolean; // default: false; true = each diagram reopens at its last zoom, pan and rotation, openFullscreen() included, until the page reloads or destroy() runs
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
    exportMode: "same" | "strict"; // default: 'same'; 'strict' cleans every export and copy in strict mode; no data-diagview-* attribute
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
  pdfLibraryUrl: string; // default: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  pdfLibraryIntegrity: string | null; // default: the 'sha512-...' SRI hash of that file; null skips the check. A new pdfLibraryUrl without its own hash sets it to null, and the default URL gets the default hash back

  // Callbacks
  onOpen: (() => void) | null; // default: null
  onClose: (() => void) | null; // default: null
  onExport: ((format: string, filename: string) => void) | null; // default: null
  onZoomChange: ((scale: number) => void) | null; // default: null
  onError: ((error: Error) => void) | null; // default: null

  // Watermark (Silent Branding)
  watermark: {
    enabled: boolean; // default: false
    text: string; // default: ''; an empty text draws no watermark
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

## Browser support

| Browser         | Minimum version |
| --------------- | --------------- |
| Chrome          | 90              |
| Firefox         | 88              |
| Safari          | 14.1            |
| Edge (Chromium) | 90              |
| iOS Safari      | 14.1            |
| Android Chrome  | 90              |

Internet Explorer is not supported.

The custom colour swatch in the ☰ menu shows its keyboard focus ring through `:has()`. Chrome before 105, Firefox before 121 and Safari before 15.4 lack `:has()`, so there the swatch shows no ring. The picker still works from the keyboard.

A few details need newer versions. Without them everything still works, and only these change:

- `color-mix()` needs Chrome 111, Firefox 113 and Safari 16.2. Before that, `canvasGrid: "dots"` draws no dots, the accent buttons get the plain grey border and the theme buttons get no hover tint.
- `:focus-visible` needs Safari 15.4. Older Safari shows its own focus ring in place of DiagView's.
- Copy Image needs `ClipboardItem`, which Firefox has from 127. Older Firefox downloads the PNG instead.
