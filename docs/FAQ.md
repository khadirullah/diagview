# DiagView — Frequently Asked Questions

---

## General

**Q: Is DiagView free?**  
A: Yes. DiagView is MIT licensed — free for personal and commercial use with no attribution required (though it is appreciated).

**Q: What does DiagView require?**  
A: Only `@panzoom/panzoom` for the fullscreen zoom/pan feature. All other heavy features (search, minimap, share, PDF export) are lazy-loaded on demand.

**Q: Which diagram libraries does DiagView support?**  
A: Any library that outputs SVG into the DOM — including Mermaid.js, D3.js, Graphviz, PlantUML (rendered), Kroki, and hand-crafted SVGs. See [Mermaid Integration](USAGE.md#21-mermaid-integration).

**Q: Does it work without npm?**  
A: Yes. Drop in two `<script>` tags from a CDN and you are done. See [Installation](USAGE.md#1-installation).

---

## Installation

**Q: Why doesn't zoom work?**  
A: The `@panzoom/panzoom` script must be loaded **before** DiagView. If it is missing, DiagView prints "Panzoom library not found" in the console and gracefully degrades — exports still work, but zoom/pan are disabled.

**Q: Can I use Panzoom from npm instead of CDN?**  
A: Yes. `npm install @panzoom/panzoom` and import it normally. DiagView uses `window.Panzoom` at runtime; bundlers that expose globals (e.g. Vite with `define`) will wire it up automatically. Otherwise ensure `window.Panzoom = Panzoom` is set before `DiagView.init()`.

**Q: Does DiagView inject CSS into `<head>` automatically?**  
A: Yes. Styles are injected once into a `<style id="diagview-styles">` tag when `init()` is called, and removed by `destroy()`. `initShadowRoot()` installs the same stylesheet inside the shadow root, and `destroy()` removes that copy too.

---

**Q: I call `init({...})` from a `type="module"` script and get "Already initialized"; my options are ignored.**  
A: Auto-init is deferred one task after the library loads, so an `init()` that runs synchronously in your module wins. The warning means your call ran later, after an `await` or inside a framework effect. Add `data-diagview-auto-init="false"` to the library script tag in that case.

---

## Layout & UI

**Q: How do I hide the controls?**  
A: Use `layout: 'off'`. Clicking the diagram opens fullscreen.

**Q: How do I make controls always visible on desktop?**  
A: Use `layout: 'header'`.

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

Pass `null` to restore a built-in icon.

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

---

## Export

**Q: My exports are blurry. How do I fix this?**  
A: Increase `highResScale`:

```javascript
DiagView.init({ highResScale: 8 }); // 8× the SVG's intrinsic size
```

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
A: The Clipboard API requires HTTPS or `localhost`. On plain HTTP, DiagView falls back to `document.execCommand('copy')`. If the browser denies the write (Safari does once the click that started the export is over) or both paths fail, the PNG is downloaded instead and the toast says so.

**Q: I'm hitting the export size limit. How do I increase it?**

```javascript
DiagView.init({
  maxPixels: 67108864, // 64MP
  // Warning: very large canvases can crash mobile browsers
});
```

---

## SVG Sanitization

**Q: Can I turn off sanitization for a trusted SVG?**

Globally:

```javascript
DiagView.init({ security: { mode: "off" } });
```

Per-element (requires `security.allowOverrides: true`, the default):

```html
<div class="diagram" data-diagview-sanitize="off">...</div>
```

**Q: My SVG has CSS animations that get stripped. Why?**  
A: `strict` mode removes `<animate>`, `<animateTransform>`, `<set>`, and similar elements as they are known XSS vectors. Switch to `permissive` for the affected diagram:

```html
<div class="diagram" data-diagview-sanitize="permissive">
  <svg><!-- animated diagram --></svg>
</div>
```

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
A: The minimap is intentionally hidden on viewports narrower than 768 px to preserve screen real estate.

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

Or override manually: `DiagView.init({ accentColor: '#60a5fa', backgroundColor: '#0f172a' })`.

**Q: My brand color doesn't apply inside the diagram itself.**  
A: DiagView applies the accent color to the UI chrome (buttons, minimap, highlights), not to the SVG content itself. To style SVG internals, use your own CSS.

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
A: DiagView watermarks are "Silent." They are designed to keep your website clean and professional. They only appear on the exported file (PNG, JPEG, SVG, or PDF) to ensure your work is attributed when shared.

**Q: Does adding a watermark affect image quality?**  
A: No. DiagView renders watermarks using native SVG vectors, ensuring they are crystal clear at any resolution.

**Q: Will a long brand name overlap my diagram?**  
A: No. DiagView uses a "Safe-Fit" scaling engine. It automatically calculates the available space and reduces the font size until your brand fits perfectly within the diagram boundaries.

**Q: What if my diagram has a yellow or dark background?**  
A: DiagView is "Contrast-Aware." It automatically adds a subtle outline (stroke) to the text in a contrasting color (e.g., white text on dark nodes) to ensure your brand is always legible.

**Q: Does "four-sides" put text on all 4 corners?**  
A: No, it puts them on the center of each edge (Top, Bottom, Left, Right) to maximize visibility while preventing the diagram from looking cluttered.

---

## Contributing

**Q: Where do I report bugs?**  
A: [GitHub Issues](https://github.com/khadirullah/diagview/issues). Include browser, OS, DiagView version, and a minimal reproduction.

**Q: How do I request a feature?**  
A: Open a GitHub Issue titled `[Feature] My request`. Describe the problem it solves and your proposed solution.
