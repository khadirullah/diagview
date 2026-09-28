# DiagView — Frequently Asked Questions

---

## General

**Q: Is DiagView free?**  
A: Yes. DiagView is MIT licensed — free for personal and commercial use with no attribution required (though it is appreciated).

**Q: What does DiagView require?**  
A: Only `@panzoom/panzoom` for the fullscreen zoom/pan feature. PDF export loads jsPDF from a CDN the first time it runs. In the ESM build, search, the minimap, rotation, meeting mode and Readable text load on first use. The UMD build carries them all in one file.

**Q: Which diagram libraries does DiagView support?**  
A: Any library that outputs SVG into the DOM — including Mermaid.js, D3.js, Graphviz, PlantUML (rendered), Kroki, draw.io, and hand-crafted SVGs. See [Mermaid Integration](USAGE.md#21-mermaid-integration).

**Q: Does it work without npm?**  
A: Yes. Drop in two `<script>` tags from a CDN and you are done. See [Installation](USAGE.md#1-installation).

---

## Installation

**Q: Why doesn't zoom work?**  
A: DiagView could not find `window.Panzoom` when the viewer opened. It checks each time fullscreen opens, so script order does not matter. If you use share links, Panzoom must exist before `init()` runs, because a share link opens the viewer right after `init()`. When Panzoom is missing, the console logs "Panzoom library not found" and a toast says "Zoom/pan requires Panzoom library". Export still works. Zoom, pan, the minimap and most keyboard shortcuts do not. With npm, set `window.Panzoom = Panzoom` as shown in the [README](../README.md#npm).

**Q: Can I use Panzoom from npm instead of CDN?**  
A: Yes. Run `npm install @panzoom/panzoom`, then import it and assign it in your entry file with `window.Panzoom = Panzoom`. DiagView does not import Panzoom itself and only reads `window.Panzoom`, so no bundler setting does this for you.

**Q: Does DiagView inject CSS into `<head>` automatically?**  
A: Yes. Styles are injected once into a `<style id="diagview-styles">` tag when `init()` is called, and removed by `destroy()`. `initShadowRoot()` installs the same stylesheet inside the shadow root, and `destroy()` removes that copy too.

---

**Q: I call `init({...})` from a `type="module"` script and get "Already initialized"; my options are ignored.**  
A: Auto-init is deferred one task after the library loads, so an `init()` that runs synchronously in your module wins. The warning means your call ran later, after an `await` or inside a framework effect. Add `data-diagview-no-auto-init` in that case, on the library script tag, your own script tag or `<html>`. A bundled app has no library script tag, so use `<html>`. Do not use `data-diagview-auto-init`, which forces auto-init whatever its value.

---

## Layout & UI

**Q: How do I hide the controls?**  
A: Use `layout: 'off'`. Clicking the diagram opens fullscreen.

**Q: How do I make controls always visible on desktop?**  
A: There is no option for this. With a mouse or trackpad, DiagView shows the inline controls on hover or keyboard focus. On touch screens they are always shown. To keep them visible everywhere, add this CSS. It works for the header and floating layouts:

```css
.diagview-wrapper .diagview-controls {
  opacity: 1;
  pointer-events: auto;
  transform: none;
}
```

**Q: How do I hide the "DiagView" branding link?**

```javascript
DiagView.init({ showBranding: false });
// or at runtime:
DiagView.configure({ showBranding: false });
```

**Q: How do I mix layouts on one page?**  
A: Use `data-diagview-layout` on individual diagram containers and call `init()` without specifying a global layout (or set a sensible default):

```html
<div class="diagram" data-diagview-layout="header">...</div>
<div class="diagram" data-diagview-layout="off">...</div>
```

**Q: Can I use custom icons for the buttons?**

```javascript
DiagView.init({
  ui: { buttons: { icons: { copy: "<svg>...</svg>" } } },
});
```

Pass `null` to restore a built-in icon. DiagView draws a custom icon as written, so use `currentColor` for its fill or stroke to follow the button colour. See [Custom button icons](USAGE.md#custom-button-icons).

---

## Search

**Q: Why does search not highlight anything?**  
A: Search matches text inside `.node`, `.cluster`, `.label`, `.edgePath`, and `text` elements. Ensure your SVG has actual `<text>` nodes with visible content.

**Q: Can I pre-fill the search when opening fullscreen?**

```javascript
DiagView.openFullscreen(element, { searchQuery: "my term" });
```

**Q: Is search case-sensitive?**  
A: No. All queries and node text are lowercased before comparison.

**Q: Does search work on draw.io diagrams?**  
A: Yes. draw.io keeps a `<text>` copy of each label that the browser never draws. Search matches the HTML label you see and outlines the box under it.

---

## Export

**Q: My exports are blurry. How do I fix this?**  
A: Increase `highResScale`:

```javascript
DiagView.init({ highResScale: 8 }); // 8× the SVG's intrinsic size
```

On touch devices and screens up to 768 px wide, `mobileScale` (default 2) applies instead. DiagView also lowers the scale when the canvas would exceed `maxPixels`.

**Q: Can I export a specific diagram from code without opening fullscreen?**

```javascript
await DiagView.exportToPNG(document.querySelector(".diagram"));
```

Per-diagram `data-diagview-scale` and watermark attributes on the element are honoured. If the element contains no `<svg>`, the call resolves and shows a "No diagram found" toast.

**Q: PDF export shows "PDF engine unavailable" and falls back to PNG. Why?**  
A: jsPDF failed to load from CDN. Check the network tab for a blocked request. If behind a CSP, host jsPDF locally:

```javascript
DiagView.init({
  pdfLibraryUrl: "/vendor/jspdf.umd.min.js",
  pdfLibraryIntegrity: null,
});
```

**Q: Why does JPEG export produce a PNG instead?**  
A: When `transparent: true` is passed to JPEG export, DiagView automatically switches to transparent PNG (JPEG does not support transparency) and shows a warning toast.

**Q: Clipboard copy fails on my site. Why?**  
A: Copying an image needs the Clipboard API, which browsers only offer on HTTPS or `localhost`. Without it, or if the browser denies the write (Safari does once the click that started the export is over), DiagView downloads the PNG instead and the toast says so. "Copy SVG" in the fullscreen menu copies text, and on plain HTTP it falls back to `document.execCommand('copy')`. If the browser refuses that copy or denies the write, DiagView downloads the .svg file instead.

**Q: Why does my export show dimmed nodes and an outline?**  
A: You exported during a search, and the export shows what the viewer shows. Set `exportSearchHighlight: false` to export the plain diagram while the viewer keeps its search:

```javascript
DiagView.configure({ exportSearchHighlight: false });
```

**Q: Why does an exported label look cut off or use another font?**  
A: DiagView could not embed the page font, so the exported file falls back to a font installed on the viewer's computer. That font can be wider than the label's box, and "Mermaid" turns into "Mermaic". The usual cause is a font stylesheet on another origin, such as Google Fonts. The browser hides its rules from scripts unless the `<link>` has `crossorigin="anonymous"`, and DiagView logs a console warning that names the stylesheet. Add the attribute:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
  rel="stylesheet"
  crossorigin="anonymous"
/>
```

`exportFonts` sets which fonts go into the file. `"used"` (the default) embeds only the font files the labels use. `"all"` embeds every `@font-face` rule on the page, which can make an SVG ten times larger. `"none"` embeds no fonts. Use it when a font's licence does not allow embedding, which is common with paid fonts. The file then names the font, and viewers without it see a fallback.

**Q: I'm hitting the export size limit. How do I increase it?**

```javascript
DiagView.init({
  maxPixels: 67108864, // 64MP
  // Warning: very large canvases can crash mobile browsers
});
```

**Q: PNG, JPEG, WebP, PDF or Copy Image fails with "SVG may be too large" on a huge diagram. Why?**  
A: To draw a diagram onto the image, DiagView first loads the SVG as a `data:` URL, which can be up to 3 times the size of the SVG markup. Browsers cap how long a `data:` URL can be. Some Firefox versions refuse any over 32 MB, so there a diagram with more than about 10 MB of markup can hit the limit. When the `data:` URL fails, DiagView retries with a `blob:` URL. If that also fails, the export stops with an error notice. SVG export and Copy SVG Code do not load the SVG as an image, so they still work at any size up to `performance.criticalFileLimit`.

---

## SVG Sanitization

**Q: Why did my animation or click stop working in fullscreen?**  
A: The fullscreen view and exports show a sanitized copy of your diagram, and the diagram on the page stays as it is. The default `strict` mode removes SMIL animations such as `<animate>` and `<animateTransform>`, and every mode except `off` removes `onclick` and other event handlers and `javascript:` links. When DiagView removes code, the console shows a warning that names the diagram and what went. For your own animated diagram, use `permissive`. For your own diagram whose click handlers you need, use `off`:

```html
<div class="diagram" data-diagview-sanitize="permissive">...</div>
<div class="diagram" data-diagview-sanitize="off">...</div>
```

Keep `strict` for diagrams other people can write. See [Choosing a mode](USAGE.md#choosing-a-mode).

**Q: Can I turn off sanitization for a trusted SVG?**

Globally:

```javascript
DiagView.init({ security: { mode: "off" } });
```

Per-element (requires `security.allowOverrides: true`, the default):

```html
<div class="diagram" data-diagview-sanitize="off">...</div>
```

Add `exportMode: "strict"` to keep click handlers in fullscreen but clean every downloaded or copied file. See [Choosing a mode](USAGE.md#choosing-a-mode).

```javascript
DiagView.init({ security: { mode: "off", exportMode: "strict" } });
```

**Q: My SVG animations (`<animate>`, `<animateTransform>`, `<set>`) get stripped. Why?**  
A: `strict` mode removes `<animate>`, `<animateTransform>`, `<set>`, and similar elements as they are known XSS vectors. Switch to `permissive` for the affected diagram:

```html
<div class="diagram" data-diagview-sanitize="permissive">
  <svg><!-- animated diagram --></svg>
</div>
```

CSS `@keyframes` animations in a `<style>` block are kept. `strict` removes the block only if it contains script patterns, `@import` or a remote `url()`.

`permissive` still drops animations whose `attributeName` is `href`/`xlink:href` or an `on*` handler, because those can be used to inject a script.

**Q: I want to use Google Fonts embedded in my SVG's `<style>` block. How?**

```html
<div class="diagram" data-diagview-allow-remote="true">...</div>
```

Or globally: `DiagView.init({ security: { allowRemoteResources: true } })`.

**Q: Does sanitization affect the original SVG on the page?**  
A: No. DiagView clones the SVG before sanitizing. The original DOM element is never mutated.

---

## Mobile

**Q: Controls drift when I pinch-zoom in the browser.**  
A: This is handled automatically. When the modal opens, DiagView syncs its controls to the visual viewport and keeps them aligned while the page is pinch-zoomed. No option is required; if you still see drift, please open an issue with the device and browser version.

**Q: The minimap doesn't appear on my phone.**  
A: The minimap is intentionally hidden on viewports 768 px wide or narrower to preserve screen real estate.

**Q: Why does the diagram stutter or zoom wildly in Firefox Mobile after a 3-finger screenshot?**  
A: This is a known browser-level limitation in Firefox Mobile (Gecko engine) on Android devices with system-level gestures (like 3-finger screenshots). When a system gesture is triggered, the browser enters a "Decision State" where it briefly blocks all touch events to the script. This can cause the internal pointer state to become desynchronized. DiagView includes "Safe-Recovery" logic to stabilize this, but you may still experience a momentary "stutter" as the browser hands control back to the viewer. For the most fluid multi-touch experience, Chromium-based browsers (Brave, Chrome) are recommended.

---

## Frameworks

**Q: React throws `NotFoundError: The node to be removed is not a child of this node` when my component unmounts.**  
A: With the `floating` or `header` layout, DiagView moves the diagram element into a wrapper to place the toolbar. If React later removes that exact element, it is no longer where React left it. Nest the diagram element inside a container div that your component renders, so React removes the container instead. Or use `layout: "off"`, which never touches the surrounding DOM. See USAGE.md § Framework Integration.

**Q: In development, DiagView stops working after the first render (React StrictMode / hot reload).**  
A: `init()` queues behind an in-flight `destroy()`, which is the sequence StrictMode produces, so the `useEffect` cleanup-then-setup cycle needs no special handling. Call `destroy()` in the cleanup and `init()` in the effect body, as shown in [USAGE](USAGE.md#20-framework-integration).

**Q: The whole diagram disappears when my component unmounts. Is DiagView removing it?**  
A: No. Unmounting is your framework deleting the component and every DOM node it rendered, the diagram included; that is what unmount means in every layout, `off` too. DiagView's toolbar leaves only because the diagram it was attached to is gone. Call `destroy()` in the cleanup so DiagView releases its handlers. If you want the diagram to stay and only the viewer to go, keep the component mounted and call `destroy()` on its own; the diagram is put back where your framework left it as plain SVG, and `init()` enhances it again. The [React demo](https://khadirullah.github.io/diagview/framework-react.html) has "Unmount" and "Detach" buttons that show the two side by side.

---

## Theming

**Q: Colors look wrong in dark mode.**  
A: Ensure your HTML signals dark mode via one of:

- `<html class="dark">` (Tailwind)
- `<html data-theme="dark">`
- `<html data-bs-theme="dark">` (Bootstrap)

Or override manually: `DiagView.init({ backgroundColor: '#0f172a', textColor: '#e2e8f0' })`.

**Q: My brand color doesn't apply inside the diagram itself.**  
A: DiagView applies the accent color to the UI chrome (buttons and minimap), not to the SVG content itself. To style SVG internals, use your own CSS. For Mermaid, draw the diagrams again with your colors, as the [next answer](#theming) shows.

**Q: How do I make Mermaid diagrams follow my site's theme or accent color?**  
A: Draw them again. Mermaid writes its colors into the SVG when it draws, and DiagView shows that SVG as it is. The Canvas Theme in the viewer only changes the background behind the diagram, and `accentColor` only colors DiagView's own controls. Neither redraws the diagram. When the site changes theme or accent, take DiagView down, put back each diagram's Mermaid source, draw it with the new settings and start DiagView again.

This example assumes the toggle sets a `dark` class and an `--accent` variable on `<html>`. Load DiagView with `data-diagview-no-auto-init` and run the script after the diagrams in the page.

```javascript
const blocks = [...document.querySelectorAll(".mermaid")];
const sources = blocks.map((el) => el.textContent);
const options = { diagramSelector: ".mermaid" };
let drawn = "";

async function drawDiagrams() {
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#2563eb";
  drawn = `${dark} ${accent}`;
  blocks.forEach((el, i) => {
    el.removeAttribute("data-processed");
    el.textContent = sources[i];
  });
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    themeCSS: `.node rect, .node polygon { stroke: ${accent}; stroke-width: 2px; }`,
  });
  await mermaid.run({ nodes: blocks });
}

let queue = drawDiagrams().then(() => DiagView.init(options));

new MutationObserver(() => {
  queue = queue.then(async () => {
    // Skip changes that leave the theme and accent as they were
    const root = document.documentElement;
    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#2563eb";
    if (`${root.classList.contains("dark")} ${accent}` === drawn) return;
    await DiagView.destroy();
    await drawDiagrams();
    await DiagView.init(options);
  });
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
```

The minimap and exports show the redrawn colors.

**Q: How do I change the accent color?**  
A: Pass `accentColor` to `init()`, or call `DiagView.configure({ accentColor: "#f59e0b" })` to change it later. Without `accentColor`, DiagView uses `--diagram-accent` if it holds a colour, then its built-in blue. It does not read the site's `--primary` or `--accent-color`. It reads the page variables again when the `class`, `data-theme` or `style` attribute of `<html>` or `<body>` changes, so a theme or accent switcher that sets them applies at once. An `accentColor` in the config always wins over the page variables.

**Q: My diagram text is hard to read on a dark canvas.**  
A: The canvas theme changes only the background, and the diagram keeps its author's colors. In the fullscreen menu, pick "Readable" under "Text Colours". DiagView then recolors only the text that is hard to read and keeps its hue. Exports with a background get the same recolored text. Transparent exports and Copy SVG keep the original colors. With Readable off, an export warns once when some labels will be hard to read on its background. See [Text Colours](USAGE.md#text-colours).

**Q: Which text colour does the viewer use on a custom canvas colour?**  
A: Without `textColor` or `--diagram-text`, the toolbar and menu use `#1e293b` or `#f1f5f9`, whichever has more contrast on the canvas. On a mid-grey canvas where neither reaches 4.5:1, they use black or white. A `textColor` or `--diagram-text` that falls under 4.5:1 also turns black or white, whichever has more contrast. The diagram keeps its own colours. See [WCAG contrast enforcement](USAGE.md#wcag-contrast-enforcement).

---

## Share Links

**Q: The share link doesn't open the right diagram.**  
A: Share links use the diagram's **index** on the page (`dv-idx`). If the page structure changes between the link being generated and opened, the index may not match. This is a known limitation for highly dynamic pages.

**Q: I see `dv-*` parameters in my URL bar.**  
A: They are automatically stripped after DiagView processes them using `history.replaceState`. If you see them persisting, check that `history.replaceState` is not blocked by your app's router.

---

## Performance

**Q: Does DiagView slow down pages with many diagrams?**  
A: No. DiagView uses an `IntersectionObserver` to initialize diagrams lazily — only when they are 200 px from the viewport. Diagrams off-screen consume almost no resources.

**Q: Search is slow on a large diagram.**  
A: Search pre-warms its candidate cache during browser idle time. On very large diagrams (5,000+ nodes), the first search may take a moment. Subsequent searches use the cache and are O(n) string comparisons with no DOM reads.

---

## Shadow DOM

**Q: Diagrams inside a Shadow DOM are not found.**

```javascript
DiagView.init(); // initialize globally first
DiagView.initShadowRoot(myShadowRoot); // then scan the shadow root
```

The stylesheet is installed inside the root so the inline toolbar renders correctly, and shadow diagrams are numbered after the document's diagrams for share links.

---

## Branding & Watermarking

**Q: Why don't I see the watermark in the viewer?**  
A: DiagView watermarks are "Silent." They are designed to keep your website clean and professional. They only appear on the exported file (PNG, JPEG, WebP, SVG, or PDF), on copied images and in copied SVG markup to ensure your work is attributed when shared.

**Q: Does adding a watermark affect image quality?**  
A: No. DiagView renders watermarks using native SVG vectors, ensuring they are crystal clear at any resolution.

**Q: Will a long brand name overlap my diagram?**  
A: No. DiagView uses a "Safe-Fit" scaling engine. It automatically calculates the available space and reduces the font size until your brand fits perfectly within the diagram boundaries.

**Q: My watermark covers part of my diagram. How do I move it off?**
A: Set `watermark.placement` to `"margin"`, or add `data-diagview-watermark-placement="margin"` to that diagram. The corner and side text then goes in the blank margin around the diagram and never covers a shape. The trade-off is that a crop to the diagram's edge removes it. The default, `"diagram"`, keeps the text on the diagram, where nobody can crop it off without cutting the diagram. The large centred mark of the `background` and `both` styles stays on the diagram either way. See [Placement](USAGE.md#placement).

**Q: What if my diagram has a yellow or dark background?**  
A: The watermark text has a thin outline in the opposite color. It is black with a white outline on a light theme and white with a black outline on a dark theme, so it stays legible on light and dark fills.

**Q: Does "four-sides" put text on all 4 corners?**  
A: No, it puts them on the center of each edge (Top, Bottom, Left, Right) to maximize visibility while preventing the diagram from looking cluttered.

---

## Contributing

**Q: Where do I report bugs?**  
A: [GitHub Issues](https://github.com/khadirullah/diagview/issues). Include browser, OS, DiagView version, and a minimal reproduction.

**Q: How do I request a feature?**  
A: Open a GitHub issue with the Feature request template. Its title starts with `[FEATURE]`. Describe the problem it solves and the solution you have in mind.
