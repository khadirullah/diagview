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
<script src="https://cdn.jsdelivr.net/npm/diagview@1.0.12/dist/diagview.umd.min.js"></script>
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

DiagView does not import Panzoom. It only reads `window.Panzoom` at runtime. If you install Panzoom locally, import it and assign it before the viewer first opens. DiagView checks for it each time the viewer opens. Set it before `init()` if you use share links, because a share link opens the viewer right after `init()`.

```javascript
import Panzoom from "@panzoom/panzoom";
window.Panzoom = Panzoom;
```

Without `window.Panzoom`, the viewer still opens but zoom and pan are off. The console logs "Panzoom library not found" and a toast says zoom needs Panzoom. Keyboard shortcuts other than `Esc` and `?` do nothing.

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

Auto-init only runs when the page has at least one element that matches the default selector. An element with a `data-diagview-auto-init` attribute anywhere on the page forces auto-init, even when the script tag opts out.

To match a custom selector:

```html
<script src="diagview.umd.min.js" data-diagview-no-auto-init></script>
<script>
  DiagView.init({ diagramSelector: ".my-svg, figure.diagram" });
</script>
```

### Timing

Auto-init never runs synchronously. It is scheduled one task after `DOMContentLoaded` (or one task after the library finishes evaluating when it is loaded with `type="module"`, `defer`, or after the page has already parsed). A `DiagView.init({...})` you call before that task runs — a bundler entry point, a `<script type="module">`, a `defer` script, or a plain script right after the tag — cancels the pending auto-init and your options win. The opt-out attribute is only required when your own `init()` happens later than that, for example after an `await` (Mermaid rendering, a fetch) or from a framework effect.

The opt-out attribute is honoured on any `<script>` whose `src` contains `diagview`, so a helper script named `diagview-setup.js` placed before the library tag does not hide it.

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

A toolbar sits above each diagram. On desktop it fades in when you hover the diagram or tab into it; on touch screens it is always visible. It shows the diagram's title (from `data-title` or the SVG `<title>` element) on the left, and action buttons on the right.

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

No controls are injected. Clicking the diagram opens the fullscreen viewer. The cursor changes to `pointer` as the only affordance.

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
  data-diagview-scale="8"
  data-diagview-sanitize="permissive"
  data-diagview-allow-remote="false"
  data-title="Network Topology"
>
  <svg>...</svg>
</div>
```

| Attribute                         | Type                               | Description                                   |
| --------------------------------- | ---------------------------------- | --------------------------------------------- |
| `data-diagview-layout`            | `header \| floating \| off`        | Layout for this diagram                       |
| `data-diagview-scale`             | Integer `1`–`10`                   | Export `highResScale` for this diagram        |
| `data-diagview-sanitize`          | `strict` \| `permissive` \| `off`  | SVG sanitization mode                         |
| `data-diagview-allow-remote`      | `true` \| `false`                  | Allow remote CSS/fonts in SVG                 |
| `data-diagview-watermark`         | `true` \| `false`                  | Turn the watermark on or off for this diagram |
| `data-diagview-watermark-text`    | Any string                         | Custom watermark text                         |
| `data-diagview-watermark-style`   | `corner` \| `background` \| `both` | Style override for this diagram               |
| `data-diagview-watermark-pos`     | `top-left` \| `...`                | Position override for this diagram            |
| `data-diagview-watermark-opacity` | `0`–`1`                            | Opacity override for this diagram             |
| `data-title`                      | Any string                         | Title shown in header layout label            |

> **Requires `security.allowOverrides: true`** (the default) for `data-diagview-sanitize` and `data-diagview-allow-remote` to take effect.

`data-diagview-scale` and the watermark overrides apply to every export path: the inline toolbar, the fullscreen menu and the `exportTo*` functions. On touch devices and narrow screens, `mobileScale` applies instead of `data-diagview-scale`.

---

## 6. Search

Search is available inside the fullscreen viewer. It highlights all nodes whose text content contains the search query (case-insensitive). Everything outside a match drops to 15% opacity at once, including edges, arrowheads and labels. A matching node stays at full strength with its own colours and label, and its shape gets a 3px outline. In a plain hand-drawn SVG, a matching `<text>` also outlines the smallest filled shape under it.

### Outline colour

DiagView picks the outline colour from the canvas background. It uses `#2563eb` on a light canvas and `#fbbf24` on a dark one. It stores the colour in the `--dv-search-ring` variable, set inline on `<html>` next to `--dv-bg`, `--dv-text-color` and `--dv-accent`. An inline value wins over a plain `:root` rule, so set your own colour on the modal instead, or add `!important`:

