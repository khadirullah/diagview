/**
 * Warnings and saved-file notices for exports
 * @module features/export/notices
 */

import { detectTheme, getContrastRatio } from "../../core/theme.js";
import { showSuccessToast, showWarningToast } from "../../ui/toast.js";

/** Sources whose export already warned about hard-to-read labels */
const warnedFaint = new WeakSet();

/**
 * Advice for labels that will be hard to read in the file. Once per viewer
 * open, as each open has a new modal clone, and once per page diagram
 * for toolbar exports.
 * @private
 * @param {SVGSVGElement|null} source - SVG the export came from, null when the labels read fine
 * @param {boolean} [silent] - Skip the warning
 * @returns {string} The advice, or "" when there is nothing to say
 */
function faintAdvice(source, silent) {
  if (!source || silent || warnedFaint.has(source)) return "";
  warnedFaint.add(source);
  // Light helps only on a background where white text reads better than black
  const { bg } = detectTheme();
  const light =
    getContrastRatio(bg, "#fff") >= getContrastRatio(bg, "#000") ? ", or pick Light," : "";
  return `Turn on Readable${light} and export again.`;
}

/**
 * Count the images an image or PDF file will lack. The browser draws the
 * SVG as an image and loads nothing it links to, so only data: images get in.
 * @private
 * @param {SVGSVGElement} svg - The copy that gets drawn
 * @returns {number} Linked <image> elements and <img> in HTML labels
 */
export function countLinkedImages(svg) {
  let n = 0;
  for (const el of svg.querySelectorAll("image, img")) {
    const url = (
      el.getAttribute("href") ||
      el.getAttribute("xlink:href") ||
      el.getAttribute("src") ||
      ""
    ).trim();
    if (url && !/^data:/i.test(url)) n++;
  }
  return n;
}

/**
 * Whether the copy links an image or resource on another site. Only such a
 * link can explain a canvas the browser will not let DiagView read back.
 * @private
 * @param {SVGSVGElement} svg - The copy that gets drawn
 * @returns {boolean} True for an image, <use>, CSS url() or @import on another origin
 */
export function linksOtherSite(svg) {
  const urls = [];
  for (const el of svg.querySelectorAll("image, img, use, feImage")) {
    urls.push(el.getAttribute("href") || el.getAttribute("xlink:href") || el.getAttribute("src"));
  }
  for (const el of svg.querySelectorAll("style, [style]")) {
    const css = el.localName === "style" ? el.textContent : el.getAttribute("style");
    for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)|@import\s+["']([^"']+)/gi)) {
      urls.push(m[1] || m[2]);
    }
  }
  return urls.some((url) => {
    if (!url || /^\s*data:/i.test(url)) return false;
    try {
      return new URL(url.trim(), location.href).origin !== location.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Show the saved or copied notice. Only one notice shows at a time, so a
 * warning about labels that are hard to read, or about linked images left
 * out of the file, takes its place and says the file was saved too.
 * silent skips both warnings.
 * @private
 * @param {string} message - The notice for a complete file
 * @param {object} [found] - What the export found
 * @param {number} [found.linked] - Linked images the file lacks
 * @param {SVGSVGElement|null} [found.faint] - Source whose labels are hard to read
 * @param {boolean} [found.silent] - Skip the warnings
 * @param {string} [found.kind] - What the file is, for the linked images warning
 * @param {boolean} [found.warn] - Show the plain notice as a warning
 */
export function showSaved(
  message,
  { linked = 0, faint = null, silent = false, kind = "image", warn = false } = {},
) {
  const advice = faintAdvice(faint, silent);
  if (linked && !silent) {
    const images = linked === 1 ? "1 linked image was" : `${linked} linked images were`;
    const done = `${message.replace(/!$/, "")}, but ${images} left out`;
    return showWarningToast(
      advice
        ? `${done} and some labels are hard to read on this background. ${advice}`
        : `${done}. Only embedded images can go into ${kind} files.`,
    );
  }
  if (advice) {
    return showWarningToast(
      `${message.replace(/!$/, "")}, but some labels are hard to read on this background. ${advice}`,
    );
  }
  (warn ? showWarningToast : showSuccessToast)(message);
}
