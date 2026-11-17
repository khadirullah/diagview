/**
 * Make the SVG copy an export draws or saves, and turn it into markup
 * @module features/export/prepare
 */

import { state } from "../../core/config.js";
import { loadChunk } from "../../core/lifecycle.js";
import { EXPORT } from "../../core/constants.js";
import { detectTheme } from "../../core/theme.js";
import { getRobustDimensions } from "../../core/utils.js";
import { embedDocumentFonts } from "../export-fonts.js";
import { cloneSVGForExportAsync, exportSecurity } from "../../core/svg-clone.js";
import { injectWatermark } from "./watermark.js";

/**
 * Prepare SVG for export.
 *  1. Clone from the modal clone when one is given (the floating menu always
 *     passes it) so the export matches what the user sees; fall back to the
 *     original page SVG otherwise
 *  2. Set explicit px dimensions, never "100%" (avoids intrinsic-size=0 in <img>)
 *  3. Wait for fonts → embed them → consistent text metrics
 * @private
 * @param {SVGSVGElement} svg - Original page SVG
 * @param {SVGSVGElement|null} modalClone - Modal clone, preferred as the source when present
 * @param {boolean} [transparent] - The file has no background
 * @param {boolean} [silent] - No warnings, so no check for hard-to-read labels
 */
export async function prepareSvgForExport(svg, modalClone, transparent, silent) {
  const theme = detectTheme();
  const bg = transparent ? null : theme.bg;

  // Wait for fonts to load so BBox / computed styles are stable
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Use modalClone for dimensions and content if available to ensure fidelity
  const sourceSvg = modalClone || svg;
  const d = getRobustDimensions(sourceSvg);

  const zoomCushion = Math.max(d.w, d.h) * 0.05;
  const padding = Math.max(EXPORT.SVG_EXPORT_PADDING / 2, zoomCushion);

  // The file is a whole number of pixels, so the view grows to match on
  // each side. A fractional view in a rounded size left a sliver along one
  // edge outside the background.
  const width = Math.ceil(d.w + padding * 2);
  const height = Math.ceil(d.h + padding * 2);
  const vx = d.x - (width - d.w) / 2;
  const vy = d.y - (height - d.h) / 2;

  // CRITICAL FIX: Use sourceSvg (modalClone if in fullscreen)
  // With Readable on, a file with a background gets the colours Readable
  // picks for that background. A transparent file keeps the author's
  // colours, as light text would vanish on a white page. The clone reads
  // styles and copies the DOM before its first await, so the view's own
  // recolours are off for both.
  // With exportSearchHighlight off, the search class comes off while the
  // clone reads styles, so the file has no dimming or outline. The on-screen
  // search is put back before anything can repaint.
  // With Readable off, the same check finds labels straight on the
  // background that will be hard to read in the file. A silent export shows
  // no warning, so it skips the check.
  let hideSearch = false;
  let faint = false;
  const cloneSource = (paint) => {
    hideSearch =
      !state.config.exportSearchHighlight && sourceSvg.classList?.contains("dv-searching");
    if (hideSearch) sourceSvg.classList.remove("dv-searching");
    try {
      return cloneSVGForExportAsync(sourceSvg, paint);
    } finally {
      if (hideSearch) sourceSvg.classList.add("dv-searching");
    }
  };
  // The readable text chunk is needed to recolour labels with Readable on,
  // to find faint labels for the warning a silent export never shows, or
  // to put back labels Readable has changed on the page
  const recolour = bg && state.readableText;
  const checkFaint = bg && !silent;
  const restoreLabels = sourceSvg.querySelector?.("[data-dv-text-orig]");
  const exportSvg = await (recolour || checkFaint || restoreLabels
    ? loadChunk("readable text", () => import("../lazy/readable-text.js")).then((m) => {
        const made = m.exportText(sourceSvg, bg, cloneSource);
        faint = made.faint;
        return made.clone;
      })
    : cloneSource(null));

  if (!exportSvg) return null;

  if (hideSearch) {
    for (const el of exportSvg.querySelectorAll(".dv-search-match, .dv-search-current")) {
      el.classList.remove("dv-search-match", "dv-search-current");
      if (!el.classList.length) el.removeAttribute("class");
    }
  }

  // Embed fonts so text metrics match the original browser render
  const { mode, allowRemoteResources } = exportSecurity(sourceSvg);
  await embedDocumentFonts(
    exportSvg,
    state.config.exportFonts,
    mode === "strict" && !allowRemoteResources,
  );

  // Set explicit dimensions as ATTRIBUTES (not CSS — CSS "100%" breaks img intrinsic size)
  exportSvg.setAttribute("viewBox", `${vx} ${vy} ${width} ${height}`);
  exportSvg.setAttribute("width", String(width));
  exportSvg.setAttribute("height", String(height));
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // CRITICAL FIX: clear ALL inline styles on the root element.
  // The original code set style.width="100%" which overrides the width attribute
  // when loaded as <img>, causing the SVG to have no intrinsic size → clipping.
  exportSvg.style.cssText = "";
  exportSvg.removeAttribute("transform");

  // Inject watermark if enabled (Silent Branding)
  injectWatermark(exportSvg, d, svg, padding);

  return { width, height, bg: theme.bg, svg: exportSvg, faint: faint ? sourceSvg : null };
}

/**
 * Helper to serialize SVG to string asynchronously to avoid UI blocking
 * @private
 */
export async function serializeSVGAsync(svgEl) {
  return new Promise((resolve, reject) => {
    // A throw inside the callback would never reach the promise, so reject
    // here or the export waits forever
    const serialize = () => {
      try {
        resolve(new XMLSerializer().serializeToString(svgEl));
      } catch (e) {
        reject(e);
      }
    };
    // Use MessageChannel to yield to the event loop before heavy serialization
    // This ensures UI updates (like toasts) are rendered before the CPU spike
    if (typeof MessageChannel !== "undefined") {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => {
        port1.close();
        serialize();
      };
      port2.postMessage(null);
    } else {
      // Fallback for environments without MessageChannel (like Node/JSDOM tests)
      setTimeout(serialize, 0);
    }
  });
}