```css
#diagview-modal {
  --dv-search-ring: #db2777;
}
```

### Activating search

- **Keyboard:** Press `F` to open and focus the search bar
- **Mobile:** Tap the search icon (🔍) in the top bar
- **Mouse:** Click the search field in the fullscreen topbar

### Behavior

- All matches are highlighted simultaneously (no next/previous — use zoom/pan to navigate)
- An `aria-live` region announces the match count to screen readers
- Pressing `Esc` is two-stage: with a query it clears the query; with an empty query it exits search mode (the next `Esc` closes the viewer)
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
await DiagView.exportToPNG(el, { transparent: true, filename: "my-diagram-2024" }); // omit extension
await DiagView.exportToSVG(el, { transparent: true });
await DiagView.exportToJPEG(el);
await DiagView.exportToWebP(el, { transparent: true });
await DiagView.exportToPDF(el);
await DiagView.copyToClipboard(el);

// Generic dispatcher
await DiagView.exportDiagram(el, "png", { transparent: false });
```

`exportDiagram()` takes one of these modes: `png`, `jpeg`, `webp`, `svg`, `pdf`, `copy` (PNG to the clipboard), `copy-svg` (SVG markup to the clipboard), `png-transparent`, `webp-transparent` and `download` (a PNG). It uses `filename` when you pass one, and otherwise builds the name from the diagram title and a timestamp.

Every export function resolves without throwing when the element contains no `<svg>`; a "No diagram found" toast is shown instead. `copyToClipboard()` downloads the PNG when the browser denies the clipboard write (Safari does this once the click that started the export is over). `exportDiagram(el, "copy-svg")` downloads the .svg file in the same case.

### Options

| Option        | Type       | Default        | Description                                                                                                                                               |
| ------------- | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transparent` | boolean    | `false`        | Transparent background (PNG/SVG/WebP). JPEG switches to a transparent PNG; PDF keeps the background                                                       |
| `filename`    | string     | auto-generated | Output filename without extension                                                                                                                         |
| `modalClone`  | SVGElement | `null`         | Internal, clone from the open modal                                                                                                                       |
| `silent`      | boolean    | `false`        | PNG, JPEG and WebP only. Skips the "Processing" toast and the warning shown when a transparent JPEG is saved as PNG. Success and error toasts still show. |

### Resolution

```javascript
DiagView.init({
  highResScale: 4, // Desktop: output is 4× the SVG's intrinsic size
  mobileScale: 2, // Mobile: output is 2× (pointer: coarse or a viewport up to 768 px wide)
  maxPixels: 16777216, // Safety cap — auto-downscales massive diagrams
});
```

### Fonts

Exports embed the `@font-face` sources used by the diagram, including self-hosted fonts referenced by relative `url()` paths, so the file renders with the same fonts when opened elsewhere. A font file that cannot be fetched is left as its original reference.

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

| Parameter | Description                                                               |
| --------- | ------------------------------------------------------------------------- |
| `dv-idx`  | Diagram index on the page (zero-based)                                    |
| `dv-z`    | Zoom scale (3 decimal places)                                             |
| `dv-cx`   | X coordinate at the viewport center, in the SVG's units after rotation    |
| `dv-cy`   | Y coordinate at the viewport center, in the SVG's units after rotation    |
| `dv-r`    | Rotation angle (90, 180 or 270), left out at 0                            |
| `dv-q`    | Active search query                                                       |
| `dv-t`    | Canvas theme mode (`light`, `dark`, `custom`), left out in Auto mode      |
| `dv-c`    | Custom canvas background hex value (without `#`), only with `dv-t=custom` |

