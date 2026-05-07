# DiagView — Public API Reference

All methods are available on the `DiagView` global (UMD) or the default export (ESM).

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

**Signature:** `init(options?: Partial<DiagViewConfig>): void`

```javascript
DiagView.init();
DiagView.init({ layout: "header", accentColor: "#6366f1" });
```

Calling `init()` more than once without an intervening `destroy()` is a no-op (logs a warning).

---

### `DiagView.destroy()`

Fully tear down DiagView. Removes all DOM elements, stops observers, destroys Panzoom, clears sessionStorage zoom states, and resets all internal state.

**Signature:** `destroy(): Promise<void>`

```javascript
await DiagView.destroy();
// Safe to call init() again afterward
DiagView.init({ layout: "floating" });
```

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

Update configuration at runtime without re-initializing. Syncs theme and branding visibility immediately.

**Signature:** `configure(options: Partial<DiagViewConfig>): void`

```javascript
DiagView.configure({
  accentColor: "#f59e0b",
  showBranding: false,
});
```

---

### `DiagView.getConfiguration()`

Return an immutable copy of the current configuration.

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

All export methods are async and return `Promise<void>`.

### `DiagView.exportDiagram(element, mode, options?)`

Generic export dispatcher.

**Signature:** `exportDiagram(element: HTMLElement, mode: ExportMode, options?: ExportOptions): Promise<void>`

```typescript
type ExportMode = "png" | "svg" | "jpeg" | "webp" | "pdf" | "copy";
```

```javascript
await DiagView.exportDiagram(el, "png", { transparent: true });
await DiagView.exportDiagram(el, "svg", { filename: "architecture" });
await DiagView.exportDiagram(el, "pdf");
await DiagView.exportDiagram(el, "copy");
```

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

Copies a PNG to the system clipboard. Requires HTTPS or localhost.

```javascript
await DiagView.copyToClipboard(el);
```

### Export Options

```typescript
interface ExportOptions {
  transparent?: boolean; // Transparent background (default: false)
  filename?: string; // Base filename without extension (default: auto)
  silent?: boolean; // Suppress toast notifications (default: false)
}
```

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
  options?: number | SanitizeOptions
): string | Node
```

```typescript
interface SanitizeOptions {
  maxChars?: number; // Block strings longer than this
  allowRemoteResources?: boolean; // Allow external CSS/fonts
  allowedImageTypes?: string[]; // Allowed data: URI image types
}
```

```javascript
// Sanitize a string
const clean = DiagView.utils.sanitizeSVG(rawSvg, "strict");

// With a size limit
const clean = DiagView.utils.sanitizeSVG(rawSvg, "strict", { maxChars: 500000 });

// Sanitize a DOM node (returns a new node — original is not mutated)
const cleanNode = DiagView.utils.sanitizeSVG(svgElement, "permissive");
```

---

### `DiagView.version`

The current library version string.

```javascript
console.log(DiagView.version); // "1.0.5"
```

---

## State (read-only)

`DiagView.state` is a read-only Proxy over the internal state object. Collections (Sets, Arrays, Maps) are returned as snapshots.

```typescript
interface PublicState {
  isInitialized: boolean;
  isModalOpen: boolean;
  isModalOpening: boolean;
  rotationAngle: 0 | 90 | 180 | 270;
  currentDiagramIndex: number;
  meetingMode: boolean;
  searchMatches: Element[];
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

> **Do not attempt to mutate `DiagView.state` directly.** All writes are silently ignored. Use `configure()`, `openFullscreen()`, and other API methods to change behaviour.

---

## Configuration Reference

### Full type definition

```typescript
interface DiagViewConfig {
  // Selectors
  diagramSelector: string; // default: '.diagram, .chart, [data-diagram]'

  // Theme
  accentColor: string | null; // default: null (auto-detect)
  backgroundColor: string | null; // default: null (auto-detect)
  textColor: string | null; // default: null (auto-detect)

  // Layout
  layout: "header" | "floating" | "off"; // default: 'floating'

  // UI
  ui: {
    buttons: {
      style: "transparent" | "accent" | "solid" | "neutral"; // default: 'accent'
      icons: {
        copy: string | null; // null = built-in icon
        download: string | null;
        fullscreen: string | null;
      };
    };
  };
  showBranding: boolean; // default: true
  showKeyboardHelp: boolean; // default: true
  helpTimeout: number; // default: 8000 (ms); 0 = never
  animateOpen: boolean; // default: true
  printFriendly: boolean; // default: true

  // Interaction
  naturalPanning: boolean; // default: false
  immersiveMode: boolean; // default: false
  rememberZoom: boolean; // default: false
  showMinimap: boolean; // default: true

  // Zoom / Pan
  maxZoomScale: number; // default: 25 (range: 1–50)
  minZoomScale: number; // default: 0.05 (range: 0.01–1)
  zoomAnimationDuration: number; // default: 200 (ms)
  panAnimationDuration: number; // default: 200 (ms)

  // Export
  highResScale: number; // default: 4 (range: 1–10)
  mobileScale: number; // default: 2 (range: 1–5)
  maxPixels: number; // default: 16777216 (16MP)

  // Security
  security: {
    mode: "strict" | "permissive" | "off"; // default: 'strict'
    allowOverrides: boolean; // default: true
    allowRemoteResources: boolean; // default: false
  };
  allowedImageTypes: string[]; // default: ['png', 'jpeg', 'webp', 'gif']
  sanitize: "auto" | "strict" | "off"; // legacy alias; prefer security.mode

  // Performance
  performance: {
    largeFileThreshold: number; // default: 1000000 (1 MB)
    criticalFileLimit: number; // default: 50000000 (50 MB)
  };

  // Notifications
  toastDuration: number; // default: 2500 (ms)
  errorToastDuration: number; // default: 5000 (ms)

  // PDF
  pdfLibraryUrl: string; // default: cdnjs jsPDF URL
  pdfLibraryIntegrity: string | null; // SRI hash; null when using custom URL

  // Callbacks
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
  onExport: ((format: string, filename: string) => void) | null;
  onZoomChange: ((scale: number) => void) | null;
  onError: ((error: Error) => void) | null;
}
```

---

## TypeScript

DiagView ships TypeScript declarations at `dist/index.d.ts`.

```typescript
import DiagView from "diagview";

DiagView.init({
  layout: "floating",
  accentColor: "#3b82f6",
  onOpen: () => console.log("opened"),
});

const el = document.querySelector<HTMLElement>(".diagram")!;
await DiagView.openFullscreen(el, { zoom: 2 });
await DiagView.exportToPNG(el, { transparent: true });
```

Import specific types if needed:

```typescript
import type { DiagViewConfig } from "diagview";

const config: Partial<DiagViewConfig> = {
  layout: "header",
  highResScale: 8,
};
DiagView.init(config);
```

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
