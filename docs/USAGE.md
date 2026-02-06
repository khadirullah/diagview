# DiagView Usage Guide

Complete guide to using DiagView in your projects.

## 📦 Installation

### Via CDN (Quickest)
```html
<!-- Add Panzoom (optional, for zoom/pan) -->
<script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.0/dist/panzoom.min.js"></script>

<script src="https://cdn.jsdelivr.net/npm/diagview@1.0.0/dist/diagview.umd.min.js"></script>

<script>
  // Auto-initializes if you have .diagram, .chart, or [data-diagram] elements
  // Or manually initialize:
  DiagView.init();
</script>
```

### Via NPM
```bash
npm install diagview @panzoom/panzoom
```
```javascript
import DiagView from 'diagview';

DiagView.init();
```

---

## 🚀 Quick Start

### 1. Basic HTML Setup
```html
<!-- Your diagram container -->
<div class="diagram">
  <svg width="800" height="600">
    <!-- Your SVG content -->
  </svg>
</div>

<!-- DiagView will automatically enhance it with buttons -->
```

### 2. JavaScript Initialization
```javascript
// Auto-init (default)
DiagView.init();

// With custom options
DiagView.init({
  layout: 'floating',           // 'header', 'floating', or 'off'
  accentColor: '#3b82f6',      // Your brand color
  showKeyboardHelp: true,       // Show keyboard shortcuts
  highResScale: 6,              // Export resolution (1-10)
});
```

---

## 🎨 Layout Modes

### Header Layout (Classic)
```javascript
DiagView.init({
  layout: 'header'
});
```

**Result:** Title bar at top with buttons always visible.

### Floating Layout (Modern - Default)
```javascript
DiagView.init({
  layout: 'floating'
});
```

**Result:** Buttons appear at bottom center on hover (desktop) or always visible (mobile).

### Off Mode (Click to Fullscreen)
```javascript
DiagView.init({
  layout: 'off'
});
```

**Result:** No buttons, click diagram to open fullscreen viewer.

---

## 🎨 Button Styles
```javascript
DiagView.init({
  ui: {
    buttons: {
      style: 'accent',  // 'transparent', 'accent', 'solid', 'neutral'
      icons: {
        copy: '<svg>...</svg>',       // Custom copy icon
        download: '<svg>...</svg>',   // Custom download icon
        fullscreen: '<svg>...</svg>'  // Custom fullscreen icon
      }
    }
  }
});
```

**Available Styles:**
- `transparent` - Ghost buttons with drop shadow
- `accent` - Outlined with your accent color
- `solid` - Filled with accent color
- `neutral` - Gray buttons (classic)

---

## 📤 Export Formats

DiagView supports multiple export formats:

### Programmatic Export
```javascript
const diagram = document.querySelector('.diagram');

// Export as PNG
DiagView.exportDiagram(diagram, 'png');

// Export as SVG
DiagView.exportDiagram(diagram, 'svg');

// Export as PDF
DiagView.exportDiagram(diagram, 'pdf');

// Copy to clipboard
DiagView.exportDiagram(diagram, 'copy');

// Transparent PNG
DiagView.exportDiagram(diagram, 'png-transparent');

// WebP format
DiagView.exportDiagram(diagram, 'webp');
```

### Export Settings
```javascript
DiagView.init({
  highResScale: 6,        // Desktop export scale (1-10)
  mobileScale: 2,         // Mobile export scale (1-5)
  maxPixels: 25000000,    // Safety limit (prevents crashes)
});
```

---

## ⌨️ Keyboard Shortcuts

### In Fullscreen Mode:

| Key | Action |
|-----|--------|
| `Esc` | Close fullscreen |
| `Space` / `0` | Reset zoom (fit to screen) |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `↑` `↓` `←` `→` | Pan diagram |
| `Shift` + `Arrows` | Fast pan |
| `F` | Focus search |
| `M` | Toggle meeting mode (laser pointer) |
| `L` | Copy share link |
| `R` | Rotate 90° |
| `?` | Show keyboard shortcuts |

---

## 🔍 Search Feature

Search automatically highlights matching nodes in your diagram.

### Usage:
1. Open diagram in fullscreen
2. Type in search box (top left)
3. Matching nodes are highlighted
4. Non-matching nodes are dimmed

### Programmatic Search:
```javascript
// Search is lazy-loaded, access after modal opens
// Not available in public API (internal feature)
```

---

## 🎯 Meeting Mode (Laser Pointer)

Perfect for presentations!

### Activation:
1. Open fullscreen
2. Press `M` or click "Meeting Mode" in menu
3. Red laser pointer follows your mouse

### Use Cases:
- Virtual presentations
- Teaching/training
- Code reviews
- Design reviews

---

## 🔗 Share Links

Share your exact view (zoom + pan position) with others.

### How it works:
1. Zoom/pan to desired view
2. Press `L` or click "Share Link"
3. Link copied to clipboard
4. Share with others

### URL Format:
```
https://yoursite.com/page?dv-idx=0&dv-z=2.500&dv-x=150&dv-y=200
```