### Example URL

```
https://example.com/docs?dv-idx=2&dv-z=2.500&dv-cx=450&dv-cy=300&dv-r=90&dv-t=custom&dv-c=0b0f19&dv-q=auth
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

Rotates the diagram by 90° clockwise. By default each turn resets the view and fits the rotated diagram, so a zoomed-in view goes back to 100%.

Set `rotateKeepsView: true` to keep the view instead. The diagram turns about the point at the centre of the viewer, that point stays at the centre, and the diagram stays the same size on screen. The zoom % changes, because the rotated diagram fits the viewer at a different size. A wide diagram turned upright reads a higher zoom % than before. If the new zoom would pass `minZoomScale` or `maxZoomScale`, it stops at the limit and the diagram grows or shrinks by the difference.

```javascript
DiagView.init({ rotateKeepsView: true });
```

### Activation

- **Keyboard:** Press `R` in fullscreen
- **UI:** Open FAB menu → click "Rotate 90°"

Rotation state is included in share links (`dv-r=90`) and saved in session storage when `rememberZoom: true`.

---

## 11. Text Select Mode

By default, Panzoom captures all pointer events so dragging pans the diagram. Text Select Mode suspends pan/zoom and enables native browser text selection over SVG `<text>` nodes — useful for copying node labels.

### Activation

- **Keyboard:** Press `T` in fullscreen
- **UI (desktop):** Click the I-beam (text cursor) button in the topbar
- **UI (mobile):** Tap the I-beam icon in the topbar action row

A toast notification confirms when the mode is on or off. The topbar button shows a filled/active state.

---

## 12. Minimap

A thumbnail of the diagram appears in the bottom-left corner of the fullscreen viewer **only when the diagram is larger than the viewport** (more than 5% overflow in either dimension). The minimap:

- Accurately scales for both portrait and landscape diagrams
- Updates on every pan/zoom event (throttled to 100 ms)
- Shows a rectangle in the accent color indicating the current viewport
- Supports **click-to-navigate** — clicking any region of the minimap pans the diagram to that area
- Is hidden on viewports 768 px wide or narrower

```javascript
DiagView.init({ showMinimap: true }); // enabled by default
DiagView.init({ showMinimap: false }); // disable
```

---

## 13. Theming

DiagView auto-detects the host page's theme using a cascade of checks:

1. A `dark` class on `<html>` or `<body>`, as in Tailwind
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
}

[data-theme="dark"] {
  --diagram-accent: #60a5fa;
  --diagram-text: #f1f5f9;
  --background: #0f172a;
}
```

The background comes from the computed background of `<body>`, then `<html>`. DiagView reads `--background`, then `--bg-color`, then `--body-bg` only when both are transparent. Without `--diagram-text`, DiagView uses its built-in light or dark text colour.

For the accent, DiagView takes the first of these that is set: `accentColor` from `init()` or `configure()`, then the page variable `--diagram-accent`, then its built-in blue. The built-in blue is `#3b82f6` on a light page and `#60a5fa` on a dark one. `--diagram-accent` counts only if it holds a colour, so bare numbers such as `222.2 47.4% 11.2%` are skipped. DiagView does not read the site's `--primary` or `--accent-color`. Many themes set those near black or white, and the accent buttons would blend into the page.

Text and icons on the accent are white while white reaches 3:1 against it, the minimum for icons and controls. Below that they turn near-black (`#0f172a`). The built-in blue and a red accent keep white, while amber, light green and the dark-page blue `#60a5fa` get dark text. DiagView stores the pick in `--dv-on-accent` on `<html>`, next to `--dv-accent`.

DiagView checks the page again when the `class`, `data-theme` or `style` attribute of `<html>` or `<body>` changes, so an accent picker that sets these variables applies at once. It also watches `data-bs-theme` on `<html>`. An `accentColor` from `init()` stays in place through those changes. To change it later, call `DiagView.configure({ accentColor })`.

### Manual override

```javascript
DiagView.init({
  accentColor: "#f59e0b",
  backgroundColor: "#0f172a",
  textColor: "#f1f5f9",
});
```

