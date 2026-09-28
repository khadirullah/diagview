# DiagView usage guide

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
import DiagView from "diagview"; // resolves dist/esm/index.js
```

CommonJS code and Jest use `require()`, which resolves `dist/diagview.umd.cjs`:

```javascript
const DiagView = require("diagview");
```

### Bundler (Vite, Webpack, Rollup)

```javascript
// vite.config.js
// Mark Panzoom as external if you load it from a CDN
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

When the page has no `data-diagview-no-auto-init` attribute, DiagView automatically scans for diagrams and initializes itself after `DOMContentLoaded`. The default selector is:

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

Auto-init never runs synchronously. It is scheduled one task after `DOMContentLoaded` (or one task after the library finishes evaluating when it is loaded with `type="module"`, `defer`, or after the page has already parsed). A `DiagView.init({...})` call that runs before that task cancels the pending auto-init, and your options win. Calls from a bundler entry point, a `<script type="module">`, a `defer` script or a plain script right after the tag all run in time. The opt-out attribute is only required when your own `init()` happens later than that, for example after an `await` (Mermaid rendering, a fetch) or from a framework effect.

`init()` also works from a script in `<head>`. The page has no `<body>` at that point, so DiagView waits for `DOMContentLoaded` and starts then. The promise `init()` returns resolves once it has started.

The opt-out attribute works on any element. Put it on the library's `<script>` tag, on your own script tag, or on `<html>`. A bundled app has no script named `diagview`, so use `<html>` or the app's own tag:

```html
<html data-diagview-no-auto-init></html>
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
// ✅ Mermaid renders first, then DiagView scans
await mermaid.run();
DiagView.init({ diagramSelector: ".mermaid" });

// ❌ DiagView scans before Mermaid outputs SVG
DiagView.init({ diagramSelector: ".mermaid" });
await mermaid.run();
```

---

## 4. Layout Modes

### Floating (Default)