Parameters:
- `dv-idx` - Diagram index on page
- `dv-z` - Zoom level
- `dv-x` - Pan X position
- `dv-y` - Pan Y position

---

## 🎨 Theming

DiagView auto-detects your site's theme (light/dark mode).

### Auto-Detection:

Checks in this order:
1. `<html class="dark">` (Tailwind)
2. `<html data-theme="dark">` (Custom)
3. `<html data-bs-theme="dark">` (Bootstrap)
4. `prefers-color-scheme: dark` (System)

### CSS Variables:

DiagView looks for these variables:
```css
:root {
  --diagram-accent: #3b82f6;      /* Accent color */
  --diagram-text: #1e293b;        /* Text color */
  --background: #ffffff;          /* Background */
}

[data-theme="dark"] {
  --diagram-accent: #60a5fa;
  --diagram-text: #f1f5f9;
  --background: #0f172a;
}
```

### Manual Override:
```javascript
DiagView.init({
  accentColor: '#ff6b6b',
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff'
});
```

---

## 🔧 Advanced Configuration

### Full Config Example:
```javascript
DiagView.init({
  // Theme
  accentColor: null,           // null = auto-detect
  backgroundColor: null,
  textColor: null,

  // Layout
  layout: 'floating',          // 'header', 'floating', 'off'

  // UI
  ui: {
    buttons: {
      style: 'accent',         // Button style
      icons: {
        copy: null,            // Custom icons (null = default)
        download: null,
        fullscreen: null
      }
    }
  },

  // Export
  highResScale: 6,             // Desktop export (1-10)
  mobileScale: 2,              // Mobile export (1-5)
  maxPixels: 25000000,         // Safety limit

  // Features
  showKeyboardHelp: true,      // Show shortcuts
  helpTimeout: 8000,           // Auto-close help (ms, 0=never)
  rememberZoom: false,         // Remember zoom per diagram
  animateOpen: true,           // Animate fullscreen open
  printFriendly: true,         // Enable print mode

  // Selectors
  diagramSelector: '.diagram, .chart, [data-diagram]',

  // Zoom/Pan
  maxZoomScale: 25,            // Max zoom (1-50)
  minZoomScale: 0.05,          // Min zoom (0.01-1)
  zoomAnimationDuration: 200,  // Animation time (ms)
  panAnimationDuration: 200,

  // Toast
  toastDuration: 2500,         // Success toast (ms)
  errorToastDuration: 5000,    // Error toast (ms)

  // PDF Library
  pdfLibraryUrl: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',

  // Callbacks
  onOpen: () => console.log('Opened'),
  onClose: () => console.log('Closed'),
  onExport: (format, filename) => console.log('Exported:', format),
  onZoomChange: (scale) => console.log('Zoom:', scale),
  onError: (error) => console.error('Error:', error)
});
```

---

## 🔄 Runtime Updates

### Update Config:
```javascript
// Change settings while running
DiagView.configure({
  layout: 'header',
  accentColor: '#ff6b6b'
});
```

### Refresh Diagrams:
```javascript
// Scan for new diagrams
DiagView.refresh();
```

### Get Current Config:
```javascript
const config = DiagView.getConfiguration();
console.log(config);
```

### Destroy:
```javascript
// Clean up everything
DiagView.destroy();
```

---

## 📱 Mobile Support

DiagView is fully mobile-optimized:

### Touch Gestures:
- **Pinch** - Zoom in/out
- **Drag** - Pan diagram
- **Double-tap** - Reset zoom

### Mobile Exports:
- Lower resolution by default (`mobileScale: 2`)
- Smaller file sizes
- Still high quality

---

## 🌐 Framework Integration

### React
```jsx
import { useEffect } from 'react';
import DiagView from 'diagview';

function App() {
  useEffect(() => {
    DiagView.init();
    return () => DiagView.destroy();
  }, []);

  return (
    <div className="diagram">
      <svg>...</svg>
    </div>
  );
}
```

### Vue
```vue
<template>
  <div class="diagram">
    <svg>...</svg>
  </div>
</template>

<script>
import DiagView from 'diagview';

export default {
  mounted() {
    DiagView.init();
  },
  unmounted() {
    DiagView.destroy();
  }
}
</script>
```

### Svelte
```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import DiagView from 'diagview';

  onMount(() => {
    DiagView.init();
  });

  onDestroy(() => {
    DiagView.destroy();
  });
</script>

<div class="diagram">
  <svg>...</svg>
</div>
```

---

## 🐛 Troubleshooting

### Diagrams not appearing?

1. Check selector: `DiagView.init({ diagramSelector: '.my-diagram' })`
2. Ensure SVG has content
3. Check console for errors

### Zoom/Pan not working?

Install Panzoom: `npm install @panzoom/panzoom`

### Export failing?

1. Check HTTPS (clipboard requires secure context)
2. For PDF: ensure jsPDF loads (check network tab)

### Theme colors wrong?

Override manually:
```javascript
DiagView.init({
  accentColor: '#your-color'
});
```

---

## 📚 More Resources

- [FAQ](./FAQ.md)
- [API Reference](./API.md)
- [Examples](../examples/)
- [GitHub Issues](https://github.com/khadirullah/diagview/issues)