`accentColor`, `backgroundColor` and `textColor` accept any colour the browser accepts, including `oklch()`, `lab()` and `color(display-p3 ...)`. A value the browser rejects (a typo such as `#zzzzzz` or an unknown name) is ignored with a console warning and detection continues as if it were `null`.

### WCAG contrast enforcement

DiagView automatically checks that the detected text color achieves at least a 4.5:1 contrast ratio against the background. If not, it falls back to white (`#ffffff`) or black (`#000000`) as appropriate. This check covers the viewer's own text colour, not the text inside your diagram.

### Canvas Theme

The "Canvas Theme" section of the fullscreen menu sets the background behind the diagram:

- **Light** uses `#ffffff` and **Dark** uses `#0f172a`.
- **Auto** (default) follows the host page theme detected above, or `backgroundColor` when you set it. It updates when the page switches theme.
- The swatch row has a colour picker and four presets: White (`#ffffff`), Dark Slate (`#0b0f19`), Navy (`#0f172a`) and Charcoal (`#1e293b`).

Light, Dark and the swatches override `backgroundColor`. The viewer's own text and controls, including the "?" key badge in the topbar, take their colour from the canvas. DiagView does not save the choice; it lasts until the page reloads or `destroy()` runs. Share links carry it in `dv-t` and `dv-c` (see [Share Links](#8-share-links)). The first time someone opens the viewer, a toast points to this menu. Set `showFirstTimeThemeHint: false` to turn it off.

### Canvas grid

Set `canvasGrid: "dots"` to draw a faint dot grid behind the diagram in the fullscreen viewer. The default is `"none"`.

```javascript
DiagView.init({ canvasGrid: "dots" });
```

The dots move with the diagram as you pan and zoom. Their spacing doubles or halves to stay between 16 and 32 pixels, so they neither blur into grey when zoomed out nor thin out when zoomed in. They take the viewer's text colour at low opacity, so they follow the canvas theme. The grid is a CSS background on the viewer, so exports, clipboard copies and the diagram on the page never show it. `configure({ canvasGrid })` turns it on or off while the viewer is open. There is no per-diagram attribute for it.

### Text Colours

The Canvas Theme section of the fullscreen menu changes only the background behind the diagram. The diagram keeps its author's colours, so dark text drawn for a light page can be hard to read on a dark canvas. The "Text Colours" row under the swatches has two buttons:

- **Original** (default) keeps the diagram's text in the author's colours.
- **Readable** recolours text whose contrast against what sits behind it is under 4.5:1 (WCAG AA).

DiagView checks a label against its own background first, as with Mermaid edge labels. If the label has none, it uses the filled shape under the text, then the canvas. A dark label inside a light node stays as it is. A dark message label drawn straight on a dark canvas turns light. The new colour keeps the hue, so red text on a dark canvas becomes a lighter red rather than white. DiagView changes the lightness until the label reaches 7:1 (WCAG AAA). If no shade of that hue gets there, it uses white or black.

Readable works on any SVG, including HTML labels inside `<foreignObject>` (Mermaid, draw.io). It skips text painted with a gradient and text over a gradient-filled shape. Lines, arrows and shape outlines keep their colours.

Readable follows canvas changes, including page theme changes in Auto mode, and stays on when you reopen the viewer. A page reload or `destroy()` resets it to Original, and DiagView does not save it to `localStorage`. There is no `init()` option for it. It changes only the fullscreen view. Exports, clipboard copies and the diagram on the page keep the author's colours.

---

## 14. SVG Sanitization

DiagView never changes the SVG on your page, and the browser renders it as is. DiagView sanitizes its own copies, which are the clone shown in fullscreen and the copy used for exports and clipboard copies. Sanitize untrusted SVG yourself before you put it on the page, for example with `DiagView.utils.sanitizeSVG()`. Three modes are available:

### `strict` (default)

Blocks all known SVG XSS vectors:

