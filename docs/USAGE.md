# DiagView — Usage Guide

Complete guide from basic setup to advanced integration patterns.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Auto-Initialization](#2-auto-initialization)
3. [Manual Initialization](#3-manual-initialization)
4. [Layout Modes](#4-layout-modes)
5. [Per-Diagram Overrides](#5-per-diagram-overrides)
6. [Search](#6-search)
7. [Export](#7-export)
8. [Share Links](#8-share-links)
9. [Meeting Mode](#9-meeting-mode)
10. [Rotation](#10-rotation)
11. [Text Select Mode](#11-text-select-mode)
12. [Minimap](#12-minimap)
13. [Theming](#13-theming)
14. [SVG Sanitization](#14-svg-sanitization)
15. [Shadow DOM](#15-shadow-dom)
16. [Remember Zoom](#16-remember-zoom)
17. [Keyboard Shortcuts](#17-keyboard-shortcuts)
18. [Runtime Updates](#18-runtime-updates)
19. [Callbacks](#19-callbacks)
20. [Framework Integration](#20-framework-integration)
21. [Mermaid Integration](#21-mermaid-integration)
22. [Advanced Configuration](#22-advanced-configuration)
23. [Programmatic Control](#23-programmatic-control)
24. [Troubleshooting](#24-troubleshooting)
25. [Watermark](#25-watermark)

---

## 1. Installation

### CDN

```html
<!-- Required: Panzoom (zoom/pan physics) -->
<script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/dist/panzoom.min.js"></script>

<!-- DiagView (latest stable) -->
<script src="https://cdn.jsdelivr.net/npm/diagview@1.0.6/dist/diagview.umd.min.js"></script>
<!-- Or for auto-updates within v1: diagview@1 -->
```

### NPM

```bash
npm install diagview @panzoom/panzoom
```

```javascript
import DiagView from "diagview";
// ESM build is resolved automatically by package "module" field
```

### Bundler (Vite, Webpack, Rollup)

```javascript
// vite.config.js — mark Panzoom as external if loading from CDN
export default {
  build: {
    rollupOptions: {
      external: ["@panzoom/panzoom"],
    },
  },
};
```

Or install Panzoom locally and import it normally — DiagView uses `window.Panzoom` at runtime if the package is available globally, or falls back gracefully.

---

## 2. Auto-Initialization

When DiagView's script tag does **not** have `data-diagview-no-auto-init`, it automatically scans for diagrams and initializes itself after `DOMContentLoaded`. The default selector is:

```
.diagram, .chart, [data-diagram]
```

Any element containing an `<svg>` child that matches this selector is enhanced.

```html
<!-- Auto-detected ✅ -->
<div class="diagram"><svg>...</svg></div>
<div class="chart"><svg>...</svg></div>
<div data-diagram><svg>...</svg></div>

<!-- Not detected by default ❌ -->
<figure class="my-svg"><svg>...</svg></figure>
```

To match a custom selector:

```html
<script src="diagview.umd.min.js" data-diagview-no-auto-init></script>
<script>
  DiagView.init({ diagramSelector: ".my-svg, figure.diagram" });
</script>
```

---

## 3. Manual Initialization

Use `data-diagview-no-auto-init` on the script tag to take full control:

```html
<script src="diagview.umd.min.js" data-diagview-no-auto-init></script>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    DiagView.init({
      layout: "header",
      accentColor: "#6366f1",
    });
  });
</script>
```

**Order matters with async diagram libraries.** Always wait for the diagram library to finish rendering before calling `DiagView.init()`:

```javascript
// ✅ Correct — Mermaid renders first
await mermaid.run();
DiagView.init({ diagramSelector: ".mermaid" });

// ❌ Wrong — DiagView scans before Mermaid outputs SVG
DiagView.init({ diagramSelector: ".mermaid" });
await mermaid.run();
```

---

## 4. Layout Modes

### Floating (Default)

The floating layout keeps the diagram area clean. On hover, ghost buttons fade in at the bottom of the card. In fullscreen, a FAB (Floating Action Button) at the bottom-right gives access to export, share, rotate, and meeting mode.

```javascript
DiagView.init({ layout: "floating" });
```

### Header

A sticky toolbar is rendered above each diagram at all times. It shows the diagram's title (from `data-title` or the SVG `<title>` element) on the left, and action buttons on the right.

```javascript
DiagView.init({ layout: "header" });
```

**Title resolution order:**

1. `data-title` attribute on the container element
2. `<title>` element inside the SVG
3. Fallback: `"DIAGRAM"`

```html
<!-- Shows "MY PIPELINE" in the header -->
<div class="diagram" data-title="My Pipeline">
  <svg>...</svg>
</div>

<!-- Shows "AUTH FLOW" from SVG title -->
<div class="diagram">
  <svg>
    <title>Auth Flow</title>
    ...
  </svg>
</div>
```

### Off

No controls are injected. Clicking the diagram opens the fullscreen viewer. The cursor changes to `zoom-in` as the only affordance.

```javascript
DiagView.init({ layout: "off" });
```

This is the most performant layout for dense pages with many diagrams.

---

## 5. Per-Diagram Overrides

Set any of the following `data-diagview-*` attributes directly on a diagram container to override the global configuration for that element only. All other diagrams are unaffected.

```html
<div
  class="diagram"
  data-diagview-layout="header"
  data-diagview-accent="#10b981"
  data-diagview-scale="8"
  data-diagview-sanitize="permissive"
  data-diagview-allow-remote="false"
  data-title="Network Topology"
>
  <svg>...</svg>
</div>
```

| Attribute                         | Type                               | Description                                      |
| --------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `data-diagview-layout`            | `header \| floating \| off`        | Layout for this diagram                          |
| `data-diagview-accent`            | CSS color string                   | Accent color — sets `--dv-accent` on the element |
| `data-diagview-scale`             | Integer `1`–`10`                   | Export `highResScale` for this diagram           |
| `data-diagview-sanitize`          | `strict` \| `permissive` \| `off`  | SVG sanitization mode                            |
| `data-diagview-allow-remote`      | `true` \| `false`                  | Allow remote CSS/fonts in SVG                    |
| `data-diagview-watermark`         | `true` \| `false`                  | Enable watermark for this diagram only           |
| `data-diagview-watermark-text`    | Any string                         | Custom watermark text                            |
| `data-diagview-watermark-style`   | `corner` \| `background` \| `both` | Style override for this diagram                  |
| `data-diagview-watermark-pos`     | `top-left` \| `...`                | Position override for this diagram               |
| `data-diagview-watermark-opacity` | `0`–`1`                            | Opacity override for this diagram                |
| `data-title`                      | Any string                         | Title shown in header layout label               |

> **Requires `security.allowOverrides: true`** (the default) for `data-diagview-sanitize` and `data-diagview-allow-remote` to take effect.

---

## 6. Search

Search is available inside the fullscreen viewer. It highlights all nodes whose text content contains the search query (case-insensitive). Non-matching nodes are dimmed to 15% opacity.

### Activating search

- **Keyboard:** Press `F` (or `/` conceptually) to open and focus the search bar
- **Mobile:** Tap the search icon (🔍) in the top bar
- **Mouse:** Click the search field in the fullscreen topbar

### Behavior

- All matches are highlighted simultaneously (no next/previous — use zoom/pan to navigate)
- An `aria-live` region announces the match count to screen readers
- Pressing `Esc` clears and closes search
- Pressing the `✕` button clears the query

### Pre-fill search on open

```javascript
// Open a diagram pre-filled with a search query
DiagView.openFullscreen(element, { searchQuery: "auth service" });
```

### Search performance

The search module pre-warms its candidate cache during browser idle time, so the first keystroke is never slow even on 2,500-node diagrams.

---

## 7. Export

### From the UI

In fullscreen, open the FAB menu (bottom-right) and click any export button. The "Transparent" checkbox applies to PNG, WebP, and SVG only.

### Programmatic export

```javascript
const el = document.querySelector(".diagram");

// Individual format methods
await DiagView.exportToPNG(el);
await DiagView.exportToPNG(el, { transparent: true });
await DiagView.exportToSVG(el, { transparent: true });
await DiagView.exportToJPEG(el);
await DiagView.exportToWebP(el, { transparent: true });
await DiagView.exportToPDF(el);
await DiagView.copyToClipboard(el);

// Generic dispatcher
await DiagView.exportDiagram(el, "png", {
  transparent: false,
  filename: "my-diagram-2024", // omit extension
});
```

### Options

| Option        | Type       | Default        | Description                           |
| ------------- | ---------- | -------------- | ------------------------------------- |
| `transparent` | boolean    | `false`        | Transparent background (PNG/SVG/WebP) |
| `filename`    | string     | auto-generated | Output filename without extension     |
| `modalClone`  | SVGElement | `null`         | Internal — clone from the open modal  |
| `silent`      | boolean    | `false`        | Suppress toast notifications          |

### Resolution

```javascript
DiagView.init({
  highResScale: 4, // Desktop: output is 4× the SVG's intrinsic size
  mobileScale: 2, // Mobile: output is 2× (auto-detected via pointer: coarse)
  maxPixels: 16777216, // Safety cap — auto-downscales massive diagrams
});
```

### PDF

PDF export lazy-loads jsPDF from CDN on first use. To use a custom CDN or a locally hosted file:

```javascript
DiagView.init({
  pdfLibraryUrl: "/assets/jspdf.umd.min.js",
  pdfLibraryIntegrity: null, // set to null when using a custom URL
});
```

---

## 8. Share Links

Share the exact zoom level and pan position with anyone. The generated URL contains only DiagView's own parameters — no auth tokens or other query parameters from the host page are included.

### URL parameters

| Parameter | Description                                  |
| --------- | -------------------------------------------- |
| `dv-idx`  | Diagram index on the page (zero-based)       |
| `dv-z`    | Zoom scale (3 decimal places)                |
| `dv-cx`   | SVG internal X coordinate at viewport center |
| `dv-cy`   | SVG internal Y coordinate at viewport center |
| `dv-r`    | Rotation angle (0, 90, 180, or 270)          |
| `dv-q`    | Active search query                          |

### Example URL

```
https://example.com/docs#architecture?dv-idx=2&dv-z=2.500&dv-cx=450&dv-cy=300&dv-r=0&dv-q=auth
```

### Activation

- **Keyboard:** Press `L` in fullscreen
- **UI:** Open FAB menu → click "Share Link"

The URL is automatically cleaned from the address bar after DiagView processes it (using `history.replaceState`).

---

## 9. Meeting Mode

Renders a red laser-pointer dot that follows the mouse (or touch point). Designed for screen-sharing presentations.

### Activation

- **Keyboard:** Press `M` in fullscreen
- **UI:** Open FAB menu → click "Meeting Mode"

### Behavior

- The cursor is hidden (`cursor: none`) when meeting mode is active
- The laser animates with a pulsing glow
- Toggling again removes the laser and restores the cursor
- Meeting mode is automatically disabled when the modal closes

---

## 10. Rotation

Rotates the diagram by 90° clockwise. Panzoom is recalibrated after each rotation so that zoom/pan remain accurate.

### Activation

- **Keyboard:** Press `R` in fullscreen
- **UI:** Open FAB menu → click "Rotate 90°"

Rotation state is included in share links (`dv-r=90`) and saved in session storage when `rememberZoom: true`.

---

## 11. Text Select Mode

By default, Panzoom captures all pointer events so dragging pans the diagram. Text Select Mode suspends pan/zoom and enables native browser text selection over SVG `<text>` nodes — useful for copying node labels.

### Activation

- **Keyboard:** Press `T` in fullscreen
- **UI (desktop):** Click the `⎸` button in the topbar
- **UI (mobile):** Tap the `⎸` icon in the topbar action row

A toast notification confirms when the mode is on or off. The topbar button shows a filled/active state.

---

## 12. Minimap

A thumbnail of the diagram appears in the bottom-left corner of the fullscreen viewer **only when the diagram is larger than the viewport** (more than 5% overflow in either dimension). The minimap:

- Accurately scales for both portrait and landscape diagrams
- Updates on every pan/zoom event (throttled to 100 ms)
- Shows a blue rectangle indicating the current viewport
- Supports **click-to-navigate** — clicking any region of the minimap pans the diagram to that area
- Is hidden on viewports narrower than 768 px

```javascript
DiagView.init({ showMinimap: true }); // enabled by default
DiagView.init({ showMinimap: false }); // disable
```

---

## 13. Theming

DiagView auto-detects the host page's theme using a cascade of checks:

1. `document.documentElement.classList.contains('dark')` — Tailwind
2. `data-theme="dark"` on `<html>` or `<body>`
3. `data-bs-theme="dark"` on `<html>` — Bootstrap
4. `window.matchMedia('(prefers-color-scheme: dark)')` — OS preference

### CSS variable integration

DiagView reads these variables from your stylesheet:

```css
:root {
  --diagram-accent: #3b82f6; /* accent color */
  --diagram-text: #1e293b; /* text color */
  --background: #ffffff; /* background */
  /* also checked: --bg-color, --body-bg, --text-color, --foreground */
}

[data-theme="dark"] {
  --diagram-accent: #60a5fa;
  --diagram-text: #f1f5f9;
  --background: #0f172a;
}
```

### Manual override

```javascript
DiagView.init({
  accentColor: "#f59e0b",
  backgroundColor: "#0f172a",
  textColor: "#f1f5f9",
});
```

### WCAG contrast enforcement

DiagView automatically checks that the detected text color achieves at least a 4.5:1 contrast ratio against the background. If not, it falls back to white (`#ffffff`) or black (`#000000`) as appropriate.

---

## 14. SVG Sanitization

DiagView sanitizes all SVG content before rendering to prevent XSS. Three modes are available:

### `strict` (default)

Blocks all known SVG XSS vectors:

- Dangerous tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<foreignObject>`, `<animate>`, `<set>`, `<feimage>`, and others
- `on*` event attributes (`onclick`, `onload`, `onerror`, etc.)
- `javascript:`, `vbscript:`, `data:` URIs (except safe raster images like PNG/JPEG/WebP)
- External `<use>` references (`https://...`)
- Inline `style` attributes containing `expression()`, `javascript:`, or remote `url()` references
- `<style>` block content with the same patterns

### `permissive`

Blocks only the most critical vectors:

- Tags: `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`
- All `on*` event attributes
- `javascript:`/`vbscript:`/`data:` URIs

This matches the legacy v0.x behavior.

### `off`

No sanitization. **Use only for SVGs from a fully trusted, developer-controlled source.**

### Setting the mode

```javascript
// Global
DiagView.init({ security: { mode: "permissive" } });

// Per-element (requires security.allowOverrides: true, the default)
```

```html
<div class="diagram" data-diagview-sanitize="permissive">
  <svg><!-- diagram with CSS animations --></svg>
</div>
```

### Allowing remote resources

By default, `@import` and external `url()` in SVG `<style>` blocks are blocked in strict mode. To allow them (e.g. for Google Fonts embedded in a diagram):

```javascript
DiagView.init({ security: { allowRemoteResources: true } });
// or per-element:
```

```html
<div class="diagram" data-diagview-allow-remote="true">...</div>
```

---

## 15. Shadow DOM

DiagView can initialize diagrams inside a Shadow DOM root after the main `init()` call:

```javascript
const host = document.getElementById("my-host");
const shadow = host.attachShadow({ mode: "open" });

// Render content into shadow root
shadow.innerHTML = `
  <div class="diagram">
    <svg viewBox="0 0 400 300">...</svg>
  </div>
`;

// Initialize DiagView globally first
DiagView.init();

// Then scan the shadow root
DiagView.initShadowRoot(shadow);
```

The modal and styles are injected into the main document, not the shadow root — this ensures the fullscreen overlay works correctly.

---

## 16. Remember Zoom

When enabled, DiagView saves each diagram's zoom level, pan position, and rotation to `sessionStorage` after each interaction. On the next open, the saved state is restored automatically.

```javascript
DiagView.init({ rememberZoom: true });
```

- State is keyed per `data-diagview-id` (a unique ID generated at init time)
- Storage is cleared when `DiagView.destroy()` is called
- State expires when the browser session ends (sessionStorage)
- Gracefully degrades if sessionStorage is unavailable (private browsing)

---

## 17. Keyboard Shortcuts

| Key(s)              | Action                              | Notes                                          |
| ------------------- | ----------------------------------- | ---------------------------------------------- |
| `Esc`               | Close modal or close shortcut panel | Shortcut panel closes first                    |
| `Space` / `0`       | Reset zoom and center diagram       |                                                |
| `+` / `=`           | Zoom in                             |                                                |
| `-` / `_`           | Zoom out                            |                                                |
| `↑` `↓` `←` `→`     | Pan 40 px                           |                                                |
| `Shift` + arrows    | Fast pan 120 px                     |                                                |
| `F`                 | Open and focus search               | On mobile, opens search bar                    |
| `T`                 | Toggle text select mode             |                                                |
| `R`                 | Rotate 90° clockwise                |                                                |
| `M`                 | Toggle meeting mode (laser pointer) |                                                |
| `L`                 | Copy share link                     | Requires HTTPS or localhost                    |
| `?`                 | Show/hide keyboard shortcuts        | Works even with input focused                  |
| `Ctrl/Cmd`+anything | Ignored                             | Native browser shortcuts are never intercepted |

Shortcuts are disabled when the modal is closed. When an `<input>` or `<textarea>` is focused, most shortcuts are suspended (except `Esc` and `?`).

---

## 18. Runtime Updates

### Change configuration

```javascript
DiagView.configure({
  accentColor: "#f59e0b",
  layout: "header",
  showBranding: false,
});
```

`configure()` calls `updateConfig()` internally and re-syncs the theme and branding visibility. It does not re-initialize diagrams.

### Scan for new diagrams

When content is added to the DOM dynamically (e.g. after an API call), call `refresh()`:

```javascript
// After adding new .diagram elements to the DOM
DiagView.refresh();
```

> **Note:** DiagView also uses a `MutationObserver` to detect and initialize newly added diagrams automatically (with a 100 ms debounce). You only need `refresh()` if you want immediate initialization.

### Teardown and reinitialize

```javascript
await DiagView.destroy();

// Configure differently and reinitialize
DiagView.init({ layout: "header", accentColor: "#ff6b6b" });
```

---

## 19. Callbacks

```javascript
DiagView.init({
  onOpen: () => {
    console.log("Fullscreen opened");
    analytics.track("diagram_opened");
  },

  onClose: () => {
    console.log("Fullscreen closed");
  },

  onExport: (format, filename) => {
    console.log(`Exported as ${format}: ${filename}`);
    analytics.track("diagram_exported", { format });
  },

  onZoomChange: (scale) => {
    document.getElementById("zoom-display").textContent = `${Math.round(scale * 100)}%`;
  },

  onError: (error) => {
    console.error("SVG validation failed:", error.message);
    // error.message contains the specific validation failure reason
  },
});
```

---

## 20. Framework Integration

### React — with cleanup

```jsx
import { useEffect, useRef } from "react";
import DiagView from "diagview";

function DiagramViewer({ svgContent }) {
  const containerRef = useRef(null);

  useEffect(() => {
    DiagView.init({ layout: "floating" });
    return () => {
      DiagView.destroy();
    };
  }, []);

  return (
    <div ref={containerRef} className="diagram" dangerouslySetInnerHTML={{ __html: svgContent }} />
  );
}
```

### React — SSR (Next.js)

```javascript
// Ensure DiagView only runs on the client
if (typeof window !== "undefined") {
  import("diagview").then(({ default: DiagView }) => {
    DiagView.init({ layout: "floating" });
  });
}
```

### Vue 3 — Composition API

```vue
<script setup>
import { onMounted, onUnmounted } from "vue";
import DiagView from "diagview";

onMounted(() => DiagView.init({ layout: "floating" }));
onUnmounted(() => DiagView.destroy());
</script>
```

### Angular

```typescript
import { Component, OnInit, OnDestroy } from "@angular/core";

declare const DiagView: any;

@Component({ selector: "app-root", templateUrl: "./app.component.html" })
export class AppComponent implements OnInit, OnDestroy {
  ngOnInit() {
    DiagView.init({ layout: "floating" });
  }
  ngOnDestroy() {
    DiagView.destroy();
  }
}
```

### Svelte

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import DiagView from 'diagview';

  onMount(() => DiagView.init({ layout: 'floating' }));
  onDestroy(() => DiagView.destroy());
</script>

<div class="diagram"><svg>...</svg></div>
```

---

## 21. Mermaid Integration

```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/dist/panzoom.min.js"></script>
<script
  src="https://cdn.jsdelivr.net/npm/diagview@1/dist/diagview.umd.min.js"
  data-diagview-no-auto-init
></script>
```

```javascript
mermaid.initialize({ startOnLoad: false, theme: "default" });

document.addEventListener("DOMContentLoaded", async () => {
  await mermaid.run(); // must finish before DiagView scans
  DiagView.init({ diagramSelector: ".mermaid, .diagram" });
});
```

**Dark mode with Mermaid:**

```javascript
const isDark = document.documentElement.classList.contains("dark");
mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? "dark" : "default",
});
```

---

## 22. Advanced Configuration

### Custom button icons

Any built-in icon can be replaced with a custom SVG string:

```javascript
DiagView.init({
  ui: {
    buttons: {
      icons: {
        copy: `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>`,
        download: null, // null = keep built-in
        fullscreen: null,
      },
    },
  },
});
```

### Custom diagram selector

```javascript
DiagView.init({
  diagramSelector: ".mermaid, .graphviz, [data-diagram], figure.chart",
});
```

### Immersive mobile mode

When enabled, DiagView modifies the viewport meta tag on mobile when the modal opens, snapping out of any browser pinch-zoom and locking the layout to 1:1 scale. The user can still use native browser zoom afterward.

```javascript
DiagView.init({ immersiveMode: true });
```

### Natural panning

By default, `ArrowUp` moves the diagram downward (camera moves up). Set `naturalPanning: true` for scroll-like behavior where `ArrowUp` moves the diagram up.

```javascript
DiagView.init({ naturalPanning: true });
```

### Performance limits

```javascript
DiagView.init({
  performance: {
    largeFileThreshold: 500000, // Skip style-baking above 500 KB SVG
    criticalFileLimit: 10000000, // Block processing above 10 MB SVG
  },
  maxPixels: 25000000, // Allow up to 25MP export (use carefully)
});
```

---

## 23. Programmatic Control

### Open fullscreen from code

```javascript
const diagram = document.querySelector(".diagram");

// Basic open
DiagView.openFullscreen(diagram);

// Open at specific zoom
DiagView.openFullscreen(diagram, { zoom: 2.5 });

// Open with pre-filled search
DiagView.openFullscreen(diagram, { searchQuery: "database" });

// Both
DiagView.openFullscreen(diagram, { zoom: 1.5, searchQuery: "auth" });
```

### Close from code

```javascript
DiagView.closeModal();
```

### Read current state (read-only)

```javascript
const state = DiagView.state;
console.log(state.isModalOpen); // boolean
console.log(state.rotationAngle); // 0 | 90 | 180 | 270
console.log(state.currentDiagramIndex); // number
console.log(state.meetingMode); // boolean
```

### SVG sanitization utility

```javascript
const clean = DiagView.utils.sanitizeSVG(rawSvgString, "strict");
const el = document.querySelector(".diagram");
el.innerHTML = clean;
DiagView.refresh();
```

### Version check

```javascript
console.log(DiagView.version); // e.g. "1.0.6"
```

---

## 24. Troubleshooting

### Diagrams not showing interactive controls

1. Check the selector: does your element match `diagramSelector`?
2. Ensure the element contains a valid `<svg>` child with visible content
3. Check the browser console — errors from SVG validation appear there
4. Confirm DiagView initialized: `console.log(DiagView.state.isInitialized)`

### Zoom/pan not working in fullscreen

- Ensure `@panzoom/panzoom` is loaded **before** DiagView
- Check that `window.Panzoom` is defined in the console
- Look for "Panzoom library not found" in the console

### Exports are blurry

Increase `highResScale`:

```javascript
DiagView.init({ highResScale: 8 });
```

### PDF export not working

- Check the network tab — jsPDF must load from CDN
- If behind a CSP, host jsPDF locally and point to it:

```javascript
DiagView.init({
  pdfLibraryUrl: "/assets/vendor/jspdf.umd.min.js",
  pdfLibraryIntegrity: null,
});
```

### Clipboard copy fails

Clipboard API requires HTTPS or `localhost`. On HTTP, DiagView falls back to `document.execCommand('copy')`. If both fail, the diagram is downloaded instead.

### Search highlights nothing

Search matches text inside `<text>` and `.node` elements. Check that your SVG contains visible text nodes.

### Share link not working

- Share links require HTTPS or `localhost` for clipboard write
- The `dv-*` parameters are stripped from the URL after processing to keep bookmarks clean

### Mobile controls drift when pinch-zooming

Enable `immersiveMode` to lock the viewport:

```javascript
DiagView.init({ immersiveMode: true });
```

### "Double Prefixing" on SVG IDs

DiagView never mutates your original SVG's IDs. ID namespacing only happens on the internal clone used in the fullscreen modal. If you see IDs changing on the host page, please open an issue.

---

## 25. Watermark

DiagView can automatically inject a watermark into your diagrams when they are downloaded or exported. This is a "silent" feature—the watermark is invisible in the viewer on your website, but appears on the saved image to ensure your work is always attributed.

### Basic Setup

Enable watermarking in your initialization call:

```javascript
DiagView.init({
  watermark: {
    enabled: true,
    text: "khadirullah.com",
    style: "background",
    opacity: 0.08,
  },
});
```

### Configuration Options

| Option     | Type    | Default          | Description                                                                  |
| ---------- | ------- | ---------------- | ---------------------------------------------------------------------------- |
| `enabled`  | boolean | `false`          | Whether to inject branding on export/download                                |
| `text`     | string  | `""`             | The branding text (e.g. your domain or name)                                 |
| `style`    | string  | `"corner"`       | `corner` \| `background` (PowerPoint style) \| `both`                        |
| `position` | string  | `"bottom-right"` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` \| `four-sides` |
| `opacity`  | number  | `0.2`            | Transparency level (0.0 to 1.0)                                              |

### Branding Styles

#### 1. Full-Canvas Overlay

Places a large, faint version of your text in the center of the diagram, rotated at -30 degrees. This is the most protective option as it covers the main content area. Note: This style is always centered and ignores the `position` setting.

#### 2. Corner (Professional Signature)

Places a small signature in the corner of your choice. This style obeys the `position` setting.

#### 3. Both (Ultimate Protection)

Shows **both** the large background text AND the corner signature.

#### 4. Four Sides

By setting `position: "four-sides"`, you can place your branding on all four edges of the image simultaneously.

### File Size Note

Adding watermarks increases the complexity of the exported image. While the impact is minimal for most diagrams, using the `both` style or `four-sides` position will slightly increase the final file size of your exported PNG, SVG, or PDF files.

### Visibility Optimization

DiagView uses a "Contrast Stroke" technique to ensure your watermark is visible on any background. If your diagram has light yellow boxes (like Mermaid charts) or dark nodes, the watermark will remain legible by using a subtle outline of the opposite color.
