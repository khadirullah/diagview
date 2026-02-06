# DiagView API Reference

Complete API documentation for DiagView.

---

## Core Methods

### `DiagView.init(options?)`

Initialize DiagView with optional configuration.

**Parameters:**
- `options` (Object, optional) - Configuration object

**Returns:** `void`

**Example:**
```javascript
DiagView.init({
  layout: 'floating',
  accentColor: '#3b82f6'
});
```

---

### `DiagView.destroy()`

Clean up DiagView and remove all enhancements.

**Returns:** `void`

**Example:**
```javascript
DiagView.destroy();
```

---

### `DiagView.refresh()`

Scan for new diagrams and initialize them.

**Returns:** `void`

**Example:**
```javascript
// After adding new diagrams dynamically
DiagView.refresh();
```

---

### `DiagView.configure(options)`

Update configuration at runtime.

**Parameters:**
- `options` (Object) - Partial configuration to update

**Returns:** `void`

**Example:**
```javascript
DiagView.configure({
  accentColor: '#ff6b6b',
  layout: 'header'
});
```

---

### `DiagView.getConfiguration()`

Get current configuration.

**Returns:** `Object` - Current configuration

**Example:**
```javascript
const config = DiagView.getConfiguration();
console.log(config.layout); // 'floating'
```

---

### `DiagView.exportDiagram(element, format, modalClone?)`

Export a diagram programmatically.

**Parameters:**
- `element` (HTMLElement) - Diagram container element
- `format` (string) - Export format: `'png'`, `'svg'`, `'pdf'`, `'copy'`, `'png-transparent'`, `'webp'`, `'webp-transparent'`
- `modalClone` (SVGElement, optional) - Cloned SVG from modal (internal use)

**Returns:** `Promise<void>`

**Example:**
```javascript
const diagram = document.querySelector('.diagram');
await DiagView.exportDiagram(diagram, 'png');
```

---

### `DiagView.closeModal()`

Close the fullscreen modal programmatically.

**Returns:** `void`

**Example:**
```javascript
DiagView.closeModal();
```

---

## Configuration Options

### Theme

#### `accentColor`
- **Type:** `string | null`
- **Default:** `null` (auto-detect)
- **Description:** Accent color for buttons and highlights

#### `backgroundColor`
- **Type:** `string | null`
- **Default:** `null` (auto-detect)
- **Description:** Background color

#### `textColor`
- **Type:** `string | null`
- **Default:** `null` (auto-detect)
- **Description:** Text color

---

### Layout

#### `layout`
- **Type:** `'header' | 'floating' | 'off'`
- **Default:** `'floating'`
- **Description:** Button layout mode

---

### UI Customization

#### `ui.buttons.style`
- **Type:** `'transparent' | 'accent' | 'solid' | 'neutral'`
- **Default:** `'accent'`
- **Description:** Button style variant

#### `ui.buttons.icons`
- **Type:** `Object`
- **Properties:**
  - `copy` (string | null) - Custom copy icon SVG
  - `download` (string | null) - Custom download icon SVG
  - `fullscreen` (string | null) - Custom fullscreen icon SVG
- **Default:** `{ copy: null, download: null, fullscreen: null }`

---

### Export Settings

#### `highResScale`
- **Type:** `number`
- **Range:** `1-10`
- **Default:** `6`
- **Description:** Desktop export resolution multiplier

#### `mobileScale`
- **Type:** `number`
- **Range:** `1-5`
- **Default:** `2`
- **Description:** Mobile export resolution multiplier

#### `maxPixels`
- **Type:** `number`
- **Default:** `25000000`
- **Description:** Maximum pixels for export (safety limit)

---

### Features

#### `showKeyboardHelp`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Show keyboard shortcuts on fullscreen open

#### `helpTimeout`
- **Type:** `number` (milliseconds)
- **Default:** `8000`
- **Description:** Auto-close keyboard help (0 = never)

#### `rememberZoom`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Remember zoom/pan state per diagram (session-based)

#### `animateOpen`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Animate fullscreen modal open

#### `printFriendly`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable print-friendly mode

---

### Selectors

#### `diagramSelector`
- **Type:** `string`
- **Default:** `'.diagram, .chart, [data-diagram]'`
- **Description:** CSS selector for diagram containers

---

### Zoom/Pan

#### `maxZoomScale`
- **Type:** `number`
- **Range:** `1-50`
- **Default:** `25`
- **Description:** Maximum zoom scale

#### `minZoomScale`
- **Type:** `number`
- **Range:** `0.01-1`
- **Default:** `0.05`
- **Description:** Minimum zoom scale

#### `zoomAnimationDuration`
- **Type:** `number` (milliseconds)
- **Default:** `200`
- **Description:** Zoom animation duration

#### `panAnimationDuration`
- **Type:** `number` (milliseconds)
- **Default:** `200`
- **Description:** Pan animation duration

---

### Toast Notifications

#### `toastDuration`
- **Type:** `number` (milliseconds)
- **Default:** `2500`
- **Description:** Success toast duration

#### `errorToastDuration`
- **Type:** `number` (milliseconds)
- **Default:** `5000`
- **Description:** Error toast duration

---

### Advanced

#### `pdfLibraryUrl`
- **Type:** `string`
- **Default:** `'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'`
- **Description:** CDN URL for jsPDF library (for PDF export)

---

### Callbacks

#### `onOpen`
- **Type:** `() => void`
- **Default:** `null`
- **Description:** Called when fullscreen modal opens

#### `onClose`
- **Type:** `() => void`
- **Default:** `null`
- **Description:** Called when fullscreen modal closes

#### `onExport`
- **Type:** `(format: string, filename: string) => void`
- **Default:** `null`
- **Description:** Called when export completes

#### `onZoomChange`
- **Type:** `(scale: number) => void`
- **Default:** `null`
- **Description:** Called when zoom level changes

#### `onError`
- **Type:** `(error: Error) => void`
- **Default:** `null`
- **Description:** Called when an error occurs

---

## Events

DiagView doesn't emit custom events. Use callbacks instead.

---

## TypeScript Support

DiagView includes TypeScript definitions.
```typescript
import DiagView, { DiagViewConfig } from 'diagview';

const config: DiagViewConfig = {
  layout: 'floating',
  accentColor: '#3b82f6'
};

DiagView.init(config);
```

---

## Browser Support

- Chrome ≥90
- Firefox ≥88
- Safari ≥14
- Edge ≥90

**Not supported:** Internet Explorer

---

## Bundle Size

- **UMD (minified):** ~18KB
- **ESM:** ~16KB
- **Gzipped:** ~6KB

---

## Dependencies

### Required
- None (pure JavaScript)

### Optional
- `@panzoom/panzoom` - For zoom/pan functionality

### Lazy-loaded
- `jsPDF` - For PDF export (loaded on-demand)

---

## Version

Current version: **1.0.0**
```javascript
console.log(DiagView.version); // "1.0.0"
```
