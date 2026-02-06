/**
 * DiagView Export Functionality - REFINED
 * Uses robust sizing logic to fix low-res exports
 * @module features/export
 */

import { state } from "../core/config.js";
import { EXPORT, COLORS } from "../core/constants.js";
import { detectTheme } from "../core/theme.js";
import {
  downloadFile,
  sanitizeFilename,
  getTimestamp,
  isMobileDevice,
  isClipboardAvailable,
  getClipboardError,
  loadScript,
} from "../core/utils.js";
import { cloneSVGForExport } from "../core/svg-clone.js";
import {
  showSuccessToast,
  showErrorToast,
  showInfoToast,
} from "../ui/toast.js";

/**
 * Robust dimension calculator
 * Prioritizes BBox to ensure we capture the actual visible content area,
 * preventing alignment issues if the diagram doesn't start at 0,0.
 */
function getRobustDimensions(svg) {
  // 1. Try BBox (Best for centering content)
  // We prioritize this because we want to know where the *ink* is, not just the canvas size.
  try {
    const bbox = svg.getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height, src: "bbox" };
    }
  } catch (e) {
    // Ignore BBox errors (e.g. valid in JSDOM or if not attached)
  }

  // 2. Try viewBox
  if (svg.hasAttribute("viewBox")) {
    const vb = svg.getAttribute("viewBox").split(/\s+|,/).map(parseFloat);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      return { x: vb[0], y: vb[1], w: vb[2], h: vb[3], src: "viewBox" };
    }
  }

  // 3. Fallback to client rect (0,0 assumed)
  const rect = svg.getBoundingClientRect();
  return { x: 0, y: 0, w: rect.width || 1000, h: rect.height || 1000, src: "rect" };
}

/**
 * Generate filename
 */
export function generateFilename(svg) {
  const titleEl = svg.querySelector("title, text[class*='title']");
  let rawTitle = titleEl ? titleEl.textContent : "";

  if (!rawTitle) {
    const wrapper = svg.closest(".diagview-wrapper");
    const label = wrapper?.querySelector(".diagview-label");
    rawTitle = label ? label.textContent : "diagram";
  }

  const cleanTitle = sanitizeFilename(rawTitle, "diagram");
  const finalName = cleanTitle === "diagram" ? "diagram_export" : cleanTitle;
  return `${finalName}_${getTimestamp()}`;
}

/**
 * Prepare SVG for export
 */
function prepareSvgForExport(svg, modalClone) {
  const theme = detectTheme();

  // Use robust dimensions - Capture the TRUE content bounds
  const d = getRobustDimensions(svg);

  // Padding (5% or minimum 20px)
  // We use a slightly generous padding to ensure labels near the edge aren't cut off
  const zoomCushion = Math.max(d.w, d.h) * 0.05;
  const padding = Math.max(EXPORT.SVG_EXPORT_PADDING / 2, zoomCushion);

  // New ViewBox calculations
  // Center: x - padding, y - padding
  const vx = d.x - padding;
  const vy = d.y - padding;
  const vw = d.w + (padding * 2);
  const vh = d.h + (padding * 2);

  const width = vw;
  const height = vh;

  // Create final exportable SVG
  const source = modalClone || svg;

  // Use centralized cloning function for consistent style baking
  const exportSvg = cloneSVGForExport(source);

  // Set sizing - Explicitly set viewBox to center content
  exportSvg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  exportSvg.setAttribute("width", width);
  exportSvg.setAttribute("height", height);
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Apply theme background for consistent appearance
  exportSvg.style.background = theme.bg;

  // CRITICAL FIX: Reset Zoom/Pan Transforms
  // We must strip any zoom/pan transforms to export the "clean" full diagram.
  exportSvg.style.transform = "none";
  exportSvg.removeAttribute("transform");
  exportSvg.style.transformOrigin = "center center";
  exportSvg.style.margin = "0";
  exportSvg.style.position = "static";

  // Reset dimensions to ensure it fits the canvas logic
  exportSvg.style.width = "100%";
  exportSvg.style.height = "100%";
  exportSvg.style.maxWidth = "none";
  exportSvg.style.maxHeight = "none";
  exportSvg.style.minWidth = "0";
  exportSvg.style.minHeight = "0";

  // If the diagram uses an internal group for panning, reset that too.
  const rootGroups = exportSvg.querySelectorAll(":scope > g[transform]");
  rootGroups.forEach(g => {
    if (g.classList.contains('svg-pan-zoom_viewport')) {
      g.setAttribute('transform', 'matrix(1,0,0,1,0,0)');
    }
  });

  return { width, height, bg: theme.bg, svg: exportSvg };
}

/**
 * Generic Canvas renderer
 */
