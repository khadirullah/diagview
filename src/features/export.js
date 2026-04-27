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
  loadScript,
} from "../core/utils.js";
import { cloneSVGForExport } from "../core/svg-clone.js";
import { showSuccessToast, showErrorToast, showInfoToast } from "../ui/toast.js";

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
  const titleEl = svg.querySelector("title, text.title, text.titleText, text.diagview-title");
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
  const vw = d.w + padding * 2;
  const vh = d.h + padding * 2;

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

  // (Background color relies dynamically on canvas rendering for PNG-T support)

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

  // CRITICAL FIX (Bug #20): Do NOT reset internal group transforms.
  // We rely on getRobustDimensions (BBox) and the viewBox to frame the content.
  // Resetting group transforms here would break diagrams (like Mermaid) that
  // use root groups for internal positioning/padding.

  // Fix for potential canvas tainting from external images
  const images = exportSvg.querySelectorAll("image");
  images.forEach((img) => {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href");
    if (href && (href.startsWith("http") || href.startsWith("//"))) {
      img.setAttribute("crossorigin", "anonymous");
    }
  });

  return { width, height, bg: theme.bg, svg: exportSvg };
}

/**
 * Generic Canvas renderer
 */
export async function renderToCanvas(sourceElement, modalClone, transparent = false) {
  const originalSvg = sourceElement.querySelector("svg");
  if (!originalSvg) throw new Error("No SVG found");

  const { width, height, bg, svg: finalSvg } = prepareSvgForExport(originalSvg, modalClone);

  // Calculate Scale (High Res by default)
  const isMobile = isMobileDevice();
  // FORCE 2x MINIMUM for desktop to avoid blurriness, unless config says otherwise
  let scale = isMobile
    ? state.config.mobileScale || EXPORT.MOBILE_SCALE_DEFAULT
    : state.config.highResScale || EXPORT.HIGH_RES_SCALE_DEFAULT;

  // Cap pixels to prevent crash
  const targetPixels = width * scale * (height * scale);
  if (targetPixels > state.config.maxPixels) {
    scale = Math.sqrt(state.config.maxPixels / (width * height));
    console.warn(`DiagView: Auto-scaled to ${scale.toFixed(2)}x for safety`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  // Serialization Logic: Smart Hybrid Approach
  // We use Data URLs for small diagrams to bypass 'file://' origin restrictions (Maximum Compatibility)
  // We use Blob URLs for large diagrams to avoid URL length limits and browser crashes (Maximum Performance)
  const svgStr = new XMLSerializer().serializeToString(finalSvg);
  const isSmall = svgStr.length < 1000000; // ~1MB Threshold

  let url;
  let isBlob = false;

  if (isSmall || typeof URL.createObjectURL !== "function") {
    url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  } else {
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    url = URL.createObjectURL(blob);
    isBlob = true;
  }

  const img = new Image();
  // setting crossOrigin is important for external images within the SVG
  img.crossOrigin = "anonymous";

  // Promise wrapper for loading
  await new Promise((resolve, reject) => {
    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = (err) => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(new Error("Image load failed. The SVG may be too large or contain invalid data."));
    };
    img.src = url;
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
async function exportSVG(sourceElement, filename, isTransparent = false, modalClone = null) {
  try {
    const originalSvg = sourceElement.querySelector("svg");
    const { bg, svg } = prepareSvgForExport(originalSvg, modalClone);

    // Add bg rect for non-transparent SVG
    if (!isTransparent) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const vb = svg.getAttribute("viewBox");
      const vbParts = vb ? vb.split(/\s+|,/).map(parseFloat) : [0, 0];
      rect.setAttribute("x", vbParts[0] || 0);
      rect.setAttribute("y", vbParts[1] || 0);
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", "100%");
      rect.setAttribute("fill", bg);
      svg.insertBefore(rect, svg.firstChild);
    }

    const data = new XMLSerializer().serializeToString(svg);

    // Use DataURL for small SVGs to ensure filename compatibility on file://
    const isSmall = data.length < 1000000;
    const downloadUrl = isSmall
      ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data)
      : URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));

    downloadFile(downloadUrl, `${filename}.svg`);
    showSuccessToast("SVG saved");
  } catch (e) {
    showErrorToast("SVG Failed", e.message);
  }
}

