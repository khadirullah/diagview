/**
 * DiagView CSS Styles
 * Injects optimized, production-ready CSS
 * @module ui/styles
 */

export function injectStyles() {
  if (document.getElementById("diagview-styles")) return;

  const style = document.createElement("style");
  style.id = "diagview-styles";
  style.textContent = `
/* =================================================================
   DiagView - Interactive Diagram Viewer
   ================================================================= */

/* Theme Variables */
:root {
  --dv-bg: transparent;
  --dv-header-bg: rgba(128, 128, 128, 0.05);
  --dv-text-color: inherit;
  --dv-border-color: rgba(128, 128, 128, 0.2);
  --dv-accent: #3b82f6; /* Default Fallback */
}

@media (prefers-color-scheme: dark) {
  :root {
    --dv-border-color: rgba(255, 255, 255, 0.15);
    --dv-header-bg: rgba(255, 255, 255, 0.05);
  }
}

/* Reset for isolation */
.diagview-wrapper *,
.diagview-modal *,
.diagview-menu * {
  text-decoration: none !important;
  box-shadow: none !important;
  border: none !important;
  outline: none !important;
  box-sizing: border-box;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}

/* SVG Text Integrity */
.diagview-modal svg text,
.diagview-modal svg tspan,
.diagview-wrapper svg text,
.diagview-wrapper svg tspan {
  white-space: nowrap !important;
  word-wrap: normal !important;
  overflow-wrap: normal !important;
  text-overflow: clip !important;
}

/* Diagram Container */
.diagview-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  border: 1px solid var(--dv-border-color);
  border-radius: 10px;
  margin: 1.5rem 0;
  background: transparent;
  overflow: hidden;
  transition: box-shadow 0.3s ease;
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 500px;
}

.diagview-wrapper:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-color: rgba(128, 128, 128, 0.4);
}

/* Viewport */
.diagview-viewport {
  width: 100%;
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: zoom-in;
  overflow: hidden;
  padding: 24px;
  min-height: 200px;
  border-radius: 8px;
  user-select: none;
  background: rgba(128, 128, 128, 0.02);
  contain: layout style;
}

.diagview-viewport > * {
  width: 100% !important;
  display: flex;
  justify-content: center;
}

.diagview-viewport svg {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: 80vh !important;
  display: block;
  transition: transform 0.2s ease;
  background: transparent !important;
}

/* Header Controls */
.diagview-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  width: 100%;
  background: var(--dv-header-bg);
  border-bottom: 1px solid var(--dv-border-color);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.diagview-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dv-text-color);
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.diagview-btn-group {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Desktop: Hidden by default, slides down on hover */
@media (hover: hover) and (pointer: fine) {
  .diagview-controls {
    opacity: 0;
    pointer-events: none;
    transform: translateY(-5px);
  }

  .diagview-wrapper:hover .diagview-controls {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}

/* Mobile: Always visible */
@media (hover: none) or (pointer: coarse) {
  .diagview-controls {
    opacity: 1 !important;
    pointer-events: auto !important;
  }
}

/* Floating Layout (Low-Centered Static) */
.diagview-controls-floating {
  position: relative !important;
  margin-top: 10px;
  width: 100% !important;
  background: transparent !important;
  padding: 0 !important;
  display: flex;
  gap: 12px;
  align-items: center !important;
  justify-content: center;
  z-index: 10;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  transform: translateY(-5px);
}

.diagview-wrapper:hover .diagview-controls-floating {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* Floating Mode Overrides */
.diagview-controls-floating .diagview-label {
  display: none !important;
}

.diagview-controls-floating .diagview-btn {
  background: transparent !important;
  border: none !important;
  color: #fff !important;
  width: 36px;
  height: 36px;
  opacity: 1;
  box-shadow: none !important;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

.diagview-controls-floating .diagview-btn:hover {
  border-radius: 50%;
}

/* Action Buttons */
.diagview-btn {
  all: unset;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.15);
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  color: var(--dv-text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0 !important;
  box-sizing: border-box !important;
  position: relative;
}

.diagview-btn:hover {
  background: rgba(128, 128, 128, 0.25);
  transform: translateY(-1px);
}

.diagview-btn:active {
  scale: 0.95;
}

.diagview-btn svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
  pointer-events: none;
}

/* Button Success State */
.diagview-btn.success {
  background: #10b981 !important;
  color: white !important;
}

.diagview-btn.success::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  animation: checkmark 0.3s ease;
}

@keyframes checkmark {
  0% { opacity: 0; transform: scale(0.5); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

/* Fullscreen Modal */
.diagview-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 999999;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--dv-bg);
  color: var(--dv-text-color);
}

.diagview-modal.open {
  display: flex;
  animation: dv-fade-in 0.2s ease-out;
}

@keyframes dv-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Modal Content Wrapper */
.diagview-modal-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  position: relative;
}

/* Topbar */
.diagview-topbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 8px;
  min-height: 52px;
  background: var(--dv-header-bg);
  border-bottom: 1px solid var(--dv-border-color);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

@media (min-width: 640px) {
  .diagview-topbar {
    padding: 0 60px 0 20px;
    min-height: 56px;
    justify-content: center;
  }
}

/* Search Container */
.diagview-search-container {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  max-width: 600px;
  min-width: 0;
}

.diagview-search-wrapper {
  flex: 1;
  display: flex;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 12px;
  height: 38px;
  align-items: center;
  background: rgba(128, 128, 128, 0.06);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.diagview-search-wrapper:focus-within {
  border-color: var(--dv-accent-color, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  background: var(--dv-bg);
}

.diagview-search-icon {
  opacity: 0.5;
  flex-shrink: 0;
  color: var(--dv-text-color);
}

.diagview-search-input {
  all: unset;
  flex: 1;
  font-size: 14px;
  color: var(--dv-text-color);
}

.diagview-search-clear {
  all: unset;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  padding: 4px;
  color: var(--dv-text-color);
  line-height: 1;
  transition: opacity 0.2s;
}

.diagview-search-clear.show {
  opacity: 0.5;
}

.diagview-search-clear:hover {
  opacity: 1;
  color: #ff4444;
}

/* Search Counter */
.diagview-src-cnt {
  display: none;
  min-width: 3.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--dv-text-color);
  opacity: 0.7;
  white-space: nowrap;
  padding: 0.25rem 0.5rem;
  background: var(--dv-header-bg);
  border-radius: 6px;
  flex-shrink: 0;
  text-align: center;
  visibility: hidden;
}

.diagview-src-cnt.show {
  visibility: visible;
}

/* Zoom Display */
.diagview-zoom-display {
  display: none;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 4px 10px;
  background: var(--dv-header-bg);
  border: 1px solid var(--dv-border-color);
  border-radius: 6px;
  color: var(--dv-text-color);
  opacity: 0.9;
  white-space: nowrap;
  min-width: 52px;
  text-align: center;
}

.diagview-shortcut-hint {
  display: none;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.6;
  color: var(--dv-text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.diagview-shortcut-hint kbd {
  padding: 2px 6px;
  background: var(--dv-header-bg);
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  border: 1px solid var(--dv-border-color) !important;
}

@media (min-width: 640px) {
  .diagview-src-cnt {
    display: block;
  }
  .diagview-zoom-display {
    display: block;
  }
  .diagview-shortcut-hint {
    display: flex;
  }
}

/* Close Button */
.diagview-close-btn {
  all: unset;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 300;
  border: 1px solid var(--dv-border-color) !important;
  background: rgba(128, 128, 128, 0.08);
  color: var(--dv-text-color);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (min-width: 640px) {
  .diagview-close-btn {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }
}

.diagview-close-btn:hover {
  background: rgba(255, 68, 68, 0.15);
  color: #ff4444;
  border-color: rgba(255, 68, 68, 0.3) !important;
}

@media (min-width: 640px) {
  .diagview-close-btn:hover {
    transform: translateY(-50%) scale(1.05);
  }
}

.diagview-close-btn:active {
  transform: scale(0.95);
}

@media (min-width: 640px) {
  .diagview-close-btn:active {
    transform: translateY(-50%) scale(0.95);
  }
}

/* Search Highlighting - Mermaid Optimized */
.dv-searching .node, 
.dv-searching .cluster, 
.dv-searching .edgePath, 
.dv-searching .label, 
.dv-searching text {
  transition: opacity 0.2s ease;
  will-change: opacity;
}

/* Match Highlighting - Force Visibility + Stroke */
.dv-searching .dv-search-match {
  opacity: 1 !important;
  stroke: var(--dv-ac) !important;
  stroke-width: 3px !important;
  filter: none !important;
}

/* Specific fix for edge paths that are matches (lines need color) */
.dv-searching .edgePath.dv-search-match path {
  stroke: var(--dv-ac) !important;
  stroke-width: 3px !important;
  opacity: 1 !important;
}

/* Modal Viewport - Diagram Container */
.diagview-modal-viewport {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: grab;
  background: var(--dv-bg);
  touch-action: none;
  user-select: none;
  position: relative;
  min-height: 0;
  contain: layout;
  will-change: transform;
}

.diagview-modal-viewport:active {
  cursor: grabbing;
}

.diagview-modal-viewport svg {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  transform-origin: center center !important;
  will-change: transform;
}

/* Floating Menu Container */
.diagview-fab-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000010;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-end;
  pointer-events: none;
}

.diagview-fab-container > * {
  pointer-events: auto;
}

/* FAB Button */
.diagview-fab-btn {
  all: unset;
  width: 56px;
  height: 56px;
  background: var(--dv-accent);
  color: white !important;
  border-radius: 16px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
  cursor: pointer !important;
  pointer-events: auto !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2147483647;
}

.diagview-fab-btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.diagview-fab-btn:active {
  transform: scale(0.95);
}

.diagview-fab-btn.open {
  border-radius: 50%;
  transform: rotate(90deg);
  background: var(--dv-bg);
  color: var(--dv-text-color) !important;
  border: 1px solid var(--dv-border-color) !important;
}

.diagview-fab-btn svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  stroke-width: 2.5;
  fill: none;
  pointer-events: none;
}

/* Floating Menu */
.diagview-menu {
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 260px !important;
  background: var(--dv-bg) !important;
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 
    0 24px 48px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(10px) scale(0.95);
  transform-origin: bottom right;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.diagview-menu.active {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.dv-menu-sec {
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}

.dv-menu-lbl {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.625rem;
  font-size: 0.625rem;
  font-weight: 800;
  color: var(--dv-text-color);
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  padding-left: 4px;
}

/* Zoom Controls (Row) */
.dv-zoom {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem;
  background: var(--dv-popover-bg);
  border-radius: var(--dv-radius-sm);
  border: 1px solid var(--dv-border-color);
}

.dv-zoom-val {
  flex: 1;
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--dv-text-color);
  font-feature-settings: "tnum";
}

.dv-zoom button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dv-btn-bg);
  border-radius: 8px;
  color: var(--dv-text-color);
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.dv-zoom button svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
  stroke: currentColor;
  fill: none;
}

.dv-zoom button:hover {
  background: var(--dv-primary, var(--dv-accent, #3b82f6));
  color: #fff;
  transform: translateY(-1px);
}

/* Export Grid (3 columns for compact look) */
.dv-exp {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.375rem;
}

.dv-exp button {
  min-height: 32px;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  color: var(--dv-text-color);
  font-size: 0.6875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none !important;
}

.dv-exp button:hover {
  background: var(--dv-primary, var(--dv-accent, #3b82f6));
  border-color: transparent;
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Menu List Items (Tools) */
.dv-menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 44px;
  padding: 0.625rem 0.875rem;
  background: transparent;
  border-radius: 12px;
  color: var(--dv-text-color);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
  border: none;
  text-decoration: none !important;
}

.dv-menu-item:hover {
  background: var(--dv-primary, var(--dv-accent, #3b82f6));
  color: white;
}

.dv-menu-item:hover svg {
  stroke: white;
}

.dv-menu-item.active {
  background: var(--dv-primary);
  color: white !important;
}

.dv-menu-item svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  flex-shrink: 0;
}

/* Minimap */
.diagview-minimap {
  position: fixed;
  left: 24px;
  bottom: 24px;
  width: 160px;
  height: 100px;
  background: var(--dv-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--dv-border-color) !important;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s;
  z-index: 1000005;
}

.diagview-minimap.show {
  opacity: 1;
  visibility: visible;
}

.diagview-minimap svg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.dv-mm-v {
  position: absolute;
  border: 2px solid var(--dv-accent-color, #3b82f6) !important;
  background: rgba(59, 130, 246, 0.1);
  pointer-events: none;
}

/* Laser Pointer (Meeting Mode) */
.diagview-laser {
  position: fixed;
  width: 28px;
  height: 28px;
  pointer-events: none;
  z-index: 1000015;
  transform: translate(-50%, -50%);
  display: none;
}

.diagview-laser::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, #ef4444 0%, transparent 70%);
  animation: dv-laser 1s ease-in-out infinite;
}

.diagview-laser::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  background: #ef4444;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 16px 6px rgba(239, 68, 68, 0.6);
}

@keyframes dv-laser {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.3);
  }
}

.diagview-modal-viewport.meeting {
  cursor: none;
}

/* Toast Notifications */
.diagview-toast {
  position: fixed;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 24px;
  font: 600 14px system-ui;
  z-index: 2000000;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  background: var(--dv-text);
  color: var(--dv-bg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

@media print {
  .diagview-controls,
  .diagview-menu,
  .diagview-modal {
    display: none !important;
  }
}

/* === Configurable Button Styles === */

/* Style: transparent */
.dv-btn-transparent {
  background: transparent !important;
  border: none !important;
  color: var(--dv-accent) !important;
  box-shadow: none !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
}
.dv-btn-transparent:hover {
  transform: scale(1.1);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
}

/* Style: accent (Icon Only) */
.dv-btn-accent {
background: transparent !important;
border: 1px solid color-mix(in srgb, var(--dv-accent) 40%, transparent) !important;
color: var(--dv-accent) !important;
}
.dv-btn-accent svg {
fill: var(--dv-accent) !important;
stroke: var(--dv-accent) !important;
}
.dv-btn-accent:hover {
background: color-mix(in srgb, var(--dv-accent) 10%, transparent) !important;
color: var(--dv-accent) !important;
border-color: var(--dv-accent) !important;
}
.dv-btn-accent:hover svg {
fill: var(--dv-accent) !important;
stroke: var(--dv-accent) !important;
}
/* Style: solid (High Contrast) */
.dv-btn-solid {
background: var(--dv-accent) !important;
color: #fff !important;
border: 1px solid transparent !important;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}
.dv-btn-solid:hover {
filter: brightness(1.1);
transform: translateY(-1px);
}
/* Style: neutral (Classic/Grey) */
.dv-btn-neutral {
background: rgba(128, 128, 128, 0.15) !important;
border: 1px solid rgba(128, 128, 128, 0.2) !important;
color: var(--dv-text-color) !important;
}
.dv-btn-neutral:hover {
background: rgba(128, 128, 128, 0.25) !important;
color: var(--dv-text-color) !important;
}
/* === Loading Indicator === */
.diagview-loading {
position: absolute;
inset: 0;
display: flex;
align-items: center;
justify-content: center;
background: var(--dv-bg);
z-index: 1000010;
transition: opacity 0.3s ease;
}
.diagview-loading.hide {
opacity: 0;
pointer-events: none;
}
.diagview-spinner {
width: 48px;
height: 48px;
border: 3px solid var(--dv-border-color);
border-top-color: var(--dv-accent);
border-radius: 50%;
animation: dv-spin 0.8s linear infinite;
}
@keyframes dv-spin {
to { transform: rotate(360deg); }
}
/* === Error Boundary === */
.diagview-error {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
padding: 2rem;
text-align: center;
color: var(--dv-text-color);
background: var(--dv-bg);
border: 1px dashed var(--dv-border-color);
border-radius: 12px;
min-height: 120px;
}
.diagview-error-icon {
width: 48px;
height: 48px;
margin-bottom: 1rem;
color: #ef4444;
}
.diagview-error-title {
font-size: 1rem;
font-weight: 600;
margin-bottom: 0.5rem;
color: #ef4444;
}
.diagview-error-message {
font-size: 0.875rem;
opacity: 0.7;
max-width: 300px;
}
/* === Keyboard Help Modal === */
.diagview-help-modal {
position: fixed;
inset: 0;
display: flex;
align-items: center;
justify-content: center;
background: rgba(0, 0, 0, 0.6);
backdrop-filter: blur(4px);
z-index: 2147483648;
opacity: 0;
visibility: hidden;
transition: all 0.2s ease;
}
.diagview-help-modal.show {
opacity: 1;
visibility: visible;
}
.diagview-help-content {
background: var(--dv-bg);
border: 1px solid var(--dv-border-color);
border-radius: 16px;
padding: 1.5rem;
max-width: 400px;
width: 90%;
max-height: 80vh;
overflow-y: auto;
box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
}
.diagview-help-title {
font-size: 1.25rem;
font-weight: 700;
margin-bottom: 1rem;
color: var(--dv-text-color);
display: flex;
align-items: center;
justify-content: space-between;
}
.diagview-help-close {
background: none;
border: none;
cursor: pointer;
padding: 0.5rem;
color: var(--dv-text-color);
opacity: 0.6;
transition: opacity 0.2s;
}
.diagview-help-close:hover {
opacity: 1;
}
.diagview-help-grid {
display: grid;
gap: 0.75rem;
}
.diagview-help-row {
display: flex;
align-items: center;
justify-content: space-between;
padding: 0.5rem 0;
border-bottom: 1px solid rgba(128, 128, 128, 0.35);
}
.diagview-help-row:last-child {
border-bottom: none;
}
.diagview-help-key {
display: inline-flex;
align-items: center;
gap: 0.25rem;
}
.diagview-help-key kbd {
background: var(--dv-header-bg);
border: 1px solid var(--dv-border-color);
border-radius: 4px;
padding: 0.25rem 0.5rem;
font-family: inherit;
font-size: 0.75rem;
font-weight: 600;
color: var(--dv-text-color);
}
.diagview-help-desc {
font-size: 0.875rem;
color: var(--dv-text-color);
opacity: 0.8;
}
/* === Open Animation === */
.diagview-modal.animate-open .diagview-modal-content {
animation: dv-modal-open 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes dv-modal-open {
from {
opacity: 0;
transform: scale(0.95);
}
to {
opacity: 1;
transform: scale(1);
}
}
/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
.diagview-modal.animate-open .diagview-modal-content {
animation: none;
}
.diagview-spinner {
animation-duration: 1.5s;
}
}
`;
  document.head.appendChild(style);
}
/**

Remove injected styles
*/
export function removeStyles() {
  const style = document.getElementById("diagview-styles");
  if (style) {
    style.remove();
  }
}