async function renderToCanvas(sourceElement, modalClone, transparent = false) {
  const originalSvg = sourceElement.querySelector("svg");
  if (!originalSvg) throw new Error("No SVG found");

  const { width, height, bg, svg: finalSvg } = prepareSvgForExport(originalSvg, modalClone);

  // Calculate Scale (High Res by default)
  const isMobile = isMobileDevice();
  // FORCE 2x MINIMUM for desktop to avoid blurriness, unless config says otherwise
  let scale = isMobile
    ? (state.config.mobileScale || EXPORT.MOBILE_SCALE_DEFAULT)
    : (state.config.highResScale || EXPORT.HIGH_RES_SCALE_DEFAULT);

  // Cap pixels to prevent crash
  const targetPixels = (width * scale) * (height * scale);
  if (targetPixels > state.config.maxPixels) {
    scale = Math.sqrt(state.config.maxPixels / (width * height));
    console.warn(`DiagView: Auto-scaled to ${scale.toFixed(2)}x for safety`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  // Serialization
  const svgStr = new XMLSerializer().serializeToString(finalSvg);
  const img = new Image();
  img.crossOrigin = "anonymous";

  // Promise wrapper for loading
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  });

  // Draw
  if (!transparent) {
    ctx.fillStyle = bg || COLORS.BG_LIGHT;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Smooth scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, scale, width, height };
}

/**
 * EXPORT: SVG
 */
async function exportSVG(sourceElement, filename, modalClone) {
  try {
    const originalSvg = sourceElement.querySelector("svg");
    const { bg, svg } = prepareSvgForExport(originalSvg, modalClone);

    // Add bg rect for non-transparent SVG 
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", svg.getAttribute("viewBox").split(" ")[0]); // Match viewBox origin
    rect.setAttribute("y", svg.getAttribute("viewBox").split(" ")[1]);
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", bg);
    svg.insertBefore(rect, svg.firstChild);

    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    downloadFile(URL.createObjectURL(blob), `${filename}.svg`);
    showSuccessToast("SVG saved");
  } catch (e) {
    showErrorToast("SVG Failed", e.message);
  }
}

/**
 * EXPORT: PNG / WebP
 */
async function exportImage(sourceElement, filename, format, transparent, copy, modalClone) {
  try {
    // Determine mime type and extension
    const isWebP = format === "webp";
    const mime = isWebP ? "image/webp" : "image/png";
    const ext = isWebP ? "webp" : "png";
    const label = (transparent ? "Transparent " : "") + (isWebP ? "WebP" : "PNG");

    showInfoToast(`Processing ${label}...`);

    const { canvas, scale } = await renderToCanvas(sourceElement, modalClone, transparent);

    canvas.toBlob(async (blob) => {
      if (!blob) throw new Error("Encoding failed");

      if (copy) {
        // Clipboard (PNG only usually)
        if (!isClipboardAvailable() || isWebP) {
          downloadFile(canvas.toDataURL(mime), `${filename}.${ext}`);
          showSuccessToast(`${label} downloaded (Clipboard unavailable)`);
        } else {
          await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
          showSuccessToast("Copied to clipboard!");
        }
      } else {
        // Download
        downloadFile(URL.createObjectURL(blob), `${filename}.${ext}`);
        showSuccessToast(`${scale.toFixed(1)}x ${label} saved`);
      }
    }, mime, isWebP ? 0.95 : undefined);

  } catch (e) {
    console.error(e);
    showErrorToast("Export Failed", e.message);
  }
}

/**
 * EXPORT: PDF
 */
async function exportPDF(sourceElement, filename, modalClone) {
  try {
    showInfoToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    if (!window.jspdf) await loadScript(pdfUrl).catch(() => null);

    // Fallback: If no jsPDF, save as PNG
    if (!window.jspdf) {
      console.warn("jsPDF missing, falling back to PNG-as-PDF");
      await exportImage(sourceElement, filename, "png", false, false, modalClone);
      return;
    }

    const { canvas, width, height } = await renderToCanvas(sourceElement, modalClone, false);
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF(width > height ? "l" : "p", "px", [width, height]);
    pdf.addImage(imgData, "PNG", 0, 0, width, height, undefined, "FAST");
    pdf.save(`${filename}.pdf`);
    showSuccessToast("PDF saved");

  } catch (e) {
    showErrorToast("PDF Failed", e.message);
  }
}

/**
 * Main Export Handler
 */
export async function exportDiagram(sourceElement, mode, modalClone = null) {
  const svg = sourceElement.querySelector("svg");
  if (!svg) return showErrorToast("No diagram found");

  const filename = generateFilename(svg);

  switch (mode) {
    case "svg": return exportSVG(sourceElement, filename, modalClone);
    case "copy": return exportImage(sourceElement, filename, "png", false, true, modalClone);
    case "png":
    case "download": return exportImage(sourceElement, filename, "png", false, false, modalClone);
    case "png-transparent": return exportImage(sourceElement, filename, "png", true, false, modalClone);
    case "webp": return exportImage(sourceElement, filename, "webp", false, false, modalClone);
    case "webp-transparent": return exportImage(sourceElement, filename, "webp", true, false, modalClone);
    case "pdf": return exportPDF(sourceElement, filename, modalClone);
    default: return exportImage(sourceElement, filename, "png", false, false, modalClone);
  }
}