/**
 * EXPORT: PNG / WebP / JPEG
 */
async function exportImage(sourceElement, filename, format, transparent, copy, modalClone) {
  try {
    const isWebP = format === "webp";
    const isJpeg = format === "jpeg" || format === "jpg";

    // JPEG doesn't support transparency, force off
    if (isJpeg) transparent = false;

    // Determine mime type and extension
    let mime = "image/png",
      ext = "png";
    if (isWebP) {
      mime = "image/webp";
      ext = "webp";
    } else if (isJpeg) {
      mime = "image/jpeg";
      ext = "jpeg";
    }

    const label = (transparent ? "Transparent " : "") + (isWebP ? "WebP" : isJpeg ? "JPEG" : "PNG");

    showInfoToast(`Processing ${label}...`);

    const { canvas, scale } = await renderToCanvas(sourceElement, modalClone, transparent);

    const quality = isWebP ? 0.95 : undefined;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), mime, quality);
    });

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
      // Download: Use DataURL for small images to ensure filename compatibility on file://
      // Use BlobURL only for massive images that would crash DataURL strings.
      const isMassive = canvas.width * canvas.height > 4000000; // ~4MP threshold
      const downloadUrl = isMassive ? URL.createObjectURL(blob) : canvas.toDataURL(mime);

      downloadFile(downloadUrl, `${filename}.${ext}`);
      showSuccessToast(`${scale.toFixed(1)}x ${label} saved`);
    }
  } catch (e) {
    console.error("DiagView Export Error:", e);

    // Handle "Tainted Canvas" security error specifically
    if (e.name === "SecurityError" || e.message?.includes("tainted")) {
      showErrorToast(
        "Export Restricted",
        "External fonts or images are blocking PNG export. Try 'SVG' export instead, or run from a web server."
      );
    } else {
      showErrorToast("Export Failed", e.message);
    }
  }
}

/**
 * EXPORT: PDF
 */
async function exportPDF(sourceElement, filename, modalClone) {
  try {
    showInfoToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    if (!window.jspdf) {
      await loadScript(pdfUrl, state.config.pdfLibraryIntegrity).catch((err) => {
        console.error("DiagView PDF Load Error:", err);
        // Integrity failure is a common cause for script load failure when hardcoded hashes are used
        showErrorToast("PDF Library Failed", "Possible Security Integrity (SRI) mismatch or Network Error.");
      });
    }

    // Fallback: If no jsPDF, save as PNG
    if (!window.jspdf) {
      console.warn("jsPDF missing, falling back to PNG");
      showInfoToast("Falling back to PNG export...");
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
export async function exportDiagram(sourceElement, mode, options = {}) {
  // Support legacy signature (element, mode, modalClone)
  if ((options && typeof options !== "object") || options?.nodeType === 1) {
    options = { modalClone: options };
  }

  const modalClone = options.modalClone || null;
  let isTransparent = options.transparent || false;

  const svg = sourceElement.querySelector("svg");
  if (!svg) return showErrorToast("No diagram found");

  const filename = generateFilename(svg);

  // Parse legacy modes mapping
  if (mode === "png-transparent") {
    mode = "png";
    isTransparent = true;
  }
  if (mode === "webp-transparent") {
    mode = "webp";
    isTransparent = true;
  }
  if (mode === "download") {
    mode = "png";
  }

  switch (mode) {
    case "svg":
      return exportSVG(sourceElement, filename, isTransparent, modalClone);
    case "copy":
      return exportImage(sourceElement, filename, "png", false, true, modalClone);
    case "jpeg":
      return exportImage(sourceElement, filename, "jpeg", false, false, modalClone);
    case "png":
      return exportImage(sourceElement, filename, "png", isTransparent, false, modalClone);
    case "webp":
      return exportImage(sourceElement, filename, "webp", isTransparent, false, modalClone);
    case "pdf":
      return exportPDF(sourceElement, filename, modalClone);
    default:
      return exportImage(sourceElement, filename, "png", false, false, modalClone);
  }
}
