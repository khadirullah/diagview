# DiagView FAQ

Frequently Asked Questions

---

## General

### Q: Is DiagView free?

**A:** Yes! DiagView is MIT licensed - free for personal and commercial use.

### Q: Do I need to install anything?

**A:** Just DiagView! Panzoom is optional (for zoom/pan) and can be loaded via CDN.

### Q: What browsers are supported?

**A:** All modern browsers (Chrome, Firefox, Safari, Edge). IE11 is NOT supported.

### Q: Can I use this with Mermaid/D3/PlantUML?

**A:** Yes! DiagView works with ANY SVG-based diagram library.

---

## Installation

### Q: How do I install via CDN?
```html
<script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.0/dist/panzoom.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/diagview@1.0.0/dist/diagview.umd.min.js"></script>
```

### Q: How do I install via npm?
```bash
npm install diagview @panzoom/panzoom
```

### Q: Do I need Panzoom?

**A:** No, but recommended! Without it, zoom/pan won't work (exports still work).

---

## Usage

### Q: How do I change button colors?
```javascript
DiagView.init({
  accentColor: '#ff6b6b'
});
```

### Q: How do I hide buttons?
```javascript
DiagView.init({
  layout: 'off'  // Click diagram to fullscreen
});
```

### Q: Can I customize which diagrams are enhanced?
```javascript
DiagView.init({
  diagramSelector: '.my-custom-class'
});
```

### Q: How do I disable keyboard shortcuts?

Keyboard shortcuts only work when fullscreen modal is open. You cannot disable them globally, but you can close the modal with `Esc`.

---

## Export

### Q: Why are my exports low resolution?

Increase export scale:
```javascript
DiagView.init({
  highResScale: 8  // Higher = better quality (1-10)
});
```

### Q: Can I export without opening fullscreen?

Yes:
```javascript
const diagram = document.querySelector('.diagram');
DiagView.exportDiagram(diagram, 'png');
```

### Q: PDF export not working?

1. Check if jsPDF loads (network tab)
2. Override CDN URL if needed:
```javascript
DiagView.init({
  pdfLibraryUrl: 'https://your-cdn.com/jspdf.min.js'
});
```

### Q: Clipboard copy not working?

Clipboard requires HTTPS or localhost. Use download instead on HTTP sites.

---

## Theming

### Q: How do I force dark mode?
```javascript
DiagView.init({
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff',
  accentColor: '#60a5fa'
});
```

### Q: Colors look wrong in dark mode?

DiagView auto-detects theme. Ensure your HTML has:
```html
<html class="dark">  <!-- Tailwind -->
<!-- OR -->
<html data-theme="dark">  <!-- Custom -->
```

### Q: Can I use custom CSS variables?

Yes! DiagView checks these:
- `--diagram-accent`
- `--diagram-text`
- `--background` / `--bg-color`
- `--text-color` / `--foreground`

---

## Performance

### Q: Does it work with 100+ diagrams on one page?

Yes! Diagrams are enhanced lazily (only when they appear).

### Q: Is search fast?

Yes! Search uses caching + dirty checking + RAF batching for 2500+ nodes.

### Q: Does it affect page load time?

Minimal! Lazy features load on-demand (search, minimap, meeting mode, etc.).

---

## Features

### Q: How do I enable "Remember Zoom"?
```javascript
DiagView.init({
  rememberZoom: true  // Remembers zoom per diagram (session-based)
});
```

### Q: Can I disable the minimap?

Minimap only shows when diagram is larger than viewport. It auto-hides for small diagrams.

### Q: How do I change auto-close time for keyboard help?
```javascript
DiagView.init({
  helpTimeout: 5000  // 5 seconds (0 = never auto-close)
});
```

---

## Troubleshooting

### Q: Buttons not showing?

1. Check layout: `layout: 'floating'` (default)
2. On desktop, hover over diagram
3. On mobile, buttons always visible

### Q: Search not highlighting anything?

Search looks for text in nodes. Ensure your SVG has `<text>` elements.

### Q: Rotation not working?

Rotation only works in fullscreen mode. Press `R` or click "Rotate 90°" in menu.

### Q: Share link not copying?

1. Requires HTTPS or localhost
2. Check browser clipboard permissions
3. Fallback: uses `document.execCommand` on HTTP

---

## Advanced

### Q: Can I use custom icons?

Yes:
```javascript
DiagView.init({
  ui: {
    buttons: {
      icons: {
        copy: '<svg>...</svg>',
        download: '<svg>...</svg>',
        fullscreen: '<svg>...</svg>'
      }
    }
  }
});
```

### Q: How do I prevent export on certain diagrams?

Use `layout: 'off'` and override per diagram:
```html
<div class="diagram" data-diagview-layout="header">
  <svg>...</svg>
</div>
```
(Note: Per-diagram config not implemented yet - feature request!)

### Q: Can I export from code without UI?

Yes:
```javascript
import { exportDiagram } from 'diagview';

const element = document.querySelector('.diagram');
exportDiagram(element, 'png');
```

---

## Integration

### Q: Does it work with React/Vue/Svelte?

Yes! See [USAGE.md](./USAGE.md#framework-integration)

### Q: Does it work with static site generators?

Yes! Works with:
- Hugo
- Jekyll
- 11ty
- Gatsby
- Next.js (SSR mode)
- Astro

### Q: Does it work with Markdown?

Yes! If your Markdown processor outputs diagrams with `.diagram` class or `[data-diagram]` attribute.

---

## Licensing

### Q: Can I use this commercially?

Yes! MIT license allows commercial use.

### Q: Do I need to credit you?

Not required, but appreciated! 😊

### Q: Can I modify the code?

Yes! MIT license allows modification.

---

## Support

### Q: Where do I report bugs?

GitHub Issues: https://github.com/khadirullah/diagview/issues

### Q: How do I request features?

Open a GitHub Issue with `[Feature Request]` prefix.

### Q: Is there a Discord/Slack?

Not yet! For now, use GitHub Discussions.

---

## Still have questions?

- 📖 [Read Usage Guide](./USAGE.md)
- 💻 [Browse Examples](../examples/)
- 🐛 [Report Issue](https://github.com/khadirullah/diagview/issues)
