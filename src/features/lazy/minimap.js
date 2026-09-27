/**
 * DiagView Minimap Functionality
 * Provides overview navigation for large diagrams
 * @module features/lazy/minimap
 */

import { state } from "../../core/config.js";
import { addModalListener } from "../../core/lifecycle.js";
import { getClientCTM } from "../../core/utils.js";

// Stores the cleanup fn for the minimap click and window resize handlers so
// they can be removed on modal close without duplicating handlers across frames
let _minimapListenerCleanup = null;

// The snapshot image and the SVGs it was built from, kept only when the
// snapshot baked in the viewer's currentColor, so a theme change can redraw it
let _colourSnapshot = null;

// Trailing timer that re-positions the viewport indicator after an animated
// pan's CSS transition settles (a CTM read mid-transition is stale)
let _indicatorSettleTimer = null;

/**
 * Carry the page's CSS custom properties into a serialised SVG. The minimap
 * draws the SVG as an image, which is its own document, so var(--x) in its
 * styles or attributes would find nothing and paint black. The values the
 * page computes for the SVG are added as a :root rule. Elements inside the
 * SVG that set the same variable keep their own value.
 * @param {string} markup - Serialised SVG
 * @param {Element} svg - The live SVG the markup came from
 * @returns {string} The markup, with a <style> added when it uses var()
 */