- Dangerous tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<animate>`, `<set>`, `<feimage>`, and others
- `<foreignObject>` whose `src` or `data` points to an `http(s)` URL. Other `<foreignObject>` elements stay, since Mermaid and draw.io put their labels in them
- `on*` event attributes (`onclick`, `onload`, `onerror`, etc.)
- `javascript:`, `vbscript:`, `data:` URIs (except safe raster images like PNG/JPEG/WebP)
- External `<use>` references (`https://...`)
- Inline `style` attributes containing `expression()`, `javascript:`, or remote `url()` references
- `<style>` block content with the same patterns

### `permissive`

Blocks only the most critical vectors:

- Tags: `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`, `<link>`, `<base>`, `<meta>`
- All `on*` event attributes
- `javascript:`/`vbscript:`/`data:` URIs (except safe raster images, as in `strict`)
- SMIL animations (`<animate>`, `<set>`, `<animateTransform>`, ...) whose `attributeName` is `href`/`xlink:href` or an `on*` handler; all other animations are kept

This matches the legacy v0.x behavior, apart from the animation rule above.

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
  <svg><!-- diagram with SMIL animations such as <animate> --></svg>
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

The modal lives in the main document so the fullscreen overlay works correctly. The inline toolbar is built inside the shadow root, so `initShadowRoot()` also installs the DiagView stylesheet there (through `adoptedStyleSheets`, or a `<style>` tag in browsers without it); `destroy()` removes it again together with the wrappers.

Diagrams inside shadow roots are numbered after the ones in the document, in the order the roots were passed to `initShadowRoot()`. Share links (`dv-idx`) use that numbering, so a link to a shadow diagram opens again as long as the page calls `initShadowRoot()` for the same roots in the same order.

---

## 16. Remember Zoom

When enabled, DiagView saves each diagram's zoom level, pan position, and rotation to `sessionStorage` after every change, whether it comes from dragging, the mouse wheel, the keyboard or the toolbar buttons. On the next open, the saved state is restored automatically.

```javascript
DiagView.init({ rememberZoom: true });
```

- State is keyed per `data-diagview-id` (a unique ID generated at init time)
- Storage is cleared when `DiagView.destroy()` is called
- The ID is new on every page load, so saved state carries over between opens on the same page but not across a reload
- Gracefully degrades if sessionStorage is unavailable (private browsing)

---

## 17. Keyboard Shortcuts

| Key(s)                  | Action                              | Notes                                                                                                                                     |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                   | Close modal or close shortcut panel | Shortcut panel closes first; while searching, clears the query, then exits search; an open ☰ menu closes and focus returns to its button |
| `Space` / `0`           | Reset zoom and center diagram       |                                                                                                                                           |
| `+` / `=`               | Zoom in                             |                                                                                                                                           |
| `-` / `_`               | Zoom out                            |                                                                                                                                           |
| `↑` `↓` `←` `→`         | Pan 40 px                           |                                                                                                                                           |
| `Shift` + arrows        | Fast pan 120 px                     |                                                                                                                                           |
| `F`                     | Open and focus search               | On mobile, opens search bar                                                                                                               |
| `T`                     | Toggle text select mode             |                                                                                                                                           |
| `R`                     | Rotate 90° clockwise                |                                                                                                                                           |
| `M`                     | Toggle meeting mode (laser pointer) |                                                                                                                                           |
| `L`                     | Copy share link                     | Clipboard API on HTTPS or localhost, `execCommand('copy')` elsewhere                                                                      |
| `?`                     | Show/hide keyboard shortcuts        | Suspended while an input is focused, so `?` can be typed into search                                                                      |
| `Ctrl/Cmd/Alt`+anything | Ignored                             | Native browser shortcuts are never intercepted                                                                                            |

Shortcuts are disabled when the modal is closed. When an `<input>` or `<textarea>` is focused, all shortcuts except `Esc` are suspended.

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

Options such as `layout` and the button settings apply to diagrams DiagView initializes after the call. To change them for diagrams already on the page, call `destroy()` and then `init()`.

### Scan for new diagrams

When content is added to the DOM dynamically (e.g. after an API call), call `refresh()`:

```javascript
// After adding new .diagram elements to the DOM
DiagView.refresh();
```