The floating layout keeps the diagram area clean. On hover, the buttons fade in at the bottom of the card. They use the same `ui.buttons.style` as the header layout, so see [Button style](#button-style) to change their look. In fullscreen, a FAB (Floating Action Button) at the bottom-right gives access to export, share, rotate, and meeting mode.

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
2. A `<title>` element directly inside the `<svg>`. PlantUML and Graphviz put a `<title>` on every shape as a tooltip, and those do not count.
3. Fallback: `"DIAGRAM"`

Export file names use the same order, then a chart title Mermaid draws on the diagram, then `diagram_export`. A timestamp follows, as in `checkout_sequence_2026-09-28_011554.png`.

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

| Attribute                           | Type                               | Description                                   |
| ----------------------------------- | ---------------------------------- | --------------------------------------------- |
| `data-diagview-layout`              | `header \| floating \| off`        | Layout for this diagram                       |
| `data-diagview-scale`               | Integer `1` to `10`                | Export `highResScale` for this diagram        |
| `data-diagview-sanitize`            | `strict` \| `permissive` \| `off`  | SVG sanitization mode                         |
| `data-diagview-allow-remote`        | `true` \| `false`                  | Allow remote CSS/fonts in SVG                 |
| `data-diagview-watermark`           | `true` \| `false`                  | Turn the watermark on or off for this diagram |
| `data-diagview-watermark-text`      | Any string                         | Custom watermark text                         |
| `data-diagview-watermark-style`     | `corner` \| `background` \| `both` | Style override for this diagram               |
| `data-diagview-watermark-pos`       | `top-left` \| `...`                | Position override for this diagram            |
| `data-diagview-watermark-placement` | `diagram` \| `margin`              | Placement override for this diagram           |
| `data-diagview-watermark-opacity`   | `0` to `1`                         | Opacity override for this diagram             |
| `data-title`                        | Any string                         | Title shown in header layout label            |

> **Requires `security.allowOverrides: true`** (the default) for `data-diagview-sanitize` and `data-diagview-allow-remote` to take effect.

`data-diagview-scale` and the watermark overrides apply to every export path: the inline toolbar, the fullscreen menu and the `exportTo*` functions. On touch devices and narrow screens, `mobileScale` applies instead of `data-diagview-scale`.

---

## 6. Search

Search is available inside the fullscreen viewer. It highlights all nodes whose text content contains the search query (case-insensitive). Everything outside a match drops to 15% opacity at once, including edges, arrowheads and labels. A matching node stays at full strength with its own colours and label, and its shape gets a 3px outline. In a plain hand-drawn SVG, a matching `<text>` also outlines the smallest filled shape under it. draw.io keeps a `<text>` copy of each label that the browser never draws. Search matches the HTML label on screen instead and outlines the box under it.

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

- All matches are highlighted at once. There is no next or previous, so zoom and pan to move between them
- An `aria-live` region announces the match count to screen readers
- Pressing `Esc` is two-stage: with a query it clears the query; with an empty query it exits search mode (the next `Esc` closes the viewer)
- Pressing the `✕` button clears the query

### Pre-fill search on open

```javascript
// Open a diagram pre-filled with a search query
DiagView.openFullscreen(element, { searchQuery: "auth service" });
```

### Search and export

An export made during a search keeps the dimming and the outline, unless `exportSearchHighlight` is `false`. See [Search highlight](#search-highlight).

### Search performance

The search module pre-warms its candidate cache during browser idle time, so the first keystroke is never slow even on 2,500-node diagrams.

---

## 7. Export

### From the UI

In fullscreen, open the FAB menu (bottom-right) and click any export button. The "Transparent" checkbox applies to PNG, WebP, and SVG only.

### Search highlight

An export from the fullscreen viewer shows what the viewer shows, so during a search the file has the dimmed nodes and the outlined match. With Readable on, labels have the same recoloured text as in the viewer, unless the file is transparent (see [Text Colours](#text-colours)). Set `exportSearchHighlight: false` to export the plain diagram instead. The search in the viewer stays as it was.

```javascript
DiagView.configure({ exportSearchHighlight: false });
```

### Linked images

A diagram can hold an image in two ways. An embedded image carries its data in the SVG as a `data:` URL. A linked image points to a file, such as `<image href="logo.png">` or an `<img>` in an HTML label. The page and the SVG export show both, since the SVG file keeps the link.

PNG, JPEG, WebP, PDF and Copy Image leave linked images out. DiagView draws the SVG as an image to make these files, and the browser loads nothing an SVG drawn that way links to. The export then shows a warning in place of the saved notice, for example "4.0x PNG saved, but 2 linked images were left out. Only embedded images can go into image files." The file is still saved or copied, so `exportDiagram()` resolves to `true` and `onExport` fires. When the same export also finds labels that are hard to read (see [Text Colours](#text-colours)), one warning says both: "4.0x PNG saved, but 1 linked image was left out and some labels are hard to read on this background. Turn on Readable and export again." With `silent: true` the plain saved notice shows instead. To keep an image in these files, embed it as a base64 `data:` URL of one of the `allowedImageTypes`.

A browser can also refuse to let DiagView read back the image it drew, and then the export fails. The notice says "Export blocked by cross-origin image" only when the copy links an image, a `<use>`, a CSS `url()` or an `@import` on another origin. A `data:` URL, a relative link or a link to your own site does not count. Any other failure shows "Export Failed" with the browser's message.

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

// Generic dispatcher. Resolves to true once the file is saved or copied.
const saved = await DiagView.exportDiagram(el, "png", { transparent: false });
```

`exportDiagram()` takes one of these modes: `png`, `jpeg`, `webp`, `svg`, `pdf`, `copy` (PNG to the clipboard), `copy-svg` (SVG markup to the clipboard), `png-transparent`, `webp-transparent` and `download` (a PNG). It uses `filename` when you pass one, and otherwise builds the name from the diagram title and a timestamp. The title comes from `data-title`, then the SVG's own `<title>`, then a Mermaid chart title (see [Header](#header)).

Every export function resolves without throwing when the element contains no `<svg>`, and a "No diagram found" toast shows instead. `exportDiagram()` resolves to `true` when the export succeeded and to `false` when it failed, was blocked or found no diagram. The toolbar's copy and download buttons show their green tick only after a `true`. `copyToClipboard()` downloads the PNG when the browser denies the clipboard write (Safari does this once the click that started the export is over). `exportDiagram(el, "copy-svg")` downloads the .svg file in the same case.

### Options

| Option        | Type       | Default        | Description                                                                                                                                                                                                                              |
| ------------- | ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transparent` | boolean    | `false`        | Transparent background (PNG/SVG/WebP). JPEG switches to a transparent PNG; PDF keeps the background                                                                                                                                      |
| `filename`    | string     | auto-generated | Output filename without extension                                                                                                                                                                                                        |
| `modalClone`  | SVGElement | `null`         | Internal, clone from the open modal                                                                                                                                                                                                      |
| `silent`      | boolean    | `false`        | Skips the "Processing" toast and the warning shown when a transparent JPEG is saved as PNG (PNG, JPEG, WebP and Copy Image), and the hard-to-read labels and linked images warnings (every format). Success and error toasts still show. |

### Resolution

```javascript
DiagView.init({
  highResScale: 4, // Desktop: output is 4× the SVG's intrinsic size
  mobileScale: 2, // Mobile: output is 2× (pointer: coarse or a viewport up to 768 px wide)
  maxPixels: 16777216, // Safety cap, larger exports are scaled down to fit
});
```

### Fonts

Exports embed the `@font-face` sources used by the diagram, including self-hosted fonts referenced by relative `url()` paths, so the file renders with the same fonts when opened elsewhere. DiagView embeds only the rules the labels need. It picks the family, style and weight the browser would pick for each label, and of those only the files whose `unicode-range` covers a character in the label. A font file that cannot be fetched is left as its original reference.

The browser hides the rules of a stylesheet from another origin, such as Google Fonts, unless its `<link>` has `crossorigin="anonymous"`. Without it DiagView cannot embed those fonts and logs a console warning once per stylesheet. The exported file then shows the labels in another font, which can be wider and cut off the end of a label.

`exportFonts` sets which page fonts go into exports:

```javascript
DiagView.init({
  exportFonts: "used", // default, the fonts the labels use
  // exportFonts: "all", // every @font-face rule on the page, a much larger file
  // exportFonts: "none", // no fonts, for fonts whose licence forbids embedding
});
```

With `"none"` DiagView fetches no font files and logs no warning. The exported file names the fonts, and a computer without them shows the labels in a fallback font.

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

Share the exact zoom level and pan position with anyone. The generated URL is the page address with DiagView's own parameters. It leaves out the page's other query parameters and its `#hash`, so auth tokens and similar values never end up in a shared link.

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

Once DiagView has read a share link, it removes every query parameter whose name starts with `dv-` from the address bar. It does this whether the link matched a diagram or not, so `?dv-idx=99` or a lone `?dv-z=2` goes too. Other query parameters and the `#hash` stay. DiagView changes the address with `history.replaceState`, so no history entry is added.

The parameters stay in two cases, so DiagView can try again later. One is a page with no diagrams yet. The other is a link to a diagram whose `<svg>` has not arrived yet. DiagView reads the link again when the page adds new elements, when you call `refresh()` and when you call `initShadowRoot()`.

---

## 9. Meeting Mode

Renders a red laser-pointer dot that follows the mouse (or touch point). Designed for screen-sharing presentations.

### Activation

- **Keyboard:** Press `M` in fullscreen
- **UI:** Open FAB menu → click "Meeting Mode"

### Behavior

- The cursor is hidden (`cursor: none`) over the diagram. Over the toolbar and the menu the normal cursor shows, and the dot stays at its last spot on the diagram
- The dot follows the mouse, a pen or the first finger, also while you drag to pan. During a pinch it stays with the first finger
- The dot pulses. With reduced motion on, it holds still at its normal size
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

Rotation state is included in share links (`dv-r=90`) and remembered between opens when `rememberZoom: true`.

---

## 11. Text Select Mode

By default, Panzoom captures all pointer events so dragging pans the diagram. Text Select Mode suspends pan/zoom and enables native browser text selection over SVG `<text>` nodes, so you can copy node labels.

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
- Supports **click-to-navigate**. Clicking any region of the minimap pans the diagram to that area
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
3. `data-bs-theme="dark"` on `<html>`, as in Bootstrap
4. The OS preference, read with `window.matchMedia('(prefers-color-scheme: dark)')`

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

The background comes from the computed background of `<body>`, then `<html>`. DiagView reads `--background`, then `--bg-color`, then `--body-bg` only when both are transparent. Without `--diagram-text` or `textColor`, DiagView uses `#1e293b` or `#f1f5f9`, whichever has more contrast on the canvas.

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

A `backgroundColor` with transparency, such as `"transparent"` or `rgba(15, 23, 42, 0.5)`, lets the page show through the viewer. DiagView picks light or dark text and controls for the colour you actually see, which is the page colour with yours laid over it. `"transparent"` follows the page colour alone.

Warning notices, such as the one shown when a transparent JPEG is saved as PNG, are amber (`#f59e0b`). Set `warningColor` to use another colour. It accepts the same colours, and a value the browser rejects logs a console warning and keeps the amber. Success notices use the accent. Error notices are always red. DiagView picks white or near-black text for each notice so the text reaches 4.5:1 on its colour. When neither does, it darkens the colour until white text does. Warning notices stay on screen for 5 seconds, whatever `toastDuration` and `errorToastDuration` say.

### WCAG contrast enforcement

DiagView checks that the viewer's text colour reaches at least 4.5:1 against the canvas. When it falls short, DiagView logs a console warning and changes the colour. It turns black (`#000000`) or white (`#ffffff`), whichever has more contrast. This applies to its built-in colour, which can fall short on a mid-grey canvas, and to a `textColor` or `--diagram-text` you set. For example, `textColor: "#475569"` reaches 3.6:1 on a `#b3b3b3` canvas, so the viewer uses black at 10:1. This check covers the viewer's own text colour, not the text inside your diagram.

The menu headings and the search placeholder use a lighter shade of the same colour, stored in `--dv-muted-text` on `<html>`. DiagView fades the text colour toward the canvas by up to 30% and stops before it drops under 4.5:1, on the canvas and on the search box's grey wash. On a canvas where the text only just passes, they stay at full strength.

### Canvas Theme

The "Canvas Theme" section of the fullscreen menu sets the background behind the diagram:

- **Light** uses `#ffffff` and **Dark** uses `#0f172a`.
- **Auto** (default) follows the host page theme detected above, or `backgroundColor` when you set it. It updates when the page switches theme.
- The swatch row has a colour picker and four presets: White (`#ffffff`), Dark Slate (`#0b0f19`), Navy (`#0f172a`) and Charcoal (`#1e293b`).

Light, Dark and the swatches override `backgroundColor`. The viewer's own text and controls take their colour from the canvas. So do the key badges in the topbar and the ☰ menu, also on sites that style `kbd` themselves. DiagView does not save the choice; it lasts until the page reloads or `destroy()` runs. Share links carry it in `dv-t` and `dv-c` (see [Share Links](#8-share-links)). The first time someone opens the viewer in a browser, a hint just above the menu button points to this menu for six seconds. DiagView stores in `localStorage` that the hint was shown, so it does not come back on later opens or page loads. Set `showFirstTimeThemeHint: false` to turn it off.

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

Readable follows canvas changes, including page theme changes in Auto mode, and stays on when you reopen the viewer. A page reload or `destroy()` resets it to Original, and DiagView does not save it to `localStorage`. There is no `init()` option for it. The diagram on the page always keeps the author's colours.

Exports follow what you see. With Readable on, an export with a background gets the same recoloured labels, worked out against the export background. This covers PNG, JPEG, WebP, PDF, SVG and Copy Image, from the fullscreen menu, the page toolbar and the export functions. A toolbar export uses the canvas colour you last picked as its background, so it gets Readable colours too while Readable is on. Transparent PNG, WebP and SVG files keep the author's colours, since light text would vanish on a white page. Copy SVG has no background, so it keeps them as well.

With Readable off, DiagView checks the labels before a PNG, JPEG, WebP, PDF, SVG or Copy Image export. If a label drawn straight on the background is under 4.5:1, a warning follows the saved notice: "Some labels are hard to read on this background. Turn on Readable, or pick Light, and export again." On a background where black text reads better than white, the warning leaves out "or pick Light", since Light would not help. Labels inside a filled shape do not count, since the shape stays behind them in the file. The warning shows at most once each time you open the viewer. Toolbar exports use the canvas colour too, so they warn the same way, once per diagram until the page reloads. Transparent exports and exports with `silent: true` never warn. A diagram drawn for a white page does not warn on the Light canvas.

---

## 14. SVG Sanitization

DiagView never sanitizes or rewrites the content of the SVG on your page, and the browser renders it as is. The security mode applies only to DiagView's own copies, which are the fullscreen view, exports and clipboard copies. DiagView cleans each copy before the browser loads anything in it, so code the mode removes never runs, not even once. Sanitize untrusted SVG yourself before you put it on the page, for example with `DiagView.utils.sanitizeSVG()`.

Setting up a diagram changes the page's `<svg>` element itself in a few small ways. DiagView adds the class `dv-svg-content` and sets `transition: filter 0.3s ease` in its inline style. In the header and floating layouts it also sets `color: inherit`. An SVG that fails validation gets `display: none` and sits hidden behind the error placeholder. `destroy()` removes the class and puts each of these inline values back as it was. A `class` or `style` attribute that DiagView created is removed once it is empty.

In the header and floating layouts, DiagView moves the diagram element into its wrapper when it sets the diagram up, and `destroy()` moves it back. Every browser reloads an `<iframe>`, `<object>` or `<embed>` inside the element each time it moves. Their content starts again from the beginning and loses its state, such as a scroll position or a half-filled form. Safari also reloads images, so an image with an `onerror` handler may run that handler once more. This is your page's own code, which already ran when the page loaded. DiagView's copies never run it. With `layout: "off"` DiagView never moves the element, so nothing reloads.

The Security modes panel on the [demo page](https://khadirullah.github.io/diagview/#security) runs one small diagram through all three modes side by side.

### Choosing a mode

- **`strict` (default).** Use it for any diagram. Keep it for diagrams other people can write, such as wiki or CMS uploads, pasted SVGs and SVGs from an API.
- **`permissive`.** Use it for your own diagrams that animate with SMIL, such as `<animate>` or `<animateTransform>`.
- **`off`.** Use it only for your own diagrams whose click handlers or links you need in fullscreen. The copy keeps every script and handler. Inline event handlers such as `onclick`, `onload` and `onerror` run in the fullscreen copy. A `<script>` element stays in the copy but never runs there, in any browser. Exports keep both unless `security.exportMode` is `"strict"`, and a browser that opens a downloaded SVG file runs its scripts.

`security.exportMode` picks the mode for exports, downloads and clipboard copies. With `"same"`, the default, each export uses its diagram's own mode. With `"strict"`, DiagView cleans every export and copy in `strict` mode, whatever mode the page or the diagram uses on screen. Use it when you need click handlers in fullscreen but want clean files, since a downloaded file reaches people who never saw your page:

```javascript
DiagView.init({ security: { mode: "off", exportMode: "strict" } });
```

`exportMode` has no `data-diagview-*` attribute, so one diagram cannot loosen it. `allowRemoteResources` and `data-diagview-allow-remote` still apply to exports.

### What each mode removes

| Removed from the copy                                                                                                                                     | `strict` | `permissive` | `off` |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`, `<link>`, `<base>`, `<meta>`                                                         | Yes      | Yes          | No    |
| `on*` event handler attributes such as `onclick`, `onload` and `onerror`                                                                                  | Yes      | Yes          | No    |
| `javascript:`, `vbscript:` and `data:` URLs in `href`, `xlink:href`, `src` and `action`. Base64 `data:` images of the `allowedImageTypes` stay            | Yes      | Yes          | No    |
| SMIL animations whose `attributeName` is `href`, `xlink:href` or an `on*` handler                                                                         | Yes      | Yes          | No    |
| All other SMIL animations: `<animate>`, `<animateColor>`, `<animateMotion>`, `<animateTransform>`, `<set>`                                                | Yes      | No           | No    |
| `<discard>`, `<mpath>`, `<tref>`, `<math>`, `<feImage>`                                                                                                   | Yes      | No           | No    |
| `<foreignObject>` whose `src` or `data` is an `http(s)` URL. Other `<foreignObject>` elements stay, since Mermaid and draw.io put their labels in them    | Yes      | No           | No    |
| `href` on a `<use>` that points to another site (`https://`, `http://` or `//`)                                                                           | Yes      | No           | No    |
| A `style` attribute with `expression()`, `javascript:` or `vbscript:`, also when hidden by CSS escapes or comments, or with a remote `url()` or `@import` | Yes      | No           | No    |
| A `<style>` block with the same patterns. The whole block goes                                                                                            | Yes      | No           | No    |

With `allowRemoteResources: true`, remote `url()` and `@import` stay in `strict` too. See [Allowing remote resources](#allowing-remote-resources).

### What readers notice

- Under `strict`, SMIL animations stand still in fullscreen and in exports. CSS `@keyframes` animations in a `<style>` block keep running.
- Under `strict` and `permissive`, a click handler does nothing in fullscreen, and a `javascript:` link no longer opens anything.
- Under `strict`, a `<style>` block that loads a remote font or stylesheet goes away whole, so the copy loses every rule in it.
- The diagram on the page keeps everything, so it can behave differently from its fullscreen view.
- With `exportMode: "strict"`, a file can lose an animation or a click handler that still works in fullscreen.

### Console warning for removed code

When `strict` or `permissive` removes code from a diagram, DiagView logs one warning for that diagram per page load. Code means `<script>` elements, `on*` event handlers and `javascript:` links, including ones an animation would write. The warning appears the first time DiagView copies the diagram for fullscreen, an export or a clipboard copy. For example:

```text
DiagView: Removed code from this diagram in strict mode: 1 event handler (onerror). Use security.mode "off" only for diagrams you trust.
```

The warning passes the diagram's element along, so the browser console shows it next to the message. Hover or click it there to find the diagram on the page. Animations, CSS and remote resources that `strict` removes do not trigger the warning, and `off` never warns. Code that `exportMode: "strict"` removes from an export does not warn either, since you asked for it.

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

`data-diagview-sanitize` changes the mode for that one diagram. The mode covers its fullscreen view and every export and copy of it, from the page toolbar or the fullscreen menu, unless `security.exportMode` is `"strict"`. It works only while `security.allowOverrides` is `true`, which is the default. Set `allowOverrides: false` when page authors should not be able to turn sanitizing off.

A mistyped mode logs a warning. An unknown `security.mode` uses `strict`. An unknown `data-diagview-sanitize` value uses the global mode and warns once per value. An unknown `security.exportMode` warns and uses `"same"`.

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

Call `init()` first. Before that, `initShadowRoot()` only logs "Call init() before initShadowRoot()".

The modal lives in the main document so the fullscreen overlay works correctly. The inline toolbar is built inside the shadow root, so `initShadowRoot()` also installs the DiagView stylesheet there, through `adoptedStyleSheets` or a `<style>` tag in browsers without it. `destroy()` removes it again together with the wrappers.

Closing the viewer puts focus back on the button or diagram inside the shadow root that opened it, the same as in the document. This needs an open shadow root. A closed root hides which of its elements has focus, so there focus does not go back inside it.

DiagView does not watch shadow roots for new diagrams, and `refresh()` scans only the document. After you add a diagram to a shadow root, call `initShadowRoot()` on that root again. Diagrams it has already set up keep their toolbar. `destroy()` forgets every root, so call `initShadowRoot()` again after the next `init()`.

Diagrams inside shadow roots are numbered after the ones in the document, in the order the roots were passed to `initShadowRoot()`. Share links (`dv-idx`) use that numbering, so a link to a shadow diagram opens again as long as the page calls `initShadowRoot()` for the same roots in the same order.

---

## 16. Remember Zoom

When enabled, DiagView remembers each diagram's zoom level, pan position, and rotation after every change, whether it comes from dragging, the mouse wheel, the keyboard or the toolbar buttons. On the next open, the saved state is restored automatically.

```javascript
DiagView.init({ rememberZoom: true });
```

- State is keyed per `data-diagview-id`. DiagView sets this unique ID when it sets up the diagram, or when the viewer first opens it if that comes sooner. A diagram opened with `openFullscreen()` before it scrolls into view is remembered too, and keeps the same ID when it gets its toolbar
- State is kept in memory until the page reloads or `DiagView.destroy()` runs. Nothing is written to `sessionStorage` or `localStorage`
- It also works in private windows, where browser storage can be blocked

---

## 17. Keyboard Shortcuts

The table lists the keys in the order of the `?` help panel.

| Key(s)                                 | Action                                      | Notes                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                                  | Close help, search or menu, then the viewer | Each press closes one thing. The shortcut panel goes first. While the search box has focus, `Esc` clears the query, then leaves search. An open ☰ menu closes next and focus returns to its button. Then the viewer closes |
| `Space` / `0`                          | Reset / Fit to screen                       | On a focused link inside the diagram, `Space` follows the link                                                                                                                                                              |
| `F`                                    | Open search                                 | On mobile, opens the search bar first                                                                                                                                                                                       |
| `T`                                    | Toggle text select (copy SVG labels)        | See [Text Select Mode](#11-text-select-mode)                                                                                                                                                                                |
| `R`                                    | Rotate 90° clockwise                        |                                                                                                                                                                                                                             |
| `M`                                    | Meeting mode (laser pointer)                | Press again to turn it off                                                                                                                                                                                                  |
| `L`                                    | Copy share link                             | Clipboard API on HTTPS or localhost, `execCommand('copy')` elsewhere                                                                                                                                                        |
| `+` / `=`                              | Zoom in                                     |                                                                                                                                                                                                                             |
| `-` / `_`                              | Zoom out                                    |                                                                                                                                                                                                                             |
| `↑` `↓` `←` `→`                        | Pan diagram                                 | 40 px at 100% zoom. The step grows with the zoom, so at 200% one press moves the diagram 80 px on screen. `naturalPanning` sets the direction                                                                               |
| `Shift` + `Arrows`                     | Fast pan                                    | 120 px at 100% zoom, and it grows with the zoom the same way                                                                                                                                                                |
| `?`                                    | Show or hide this help                      | Does nothing while you type in a text field, so `?` can go into a search. Needs `showKeyboardHelp: true`                                                                                                                    |
| `Ctrl`, `Cmd` or `Alt` + any other key | Ignored                                     | DiagView leaves the key to the browser, so shortcuts such as `Ctrl+F` keep working. `Esc` still works with a modifier held                                                                                                  |

Shortcuts are disabled when the modal is closed. While you type in a text field, such as the search box, all shortcuts except `Esc` are suspended. When a button, link, checkbox or the colour picker has focus, `Space` and `Enter` press it and every other shortcut still works. After `Esc` closes the ☰ menu, focus stays on the menu button, so `F` opens search straight away.

`Tab` also reaches the links inside the diagram, after the topbar and before the ☰ menu button, and `Enter` or `Space` follows the focused link. Chrome and Firefox draw an accent outline around it. Safari draws no outline on SVG links, so there the focused link shows no ring.

The `?` panel takes focus each time it opens and keeps `Tab` inside it. However it closes, focus goes back to where it was before.

`showKeyboardHelp` (default `true`) allows the `?` panel. `false` turns the panel off and hides the "Press ? for shortcuts" hint in the topbar. `DiagView.configure()` switches both at runtime.

`helpTimeout` (default `8000`) is the time in milliseconds before the `?` panel closes by itself, and `0` keeps it open until you close it.

```javascript
DiagView.init({ showKeyboardHelp: true, helpTimeout: 0 });
```

The hint shows in the topbar on screens 640 px wide or wider. To hide it and keep the `?` panel, add this rule to your stylesheet:

```css
#diagview-modal .diagview-shortcut-hint {
  display: none;
}
```

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

`configure()` calls `updateConfig()` internally and re-syncs the theme, Readable text colours, the canvas grid and branding visibility. It does not re-initialize diagrams.

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

`destroy()` returns every diagram to its pre-init state: wrappers and toolbars are removed, the `data-diagview-*` attributes DiagView added, the `dv-svg-content` class, inline styles, click handlers, error placeholders and the `--dv-*` variables on `<html>` are all cleared, in every layout and in shadow roots as well. A `style` or `class` attribute that DiagView added and then emptied is removed, so `<html>`, `<body>`, the diagram and its SVG get their original markup back. Attributes the page wrote itself stay, even empty ones. The next `init()` therefore applies its own options to all diagrams again. `destroy()` also resets the configuration to the defaults, the Canvas Theme to Auto and Text Colours to Original.

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

Live example: [React 18 + StrictMode demo](https://khadirullah.github.io/diagview/framework-react.html). It is a real React dev-build tree that mounts, unmounts, remounts and replaces diagrams, with an "unsafe pattern" toggle that shows the error the rule below prevents. `demo/framework-react.html` in the repo, verified by `tests/e2e/verify-react-strictmode.spec.mjs`.

> **The one rule:** keep the diagram element (the one matching `diagramSelector`) nested inside a container that your component renders and owns. With the `floating` and `header` layouts DiagView moves the diagram element into a wrapper so it can place the toolbar next to it. Your framework still believes the element sits where it rendered it, so if it later removes that exact element (unmount, conditional render, key change) the browser throws `NotFoundError: The node to be removed is not a child of this node`. Removing the outer container instead is always safe, because the wrapper is inside it and goes away with it.
>
> Do not re-render the diagram element itself with new content once DiagView has initialized it. Render a new one (inside the container) or call `DiagView.refresh()` after replacing the SVG.
>
> If you would rather DiagView never touch the DOM around your element, use `layout: "off"`. It attaches a click handler and nothing else. Fullscreen, zoom, search, minimap and export all still work; only the inline toolbar is dropped. Closing the viewer puts focus back on the diagram. Pair it with `DiagView.openFullscreen(el)` / `DiagView.exportDiagram(el, ...)` from your own buttons if you need them.
>
> **React StrictMode / hot reload:** the development-only destroy-then-init sequence is handled by `init()` itself, which queues behind an in-flight `destroy()`. You do not need to await either call in an effect.
>
> **Unmount vs detach:** unmounting a component removes its DOM, diagram included, in every layout; DiagView is not deleting anything, its toolbar just goes with the diagram. Call `destroy()` in the cleanup so handlers are released. To remove only the viewer and keep the diagram on the page, leave the component mounted and call `destroy()`; the diagram is returned to where your framework rendered it, and `init()` enhances it again.

### React with cleanup

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

### React without an inline toolbar (`layout: "off"`)

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

### React with SSR (Next.js)

```javascript
// Ensure DiagView only runs on the client
if (typeof window !== "undefined") {
  import("diagview").then(({ default: DiagView }) => {
    DiagView.init({ layout: "floating" });
  });
}
```

### Vue 3 Composition API

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

When one match sits inside another, such as a `.mermaid` inside a `.diagram`, only one of them gets a toolbar. If the outer element holds a single diagram, the outer one gets it, along with its `data-title` and `data-diagview-*` settings. If it holds two or more, each inner diagram gets its own toolbar and the outer element gets none. DiagView counts the `<svg>` elements inside to decide. `refresh()` and diagrams added later follow the same rule. A match without a toolbar keeps its place in the numbering, so share links (`dv-idx`) still open the same diagrams.

**Dark mode with Mermaid:**

```javascript
const isDark = document.documentElement.classList.contains("dark");
mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? "dark" : "default",
});
```

Mermaid fixes the theme when it draws, so a later theme switch leaves the diagrams as they were. To follow the switch, draw them again as shown in the [FAQ](FAQ.md#theming).

---

## 22. Advanced Configuration

### Button style

`ui.buttons.style` sets the look of the copy, download and fullscreen buttons next to each diagram. The header and floating layouts use the same styles.

| Style         | Look                                                     |
| ------------- | -------------------------------------------------------- |
| `accent`      | Accent-coloured icon with a thin accent border (default) |
| `solid`       | Accent background with a light or dark icon on top       |
| `neutral`     | Grey background with an icon in the page text colour     |
| `transparent` | Accent-coloured icon with no background and no border    |

```javascript
DiagView.init({ ui: { buttons: { style: "neutral" } } });
```

The built-in icons are outline drawings in the button colour.

### Custom button icons

You can replace any built-in icon with your own SVG string. DiagView draws a custom icon as written. Use `currentColor` for its fill or stroke to follow the button colour. An icon with no `fill` attribute on its `<svg>` element is filled with the button colour, so Material-style icons work as they are. The outline icon below sets `fill="none"` and a `currentColor` stroke:

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

Where one match sits inside another, each diagram still gets one toolbar. See [Mermaid Integration](#21-mermaid-integration) for which element gets it.

### Natural panning

By default, `ArrowUp` moves the diagram downward (camera moves up), the way a page scrolls. Set `naturalPanning: true` to make each arrow key move the diagram in the arrow's direction, so `ArrowUp` moves the diagram up.

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

`performance.largeFileThreshold` (default `1000000`) has no effect. DiagView still accepts it so older configs keep working.

### Animations

```javascript
DiagView.init({
  animateOpen: true,
  zoomAnimationDuration: 200,
  panAnimationDuration: 200,
});
```

- `animateOpen` (default `true`) fades the viewer in and grows it from 95% to full size over 0.3 seconds when it opens. With reduced motion on, the viewer opens without it.
- `zoomAnimationDuration` (default `200`) is how many milliseconds zoom in, zoom out and reset take to animate. `0` uses the default.
- `panAnimationDuration` (default `200`) is how many milliseconds one arrow key pan takes to animate. `0` uses the default.

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
3. Check the browser console, where errors from SVG validation appear
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

Auto-init ran before your `DiagView.init({...})`. This happens when your call comes after an `await` or from a framework effect. The warning then reads "Already initialized by auto-init, so these options were ignored". Add `data-diagview-no-auto-init` to the script tag or to `<html>`, or call `init()` synchronously after the library loads (see [Timing](#timing)).

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

- Check the network tab to see whether jsPDF loaded from the CDN
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

Search reads the text of every `<text>` element and of every element with the class `node`, `cluster`, `label` or `edgePath`, HTML labels inside them included. It finds nothing in these cases:

- The label is HTML in a `<foreignObject>` with none of those classes on it or around it. Add `class="label"` to the `<foreignObject>` or to a group that holds it.
- The text is drawn as paths, as when an editor converts text to outlines, or it is part of an embedded image.
- The query runs across a line break. Each line can be its own `<text>` element, and a `<br>` in an HTML label adds no space between the lines. Search for words from one line.

### Share link not working

- On HTTPS or `localhost` the link is copied with the Clipboard API; elsewhere DiagView falls back to `document.execCommand('copy')`
- DiagView removes the `dv-*` parameters from the address bar once it has read the link, even when the link matches no diagram. Check that `dv-idx` points at a diagram that exists on the page (see [Share Links](#8-share-links))

### Mobile controls drift when pinch-zooming

No setting is needed. When the modal opens, DiagView syncs its UI to the visual viewport and keeps it in sync while the browser is pinch-zoomed. If you still see drift, please open an issue with the device and browser version.

### "Double Prefixing" on SVG IDs

DiagView never mutates your original SVG's IDs. ID namespacing only happens on the internal clone used in the fullscreen modal. If you see IDs changing on the host page, please open an issue.

---

## 25. Watermark

DiagView can automatically inject a watermark into your diagrams when they are downloaded or exported. This is a "silent" feature. The watermark never shows in the viewer on your website, only on the saved image.

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

| Option      | Type    | Default          | Description                                                                                                                               |
| ----------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | boolean | `false`          | Whether to inject branding on export/download                                                                                             |
| `text`      | string  | `""`             | The branding text (e.g. your domain or name)                                                                                              |
| `style`     | string  | `"corner"`       | `corner` \| `background` (PowerPoint style) \| `both`                                                                                     |
| `position`  | string  | `"bottom-right"` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` \| `center` \| `four-sides`. `four-sides` needs the `corner` or `both` style |
| `placement` | string  | `"diagram"`      | `diagram` \| `margin`. Where corner and side text goes. See [Placement](#placement)                                                       |
| `opacity`   | number  | `0.2`            | Transparency level (0.0 to 1.0)                                                                                                           |

### Values DiagView does not know

Export checks `style`, `position`, `placement` and `opacity` each time it draws the watermark, from the config and from the `data-diagview-watermark-*` attributes. Case and spaces around the value do not matter at runtime, so `"Corner"` and `"TOP-LEFT"` work. A mistake never removes the watermark. DiagView draws it with the fallback below and logs a console warning that names the value it used.

| Option      | Valid values                                                                   | Missing or empty           | Anything else                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`     | `corner`, `background`, `both`                                                 | `corner`, no warning       | `corner`, with a warning                                                                                                                             |
| `position`  | `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`, `four-sides` | `bottom-right`, no warning | `bottom-right`, with a warning                                                                                                                       |
| `placement` | `diagram`, `margin`                                                            | `diagram`, no warning      | `diagram`, with a warning                                                                                                                            |
| `opacity`   | A number from 0 to 1, such as `0.2` or `"0.2"`                                 | `0.2`, no warning          | Below 0 uses 0 and above 1 uses 1. Anything that is not a number uses 0.2 in the config, and the config opacity in an attribute. Each logs a warning |

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

### Placement

`placement` decides where the small corner and side text goes. It applies to the `corner` style, to the small text of `both`, and to `four-sides`.

- `"diagram"` (the default) draws the text on the diagram, just inside its edge. Nobody can crop it off without cutting into the diagram. It can cover a shape that sits close to the edge.
- `"margin"` draws the text in the blank margin that every export adds around the diagram. It never covers a shape. A crop to the diagram's edge removes it.

Pick `"margin"` when a clean diagram matters more than a mark that is hard to remove. In the margin, corner text lines up with the diagram's left or right edge, and four-sides text sits in the middle of each side.

```javascript
DiagView.init({
  watermark: {
    enabled: true,
    text: "khadirullah.com",
    position: "four-sides",
    placement: "margin",
  },
});
```

The large centred mark of `background`, `both` and `position: "center"` always stays on the diagram, whatever the placement. To set it for one diagram, use `data-diagview-watermark-placement="margin"` or `"diagram"`.

### File Size Note

Adding watermarks increases the complexity of the exported image. While the impact is minimal for most diagrams, using the `both` style or `four-sides` position will slightly increase the final file size of your exported PNG, SVG, or PDF files.

### Visibility Optimization

DiagView uses a "Contrast Stroke" technique to ensure your watermark is visible on any background. If your diagram has light yellow boxes (like Mermaid charts) or dark nodes, the watermark will remain legible by using a subtle outline of the opposite color.