export function withPageVariables(markup, svg) {
  if (!markup.includes("var(") || !markup.endsWith("</svg>")) return markup;
  const names = new Set(Array.from(markup.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1]));
  const computed = getComputedStyle(svg);
  let rule = "";
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value) rule += `${name}:${value};`;
  }
  if (!rule) return markup;
  const css = `:root{${rule}}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `${markup.slice(0, -6)}<style>${css}</style></svg>`;
}

// Most elements the currentColor walk reads before it stops. Past this only
// the root colour is carried, which is what nearly every SVG needs.
const MAX_COLOUR_WALK = 5000;

/**
 * Carry the viewer's text colour into a serialised SVG. The minimap image
 * has no page to inherit `color` from, so currentColor would paint black.
 * The colour the fullscreen view gives its SVG goes on the snapshot root.
 * Elements that the viewer draws in a different colour from their parent,
 * without setting it in their own attributes, get a rule of their own.
 * Colours set inside the SVG travel with the markup anyway.
 * @param {string} markup - Serialised SVG
 * @param {Element} source - The page SVG the markup came from
 * @param {Element} shown - The SVG the fullscreen view draws
 * @returns {string} The markup, with a <style> added when it uses currentColor
 */
export function withCurrentColor(markup, source, shown) {
  if (!markup.endsWith("</svg>") || !/currentcolor/i.test(markup)) return markup;
  const colourOf = (el) => getComputedStyle(el).color;
  const rootColour = colourOf(shown);
  if (!rootColour) return markup;
  let css = `:root{color:${rootColour}!important}`;

  // Walk the shown SVG next to the source. Rotation wraps the shown content
  // in .dv-rot-g, and a level whose children do not line up is skipped.
  const stack = [[source, shown.querySelector(":scope > .dv-rot-g") || shown, rootColour, ":root"]];
  let budget = MAX_COLOUR_WALK;
  while (stack.length && budget > 0) {
    const [src, view, parentColour, path] = stack.pop();
    const srcKids = src.children;
    const viewKids = view.children;
    if (srcKids.length !== viewKids.length) continue;
    for (let i = 0; i < srcKids.length && budget > 0; i++, budget--) {
      const el = srcKids[i];
      if (el.tagName !== viewKids[i].tagName) continue;
      const colour = colourOf(viewKids[i]);
      const childPath = `${path}>:nth-child(${i + 1})`;
      if (colour !== parentColour && !el.style?.color && !el.hasAttribute("color")) {
        css += `${childPath}{color:${colour}!important}`;
      }
      if (el.children.length) stack.push([el, viewKids[i], colour, childPath]);
    }
  }
  css = css.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `${markup.slice(0, -6)}<style>${css}</style></svg>`;
}

/**
 * Serialise the page SVG for the minimap image with the page variables and
 * the viewer's currentColor resolved.
 * @param {Element} source - The page SVG
 * @param {Element} shown - The SVG the fullscreen view draws
 * @returns {{ markup: string, usesColour: boolean }} The markup, and whether
 *   it baked in currentColor
 */
function buildSnapshot(source, shown) {
  const base = withPageVariables(new XMLSerializer().serializeToString(source), source);
  const markup = withCurrentColor(base, source, shown);
  return { markup, usesColour: markup !== base };
}

const toDataUrl = (markup) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);

/**
 * Redraw the minimap image after the viewer's text colour changed, so parts
 * drawn in currentColor follow the canvas theme. Snapshots that did not use
 * currentColor are left alone.
 */
export function refreshMinimapColour() {
  const snap = _colourSnapshot;
  if (!snap || !snap.img.isConnected) return;
  // A page that eases colour changes reports a colour part way between old
  // and new until its transitions end, so draw once they have. A later call
  // takes over from this one.
  const call = (snap.call = {});
  const modal = document.getElementById("diagview-modal");
  const giveUp = Date.now() + 3000;
  const draw = () => {
    if (_colourSnapshot !== snap || snap.call !== call || !snap.img.isConnected) return;
    const easing =
      modal?.getAnimations && Date.now() < giveUp
        ? modal.getAnimations({ subtree: true }).filter((t) => t.transitionProperty === "color")
        : [];
    if (easing.length) {
      Promise.all(easing.map((t) => t.finished)).then(draw, draw);
      return;
    }
    const { markup } = buildSnapshot(snap.source, snap.shown);
    if (markup === snap.markup) return;
    snap.markup = markup;
    snap.img.setAttribute("href", toDataUrl(markup));
  };
  draw();
}

/**
 * Update minimap viewport indicator
 */
export function updateMinimap(clone, viewport, panzoom) {
  const minimap = document.getElementById("diagview-minimap");
  if (!minimap || !clone || !viewport || !panzoom || !state.config.showMinimap) {
    if (minimap) minimap.classList.remove("show");
    return;
  }

  // Use getBoundingClientRect for BOTH SVG and viewport — same CSS pixel
  // coordinate space. GBCR includes CSS transforms (panzoom scale) and is
  // automatically adjusted by browser zoom. This eliminates the old bug where
  // baseVal (SVG intrinsic units) was compared against CSS pixels, causing
  // false-positive minimap visibility at high browser zoom levels.
  const svgRect = clone.getBoundingClientRect();
  const scale = panzoom.getScale();

  // Minimap needed when the scaled diagram exceeds the viewport.
  // Both values in same CSS pixel space — browser zoom has zero effect.
  const diagramExceedsViewport = () => {
    const s = clone.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    return s.width > v.width * 1.05 || s.height > v.height * 1.05;
  };
  const needsMinimap = diagramExceedsViewport();

  minimap.classList.toggle("show", needsMinimap);

  // Attach click-to-navigate and resize handlers once per minimap lifetime (A7)
  // Guard prevents duplicate listeners across updateMinimap calls
  if (!_minimapListenerCleanup) {
    const handleMinimapClick = (e) => {
      if (!panzoom || !state.minimapSvg) return;

      // Map the click through the minimap SVG's own CTM to get exact viewBox
      // coordinates — this accounts for the snapshot's letterboxing inside
      // the minimap box and any CSS rotation, which rectangle arithmetic
      // (offset + width ratios) gets wrong.
      const mmCtm = getClientCTM(state.minimapSvg);
      if (!mmCtm) return;
      const clickPt = state.minimapSvg.createSVGPoint();
      clickPt.x = e.clientX;
      clickPt.y = e.clientY;
      const target = clickPt.matrixTransform(mmCtm.inverse());
      const svgX = target.x;
      const svgY = target.y;

      const curScale = panzoom.getScale();

      // Pan so the clicked SVG point is centered in the viewport.
      // The snapshot's coordinates are the ORIGINAL (unrotated) diagram's:
      // rotation lives on an inner <g class="dv-rot-g"> (see rotate.js), so
      // the point's on-screen position must be read through that group's CTM,
      // which includes the rotation — the SVG root's CTM does not.
      const contentRoot = clone.querySelector(".dv-rot-g") || clone;
      const ctm = getClientCTM(contentRoot);
      if (!ctm) return;
      const pt = clone.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      const screenPt = pt.matrixTransform(ctm);

      const vpRect = viewport.getBoundingClientRect();
      const screenDX = screenPt.x - (vpRect.left + vpRect.width / 2);
      const screenDY = screenPt.y - (vpRect.top + vpRect.height / 2);

      // No rotation compensation: rotation is applied INSIDE the SVG (after
      // panzoom's scale/translate in the transform chain), so pan always
      // responds in screen axes — verified empirically at 0/90/180/270.
      panzoom.pan(-screenDX / curScale, -screenDY / curScale, { animate: true, relative: true });
    };

    // Window resizes under modal.js's 20% threshold do not reset panzoom, so
    // no panzoomchange fires — re-evaluate visibility and the indicator here.
    let resizeFrame = null;
    const handleResize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (state.isModalOpen) updateMinimap(clone, viewport, panzoom);
      });
    };

    // MAJ-6: Use a self-resetting cleanup wrapper. This ensures the module-level
    // variable is nulled out even if the cleanup is triggered externally by
    // runModalCleanupFunctions during modal closure.
    const cleanupClick = addModalListener(minimap, "click", handleMinimapClick);
    const cleanupResize = addModalListener(window, "resize", handleResize);
    _minimapListenerCleanup = () => {
      if (typeof cleanupClick === "function") cleanupClick();
      if (typeof cleanupResize === "function") cleanupResize();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
      _minimapListenerCleanup = null;
    };

    // Make minimap visually indicate it's clickable
    minimap.style.cursor = "crosshair";
  }

  if (!needsMinimap) return;

  // Get intrinsic SVG dimensions for minimap scale calculation.
  // Prefer viewBox (SVG's own coordinate system, zoom-independent).
  // Fallback to computed dimensions divided by panzoom scale.
  const viewBox = clone.viewBox?.baseVal;
  const d = {
    width: viewBox?.width || svgRect.width / scale || 800,
    height: viewBox?.height || svgRect.height / scale || 600,
  };

  // Create minimap SVG if not exists, or if the previous one was detached
  // (can happen if cleanupMinimap() was skipped on an error path)
  if (!state.minimapSvg?.isConnected) {
    if (state.minimapSvg) {
      state.minimapSvg.remove();
      state.minimapSvg = null;
    }

    // DOM-3: Instead of deep-cloning thousands of nodes, we use a lightweight <use> element.
    // This allows the browser to re-use the graphics of the original SVG without the
    // overhead of creating a second massive DOM tree in the JavaScript heap.
    state.minimapSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    // We must reference the ORIGINAL untransformed SVG from the page.
    // If we reference the 'clone', the minimap will zoom/pan along with it (Regression).
    const originalContainer = state.activeSourceElement;

    if (!originalContainer) {
      console.warn("DiagView: No active source element for minimap source");
      return;
    }
    const originalSvg = originalContainer?.querySelector("svg");

    if (!originalSvg) {
      console.warn("DiagView: Original SVG not found for minimap source");
      return;
    }

    // BUG-16 Fix: Use a Data URL snapshot to avoid mutating the original SVG's ID.
    // This ensures isolation and prevents breaking host-page CSS/JS.
    const { markup, usesColour } = buildSnapshot(originalSvg, clone);

    const imgEl = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgEl.setAttribute("href", toDataUrl(markup));
    _colourSnapshot = usesColour ? { source: originalSvg, shown: clone, img: imgEl, markup } : null;
    imgEl.setAttribute("x", "0");
    imgEl.setAttribute("y", "0");
    imgEl.setAttribute("width", "100%");
    imgEl.setAttribute("height", "100%");
    imgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    state.minimapSvg.appendChild(imgEl);

    state.minimapSvg.style.cssText =
      "max-width:100%; max-height:100%; width:auto; height:auto; display:block;";

    // Use the ORIGINAL SVG's viewBox: the snapshot is of the unrotated page
    // SVG, while the live clone's viewBox may already be rewritten to rotated
    // bounds by rotate.js (axis-swapped at 90°/270°).
    // Keep the viewBox ORIGIN too: Mermaid sequence/gitGraph/mindmap output
    // starts at negative x/y, and a "0 0 W H" thumbnail shifts click-to-navigate
    // and the indicator by exactly (x, y).
    const srcVb = originalSvg.viewBox?.baseVal;
    const vbX = srcVb?.x || 0;
    const vbY = srcVb?.y || 0;
    const vbW = srcVb?.width || d.width;
    const vbH = srcVb?.height || d.height;
    if (!state.minimapSvg.getAttribute("viewBox") && vbW && vbH) {
      state.minimapSvg.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
    }
    state.minimapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    state.minimapSvg.removeAttribute("width");
    state.minimapSvg.removeAttribute("height");

    const mmIndicator = minimap.querySelector(".dv-mm-v");
    minimap.insertBefore(state.minimapSvg, mmIndicator);
  }

  // Fit the thumbnail so its ROTATED bounding box fits the minimap box. The
  // CSS rotation turns about the thumbnail's centre, so at 90°/270° the width
  // is limited by the box height and vice versa — a landscape thumbnail fitted
  // to the unrotated box would overflow and be clipped by overflow:hidden.
  const mmVbFit = state.minimapSvg.viewBox?.baseVal;
  const mmRect = minimap.getBoundingClientRect();
  const boxW = minimap.clientWidth || mmRect.width;
  const boxH = minimap.clientHeight || mmRect.height;
  if (mmVbFit?.width && mmVbFit?.height && boxW && boxH) {
    const sideways = state.rotationAngle % 180 !== 0;
    const limitW = sideways ? boxH : boxW;
    const limitH = sideways ? boxW : boxH;
    const fit = Math.min(limitW / mmVbFit.width, limitH / mmVbFit.height);
    state.minimapSvg.style.width = `${mmVbFit.width * fit}px`;
    state.minimapSvg.style.height = `${mmVbFit.height * fit}px`;
  }
  const rotation = `rotate(${state.rotationAngle}deg)`;
  if (state.minimapSvg.style.transform !== rotation) {
    state.minimapSvg.style.transform = rotation;
  }

  // Position the viewport indicator by mapping the visible screen rect into
  // viewBox coordinates through the CTM — the same mapping the click handler
  // uses — then into the rendered minimap snapshot's pixel box. Deriving it
  // from pan/scale arithmetic instead drifts as zoom grows, because panzoom
  // pan units are pre-scale pixels of a letterboxed 100%-sized SVG, not
  // viewBox units.
  const positionIndicator = () => {
    const viewportIndicator = minimap.querySelector(".dv-mm-v");
    if (!viewportIndicator || !state.minimapSvg?.isConnected) return;
    const vpRect = viewport.getBoundingClientRect();
    const minimapRect = minimap.getBoundingClientRect();
    // Snapshot coordinates are the ORIGINAL diagram's; rotation lives on the
    // inner .dv-rot-g group, so map through its CTM (the root's excludes it).
    const contentRoot = clone.querySelector(".dv-rot-g") || clone;
    const ctm = getClientCTM(contentRoot);
    const mmCtm = getClientCTM(state.minimapSvg);
    if (!ctm || !mmCtm) return;

    const inv = ctm.inverse();
    const toViewBox = (screenX, screenY) => {
      const p = clone.createSVGPoint();
      p.x = screenX;
      p.y = screenY;
      return p.matrixTransform(inv);
    };
    // Rotation is quantized to 90° steps, so two diagonal viewport corners
    // always span the visible rect in original coordinates.
    const p1 = toViewBox(vpRect.left, vpRect.top);
    const p2 = toViewBox(vpRect.right, vpRect.bottom);
    // Clamp in the SNAPSHOT's coordinate space (rotate.js rewrites the live
    // clone's viewBox to the rotated bounds, so d may be axis-swapped).
    const mmVb = state.minimapSvg.viewBox?.baseVal;
    const spanX = mmVb?.x || 0;
    const spanY = mmVb?.y || 0;
    const spanW = mmVb?.width || d.width;
    const spanH = mmVb?.height || d.height;
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const minX = clamp(Math.min(p1.x, p2.x), spanX, spanX + spanW);
    const maxX = clamp(Math.max(p1.x, p2.x), spanX, spanX + spanW);
    const minY = clamp(Math.min(p1.y, p2.y), spanY, spanY + spanH);
    const maxY = clamp(Math.max(p1.y, p2.y), spanY, spanY + spanH);

    // Forward-map the visible rect through the minimap snapshot's own CTM
    // (which includes its CSS rotation), then take the screen bounding box.
    // A linear width/height mapping onto the snapshot's bounding rect breaks
    // at 90°/270°, where the snapshot's axes are swapped on screen.
    const toMinimapScreen = (x, y) => {
      const p = state.minimapSvg.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(mmCtm);
    };
    const corners = [
      toMinimapScreen(minX, minY),
      toMinimapScreen(maxX, minY),
      toMinimapScreen(minX, maxY),
      toMinimapScreen(maxX, maxY),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    // The indicator is absolutely positioned, so its left/top start inside
    // the minimap's border. clientLeft/clientTop are that border's widths.
    const left = Math.min(...xs) - minimapRect.left - minimap.clientLeft;
    const top = Math.min(...ys) - minimapRect.top - minimap.clientTop;
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    viewportIndicator.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  };

  positionIndicator();
  // Animated pans (minimap clicks, double-tap reset, rotate's reset) change
  // the transform via a CSS transition, but only fire one panzoomchange at
  // call time — a rect/CTM read then captures a mid-flight position. Once the
  // longest animation (~300ms) settles, re-check whether the minimap is still
  // needed (a rotate resets to 1x, where it must hide) and re-position.
  if (_indicatorSettleTimer) clearTimeout(_indicatorSettleTimer);
  _indicatorSettleTimer = setTimeout(() => {
    _indicatorSettleTimer = null;
    if (!state.isModalOpen) return;
    const stillNeeded = diagramExceedsViewport();
    minimap.classList.toggle("show", stillNeeded);
    if (stillNeeded) positionIndicator();
  }, 350);
}

/**
 * Hide minimap
 */
export function hideMinimap() {
  const minimap = document.getElementById("diagview-minimap");
  _colourSnapshot = null;
  if (minimap) {
    minimap.classList.remove("show");
    // Clear minimap SVG reference
    if (state.minimapSvg) {
      state.minimapSvg.remove();
      state.minimapSvg = null;
    }
  }
}

/**
 * Cleanup minimap
 */
export function cleanupMinimap() {
  hideMinimap();
  // Remove click/resize handlers so next modal open re-attaches fresh
  if (_minimapListenerCleanup) _minimapListenerCleanup();
  if (_indicatorSettleTimer) {
    clearTimeout(_indicatorSettleTimer);
    _indicatorSettleTimer = null;
  }
}