> **Note:** DiagView also uses a `MutationObserver` to detect and initialize newly added diagrams automatically (with a 100 ms debounce). `refresh()` skips that debounce. Either way, DiagView initializes each diagram once it comes within 200 px of the viewport.

`refresh()` also re-checks diagrams that hit the error boundary (the error placeholder). Replace the broken SVG with a valid one and call `refresh()`; the placeholder is removed and the diagram is initialized normally.

### Teardown and reinitialize

```javascript
await DiagView.destroy();

// Configure differently and reinitialize
DiagView.init({ layout: "header", accentColor: "#ff6b6b" });
```

`destroy()` returns every diagram to its pre-init state: wrappers and toolbars are removed, the `data-diagview-*` attributes DiagView added, the `dv-svg-content` class, inline styles, click handlers, error placeholders and the `--dv-*` variables on `<html>` are all cleared, in every layout and in shadow roots as well. The next `init()` therefore applies its own options to all diagrams again. `destroy()` also resets the configuration to the defaults, the Canvas Theme to Auto and Text Colours to Original.

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
    // error.message is "DiagView: " followed by the placeholder title and a short reason
  },
});
```

`onExport` fires for the toolbar and menu buttons and for `exportDiagram()`, and only after the export succeeds. It does not fire when the export fails or is blocked, such as by the size limit. Copy Image counts as a success when it downloads the PNG instead. A PDF export that falls back to PNG because jsPDF did not load does not fire it. `format` is the normalised mode, such as `png`, `copy` or `copy-svg`. For image downloads it is the format of the file that was made. `png-transparent` and `download` arrive as `png`, and `webp-transparent` arrives as `webp`. A transparent JPEG is saved as a PNG and arrives as `png`, and so does an unknown mode. The per-format `exportTo*` functions and `copyToClipboard()` do not call it. `onError` fires when a diagram fails validation and shows the error placeholder.

---

## 20. Framework Integration

Live example: [React 18 + StrictMode demo](https://khadirullah.github.io/diagview/framework-react.html) — a real React dev-build tree that mounts, unmounts, remounts and replaces diagrams, with an "unsafe pattern" toggle that shows the error the rule below prevents. `demo/framework-react.html` in the repo, verified by `tests/e2e/verify-react-strictmode.mjs`.

> **The one rule:** keep the diagram element (the one matching `diagramSelector`) nested inside a container that your component renders and owns. With the `floating` and `header` layouts DiagView moves the diagram element into a wrapper so it can place the toolbar next to it. Your framework still believes the element sits where it rendered it, so if it later removes that exact element (unmount, conditional render, key change) the browser throws `NotFoundError: The node to be removed is not a child of this node`. Removing the outer container instead is always safe, because the wrapper is inside it and goes away with it.
>
> Do not re-render the diagram element itself with new content once DiagView has initialized it. Render a new one (inside the container) or call `DiagView.refresh()` after replacing the SVG.
>
> If you would rather DiagView never touch the DOM around your element, use `layout: "off"`. It attaches a click handler and nothing else. Fullscreen, zoom, search, minimap and export all still work; only the inline toolbar is dropped. Closing the viewer puts focus back on the diagram. Pair it with `DiagView.openFullscreen(el)` / `DiagView.exportDiagram(el, ...)` from your own buttons if you need them.
>
> **React StrictMode / hot reload:** the development-only destroy-then-init sequence is handled by `init()` itself, which queues behind an in-flight `destroy()`. You do not need to await either call in an effect.
>
> **Unmount vs detach:** unmounting a component removes its DOM, diagram included, in every layout; DiagView is not deleting anything, its toolbar just goes with the diagram. Call `destroy()` in the cleanup so handlers are released. To remove only the viewer and keep the diagram on the page, leave the component mounted and call `destroy()`; the diagram is returned to where your framework rendered it, and `init()` enhances it again.

### React — with cleanup

```jsx
import { useEffect } from "react";
import DiagView from "diagview";

function DiagramViewer({ svgContent }) {
  useEffect(() => {
    DiagView.init({ layout: "floating" });
    return () => {
      DiagView.destroy();
    };
  }, []);

  // The outer div is owned by React and is what React removes on unmount.
  // The inner .diagram div is what DiagView wraps; React never removes it directly.
  return (
    <div className="diagram-host">
      <div className="diagram" dangerouslySetInnerHTML={{ __html: svgContent }} />
    </div>
  );
}
```

### React — no inline toolbar (`layout: "off"`)

```jsx
useEffect(() => {
  DiagView.init({ layout: "off" });
  return () => {
    DiagView.destroy();
  };
}, []);

// DiagView only attaches a click-to-fullscreen handler; the DOM is left as rendered.
return <div className="diagram" dangerouslySetInnerHTML={{ __html: svgContent }} />;
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

<template>
  <div class="diagram-host">
    <div class="diagram"><svg>...</svg></div>
  </div>
</template>
```

### Angular

```typescript
import { Component, OnInit, OnDestroy } from "@angular/core";

declare const DiagView: any;

@Component({
  selector: "app-root",
  template: `
    <div class="diagram-host">
      <div class="diagram"><svg>...</svg></div>
    </div>
  `,
})
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

<div class="diagram-host">
  <div class="diagram"><svg>...</svg></div>
</div>
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

### Natural panning

By default, `ArrowUp` moves the diagram downward (camera moves up). Set `naturalPanning: true` for scroll-like behavior where `ArrowUp` moves the diagram up.

```javascript
DiagView.init({ naturalPanning: true });
```

### Performance limits

```javascript
DiagView.init({
  performance: {
    criticalFileLimit: 10000000, // Block processing above 10,000,000 characters of serialized SVG
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

`openFullscreen()` does nothing while the modal is already open. To switch to another diagram, close first:

```javascript
await DiagView.closeModal();
DiagView.openFullscreen(otherDiagram);
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
console.log(DiagView.version); // e.g. "1.0.12"
```

---

## 24. Troubleshooting

### Diagrams not showing interactive controls

1. Check the selector: does your element match `diagramSelector`?
2. Ensure the element contains an `<svg>` child with visible content. A `viewBox` is not required; width/height-only SVGs work
3. Check the browser console — errors from SVG validation appear there
4. Confirm DiagView initialized: `console.log(DiagView.state.isInitialized)`

### Error placeholder instead of a diagram

DiagView shows a placeholder titled "Syntax Error", "Parse Error", "No Diagram Found" or "Diagram Error" when the `<svg>` fails validation. That happens when the SVG:

- contains a `<parsererror>` element
- is a diagram library's error output, for example a Mermaid syntax error
- has no `g`, `path`, `rect`, `circle`, `text`, `line`, `polygon` or `polyline` element
- declares a `viewBox` with zero width or height
- has text but no shapes, and the text contains "error" or "failed"

Fix the SVG in place and call `DiagView.refresh()`; the placeholder is removed and the diagram is initialized normally.

### "Already initialized" warning and my options are ignored

Auto-init ran before your `DiagView.init({...})`. This happens when your call comes after an `await` or from a framework effect. Add `data-diagview-no-auto-init` to the script tag, or call `init()` synchronously after the library loads (see [Timing](#timing)).

### `diagramSelector` change has no effect

`configure()` validates the selector with `document.querySelector`. An invalid selector logs a warning and keeps the previous selector.

### Zoom/pan not working in fullscreen

- Ensure `@panzoom/panzoom` is loaded before you open the viewer, or before `init()` if you use share links
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

Copying the image needs the Clipboard API, which browsers only offer on HTTPS or `localhost`. Without it, or when the browser denies the write (Safari, once the click that started the export is over), DiagView downloads the PNG instead. Copy SVG and share links fall back to `document.execCommand('copy')` on HTTP. When the browser refuses the copy, Copy SVG downloads the .svg file instead.

### Search highlights nothing

Search matches text inside `<text>`, `.node`, `.cluster`, `.edgePath` and `.label` elements. Check that your SVG contains visible text nodes.

### Share link not working

- On HTTPS or `localhost` the link is copied with the Clipboard API; elsewhere DiagView falls back to `document.execCommand('copy')`
- The `dv-*` parameters are stripped from the URL after processing to keep bookmarks clean

### Mobile controls drift when pinch-zooming

No setting is needed. When the modal opens, DiagView syncs its UI to the visual viewport and keeps it in sync while the browser is pinch-zoomed. If you still see drift, please open an issue with the device and browser version.

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

| Option     | Type    | Default          | Description                                                                                                                               |
| ---------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`  | boolean | `false`          | Whether to inject branding on export/download                                                                                             |
| `text`     | string  | `""`             | The branding text (e.g. your domain or name)                                                                                              |
| `style`    | string  | `"corner"`       | `corner` \| `background` (PowerPoint style) \| `both`                                                                                     |
| `position` | string  | `"bottom-right"` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` \| `center` \| `four-sides`. `four-sides` needs the `corner` or `both` style |
| `opacity`  | number  | `0.2`            | Transparency level (0.0 to 1.0)                                                                                                           |

### Values DiagView does not know

Export checks `style`, `position` and `opacity` each time it draws the watermark, from the config and from the `data-diagview-watermark-*` attributes. Case and spaces around the value do not matter at runtime, so `"Corner"` and `"TOP-LEFT"` work. A mistake never removes the watermark. DiagView draws it with the fallback below and logs a console warning that names the value it used.

| Option     | Valid values                                                                   | Missing or empty           | Anything else                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`    | `corner`, `background`, `both`                                                 | `corner`, no warning       | `corner`, with a warning                                                                                                                             |
| `position` | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`, `four-sides` | `bottom-right`, no warning | `bottom-right`, with a warning                                                                                                                       |
| `opacity`  | A number from 0 to 1, such as `0.2` or `"0.2"`                                 | `0.2`, no warning          | Below 0 uses 0 and above 1 uses 1. Anything that is not a number uses 0.2 in the config, and the config opacity in an attribute. Each logs a warning |

For example, `opacity: 5` draws at full strength, `opacity: "abc"` draws at 0.2, and `data-diagview-watermark-opacity="abc"` keeps whatever opacity the config sets.

### Turning it off for one diagram

To watermark every diagram except one or two, enable it in the config and add `data-diagview-watermark="false"` to the diagrams that should not have it. Downloads, copies and `exportTo*()` calls for those diagrams then have no watermark. The attribute wins over the config.

The reverse also works. Leave `enabled` false and add `data-diagview-watermark="true"` to the diagrams that need one, with the text in the config or in `data-diagview-watermark-text`. The attribute must be exactly `"true"` or `"false"`. Any other non-empty value also turns the watermark off.

The attribute goes on the element that `diagramSelector` matches. For Mermaid, that is the element holding the Mermaid code:

```html
<!-- Watermarked -->
<div class="mermaid">graph LR; A --> B</div>

<!-- Not watermarked -->
<div class="mermaid" data-diagview-watermark="false">graph LR; C --> D</div>

<script type="module">
  await mermaid.run();
  DiagView.init({
    diagramSelector: ".mermaid",
    watermark: { enabled: true, text: "khadirullah.com" },
  });
</script>
```

### Branding Styles

#### 1. Full-Canvas Overlay

Places a large, faint version of your text in the center of the diagram, rotated at -30 degrees. This is the most protective option as it covers the main content area. Note: This style is always centered and ignores the `position` setting. With the `corner` style, `position: "center"` draws this layer in place of the corner signature.

#### 2. Corner (Professional Signature)

Places a small signature in the corner of your choice. This style obeys the `position` setting.

#### 3. Both (Ultimate Protection)

Shows **both** the large background text AND the corner signature.

#### 4. Four Sides

With the `corner` or `both` style, `position: "four-sides"` places your text on all four edges of the image. The `background` style ignores the position.

### File Size Note

Adding watermarks increases the complexity of the exported image. While the impact is minimal for most diagrams, using the `both` style or `four-sides` position will slightly increase the final file size of your exported PNG, SVG, or PDF files.

### Visibility Optimization

DiagView uses a "Contrast Stroke" technique to ensure your watermark is visible on any background. If your diagram has light yellow boxes (like Mermaid charts) or dark nodes, the watermark will remain legible by using a subtle outline of the opposite color.
