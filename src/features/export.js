/**
 * DiagView Export Functionality - REFINED
 * Uses robust sizing logic to fix low-res exports
 * @module features/export
 */

import { state } from "../core/config.js";
import { EXPORT, COLORS, TIMING } from "../core/constants.js";
import { detectTheme } from "../core/theme.js";
import {
  downloadFile,
  sanitizeFilename,
  getTimestamp,
  isMobileDevice,
  isClipboardAvailable,
  loadScript,
  getRobustDimensions,
} from "../core/utils.js";
import { cloneSVGForExportAsync } from "../core/svg-clone.js";
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from "../ui/toast.js";

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
 * Fetch a URL and return a base64 data URI, or null on failure.
 * Used to embed fonts so export SVGs render consistently.
 * @private
 */
async function fetchAsDataURI(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(url, { mode: "cors", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Collect @font-face rules from loaded document stylesheets
 * and embed referenced font files as base64 data URIs.
 * Mutates the SVG element's first/new <style> block.
 * @private
 */
async function embedDocumentFonts(svgEl) {
  if (typeof document === "undefined" || !document.fonts) return;

  // Wait for all fonts to be loaded before reading metrics / before export
  await document.fonts.ready;

  const fontFaceRules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          fontFaceRules.push(rule.cssText);
        }
      }
    } catch {
      // cross-origin stylesheets — skip
    }
  }

  if (!fontFaceRules.length) return;

  // Fetch and inline font files referenced by url(...)
  const inlined = await Promise.all(
    fontFaceRules.map(async (cssText) => {
      // Replace each url("https://...") with a base64 data URI
      const urlMatches = [...cssText.matchAll(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/gi)];
      let result = cssText;
      for (const [match, rawUrl] of urlMatches) {
        const dataURI = await fetchAsDataURI(rawUrl);
        if (dataURI) {
          result = result.replace(match, `url('${dataURI}')`);
        }
      }
      return result;
    }),
  );

  // Prepend a <style> with embedded @font-face rules to the SVG
  let styleEl = svgEl.querySelector("style.dv-font-embed");
  if (!styleEl) {
    styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.classList.add("dv-font-embed");
    svgEl.insertBefore(styleEl, svgEl.firstChild);
  }
  styleEl.textContent = inlined.join("\n");
}

/**
 * Injects a watermark into the SVG for branding during export.
 * Supports "background" (centered/rotated) and "corner" styles.
 * @private
 */
function injectWatermark(svg, d) {
  if (!(svg instanceof SVGElement)) return;

  // 1. Start with global config
  const config = { ...state.config.watermark };

  // 2. Apply element-level overrides if available (A1)
  // We use state.activeSourceElement as it's the original diagram container
  const el = state.activeSourceElement;
  if (el && el.dataset) {
    const dataset = el.dataset;
    if (dataset.diagviewWatermark) config.enabled = dataset.diagviewWatermark === "true";
    if (dataset.diagviewWatermarkText) config.text = dataset.diagviewWatermarkText;
    if (dataset.diagviewWatermarkStyle) config.style = dataset.diagviewWatermarkStyle;
    if (dataset.diagviewWatermarkPos) config.position = dataset.diagviewWatermarkPos;
    if (dataset.diagviewWatermarkOpacity) {
      const n = parseFloat(dataset.diagviewWatermarkOpacity);
      if (!isNaN(n)) config.opacity = n;
    }
  }

  // Final validation before processing
  if (!config || !config.enabled || !config.text || !d || d.w <= 0 || d.h <= 0) return;

  // Detect theme for contrasting color
  const theme = detectTheme();
  const mainColor = theme.isDark ? "#ffffff" : "#000000";
  const contrastColor = theme.isDark ? "#000000" : "#ffffff";

  const style = (config.style || "corner").toLowerCase();
  const pos = (
    config.position || (style === "background" ? "center" : "bottom-right")
  ).toLowerCase();
  const opacity = config.opacity ?? (style === "background" ? 0.15 : 0.2);

  const createWatermarkElement = (fontSize, textOpacity, maxWidth = 0) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = config.text;
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");

    // Safe-Fit Scaling: Automatically fit text to available width without distortion
    let effectiveFontSize = fontSize;
    if (maxWidth > 0) {
      const charWidthRatio = 0.6; // Average for bold sans-serif
      const estimatedWidth = config.text.length * (fontSize * charWidthRatio);
      if (estimatedWidth > maxWidth) {
        effectiveFontSize = maxWidth / config.text.length / charWidthRatio;
      }
    }

    text.setAttribute("font-size", `${effectiveFontSize}px`);
    text.setAttribute("fill", mainColor);
    text.setAttribute("stroke", contrastColor);
    text.setAttribute("stroke-width", String(effectiveFontSize * 0.05));
    text.setAttribute("paint-order", "stroke");
    text.setAttribute("fill-opacity", String(textOpacity));
    text.setAttribute("stroke-opacity", String(textOpacity * 0.5));
    text.setAttribute("pointer-events", "none");
    text.style.userSelect = "none";

    return text;
  };

  const addAt = (el, x, y, anchor, rotation = 0) => {
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("text-anchor", anchor);
    if (rotation) {
      el.setAttribute("transform", `rotate(${rotation}, ${x}, ${y})`);
    }
    svg.appendChild(el);
  };

  // 1. BACKGROUND / CENTERED LAYER (Large & Protective)
  if (style === "background" || style === "both" || pos === "center") {
    const angleRad = -30 * (Math.PI / 180);
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));

    // Calculate the maximum possible length that fits in the box at this angle
    // L_max = min(W / cos(alpha), H / sin(alpha))
    const maxLen = Math.min(d.w / cosA, d.h / sinA) * 0.9;

    const fontSize = maxLen * 0.12;
    const bgOpacity = style === "both" ? opacity * 0.6 : opacity;

    const el = createWatermarkElement(fontSize, bgOpacity, maxLen);
    const centerX = d.x + d.w / 2;
    const centerY = d.y + d.h / 2;
    el.setAttribute("dominant-baseline", "middle");
    addAt(el, centerX, centerY, "middle", -30);
  }

  // 2. CORNER / SIDES LAYER (Small & Professional)
  if (style === "corner" || style === "both") {
    const maxDim = Math.max(d.w, d.h);
    const fontSize = maxDim * 0.025; // Always small relative to diagram
    const margin = fontSize;
    const sideOpacity = style === "both" ? opacity * 0.8 : opacity;

    if (pos === "four-sides") {
      const sides = [
        { x: d.x + d.w / 2, y: d.y + margin + fontSize, anchor: "middle", max: d.w * 0.5 },
        { x: d.x + d.w / 2, y: d.y + d.h - margin, anchor: "middle", max: d.w * 0.5 },
        { x: d.x + margin, y: d.y + d.h / 2, anchor: "middle", rot: -90, max: d.h * 0.5 },
        { x: d.x + d.w - margin, y: d.y + d.h / 2, anchor: "middle", rot: 90, max: d.h * 0.5 },
      ];

      sides.forEach((p) => {
        const el = createWatermarkElement(fontSize, sideOpacity, p.max);
        addAt(el, p.x, p.y, p.anchor, p.rot);
      });
    } else if (pos !== "center") {
      const cornerMaxWidth = d.w * 0.35; // Strict corner limit
      const el = createWatermarkElement(fontSize, sideOpacity, cornerMaxWidth);

      let x, y, anchor;
      if (pos.includes("right")) {
        x = d.x + d.w - margin;
        anchor = "end";
      } else {
        x = d.x + margin;
        anchor = "start";
      }

      if (pos.includes("bottom")) {
        y = d.y + d.h - margin;
      } else {
        y = d.y + margin + fontSize;
      }
      addAt(el, x, y, anchor);
    }
  }
}

/**
 * Prepare SVG for export.
 * KEY CHANGES vs original:
 *  1. Always clone from ORIGINAL page SVG (not modal clone) → correct CSS context
 *  2. Set explicit px dimensions, never "100%" (avoids intrinsic-size=0 in <img>)
 *  3. Wait for fonts → embed them → consistent text metrics
 * @private
 */
async function prepareSvgForExport(svg, modalClone) {
  const theme = detectTheme();

  // Wait for fonts to load so BBox / computed styles are stable
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Use modalClone for dimensions and content if available to ensure fidelity
  const sourceSvg = modalClone || svg;
  const d = getRobustDimensions(sourceSvg);

  const zoomCushion = Math.max(d.w, d.h) * 0.05;
  const padding = Math.max(EXPORT.SVG_EXPORT_PADDING / 2, zoomCushion);

  const vx = d.x - padding;
  const vy = d.y - padding;
  const vw = d.w + padding * 2;
  const vh = d.h + padding * 2;
  const width = vw;
  const height = vh;

  // CRITICAL FIX: Use sourceSvg (modalClone if in fullscreen)
  const exportSvg = await cloneSVGForExportAsync(sourceSvg);

  if (!exportSvg) return null;

  // Embed fonts so text metrics match the original browser render
  await embedDocumentFonts(exportSvg);

  // Set explicit dimensions as ATTRIBUTES (not CSS — CSS "100%" breaks img intrinsic size)
  exportSvg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  exportSvg.setAttribute("width", String(Math.round(width)));
  exportSvg.setAttribute("height", String(Math.round(height)));
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // CRITICAL FIX: clear ALL inline styles on the root element.
  // The original code set style.width="100%" which overrides the width attribute
  // when loaded as <img>, causing the SVG to have no intrinsic size → clipping.
  exportSvg.style.cssText = "";
  exportSvg.removeAttribute("transform");

  // Prevent stale Panzoom matrix on root (defensive)
  const firstGroup = exportSvg.querySelector("g[style*='transform']");
  if (firstGroup) {
    const ts = firstGroup.style.transform;
    if (ts && ts !== "none" && !ts.includes("rotate")) {
      // Only clear Panzoom matrix transforms; preserve SVG structural transforms
      firstGroup.style.removeProperty("transform");
    }
  }

  // Fix cross-origin images inside the SVG
  exportSvg.querySelectorAll("image").forEach((img) => {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (/^https?:\/\//.test(href)) img.setAttribute("crossorigin", "anonymous");
  });

  // Inject watermark if enabled (Silent Branding)
  injectWatermark(exportSvg, d);

  return { width, height, bg: theme.bg, svg: exportSvg };
}

/**
 * Helper to serialize SVG to string asynchronously to avoid UI blocking
 * @private
 */
async function serializeSVGAsync(svgEl) {
  return new Promise((resolve) => {
    // Use MessageChannel to yield to the event loop before heavy serialization
    // This ensures UI updates (like toasts) are rendered before the CPU spike
    if (typeof MessageChannel !== "undefined") {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve(new XMLSerializer().serializeToString(svgEl));
      port2.postMessage(null);
    } else {
      // Fallback for environments without MessageChannel (like Node/JSDOM tests)
      setTimeout(() => resolve(new XMLSerializer().serializeToString(svgEl)), 0);
    }
  });
}

/**
 * Render to canvas.
 * CHANGE: always pass null as modalClone — use original SVG only.
 */
export async function renderToCanvas(sourceElement, modalClone, transparent = false) {
  const originalSvg = sourceElement.querySelector("svg");
  if (!originalSvg) throw new Error("No SVG found");

  const style = window.getComputedStyle(originalSvg);
  if (style.display === "none") {
    console.warn("DiagView: Exporting a hidden element may result in empty styles.");
  }

  // Use modalClone if available to ensure export matches browser rendering
  const result = await prepareSvgForExport(originalSvg, modalClone);
  if (!result) throw new Error("SVG preparation failed");

  const { width, height, bg, svg: finalSvg } = result;

  const isMobile = isMobileDevice();
  let scale = isMobile
    ? state.config.mobileScale || EXPORT.MOBILE_SCALE_DEFAULT
    : state.config.highResScale || EXPORT.HIGH_RES_SCALE_DEFAULT;

  const targetPixels = width * scale * (height * scale);
  if (targetPixels > state.config.maxPixels) {
    scale = Math.sqrt(state.config.maxPixels / (width * height));
    console.warn(`DiagView: Auto-scaled to ${scale.toFixed(2)}x for safety`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  const svgStr = await serializeSVGAsync(finalSvg);
  const isSmall = svgStr.length < EXPORT.LARGE_FILE_THRESHOLD;

  let url,
    isBlob = false;
  if (isSmall || typeof URL.createObjectURL !== "function") {
    url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  } else {
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    url = URL.createObjectURL(blob);
    isBlob = true;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";

  // Set explicit dimensions on the img element to guarantee correct natural size
  img.width = Math.round(width);
  img.height = Math.round(height);

  await new Promise((resolve, reject) => {
    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = (_err) => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(new Error("Image load failed. SVG may be too large or contain invalid data."));
    };
    img.src = url;
  });

  if (!transparent) {
    ctx.fillStyle = bg || COLORS.BG_LIGHT;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, scale, width, height };
}

/**
 * Export as SVG
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {object} [options={}] - Export options
 */
export async function exportToSVG(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  const isTransparent = options.transparent || false;
  const modalClone = options.modalClone || null;

  try {
    const originalSvg = sourceElement.querySelector("svg");
    const { bg, svg } = await prepareSvgForExport(originalSvg, modalClone);

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

    const data = await serializeSVGAsync(svg);

    // Use DataURL for small SVGs to ensure filename compatibility on file://
    const isSmall = data.length < EXPORT.LARGE_FILE_THRESHOLD;
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
 * Internal Image Export Processor
 */
async function processImageExport(
  sourceElement,
  filename,
  format,
  transparent,
  copy,
  modalClone,
  silent = false,
) {
  try {
    const isWebP = format === "webp";
    const isJpeg = format === "jpeg" || format === "jpg";

    // Determine mime type and extension
    let mime = "image/png";
    let ext = "png";

    if (isWebP) {
      mime = "image/webp";
      ext = "webp";
    } else if (isJpeg) {
      mime = "image/jpeg";
      ext = "jpeg";
    }

    let label = (transparent ? "Transparent " : "") + (isWebP ? "WebP" : isJpeg ? "JPEG" : "PNG");

    // JPEG doesn't support transparency, auto-switch to PNG for better UX
    if (isJpeg && transparent) {
      label = "Transparent PNG";
      mime = "image/png";
      ext = "png";
      if (!silent) {
        showWarningToast("JPEGs don't support transparency. Switched to Transparent PNG for you.");
      }
    } else if (!silent) {
      showInfoToast(`Processing ${label}...`);
    }

    // Small delay to ensure toast renders before heavy canvas work
    await new Promise((resolve) => setTimeout(resolve, TIMING.RENDER_DELAY));

    let canvasRef = null;
    try {
      const { canvas, scale } = await renderToCanvas(sourceElement, modalClone, transparent);
      canvasRef = canvas;

      const quality = isWebP ? 0.95 : undefined;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
          mime,
          quality,
        );
      });

      if (copy) {
        // Clipboard (PNG only usually)
        if (!isClipboardAvailable() || isWebP) {
          // Fallback to download if clipboard fails
          const url = URL.createObjectURL(blob);
          downloadFile(url, `${filename}.${ext}`);
          setTimeout(() => URL.revokeObjectURL(url), TIMING.CLEANUP_DELAY);
          showSuccessToast(`${label} downloaded (Clipboard unavailable)`);
        } else {
          await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
          showSuccessToast("Copied to clipboard!");
        }
      } else {
        // Download: Use BlobURL for maximum stability
        const downloadUrl = URL.createObjectURL(blob);
        downloadFile(downloadUrl, `${filename}.${ext}`);
        // Revoke after a short delay to ensure browser has started the download
        setTimeout(() => URL.revokeObjectURL(downloadUrl), TIMING.BUTTON_SUCCESS_DURATION);
        showSuccessToast(`${scale.toFixed(1)}x ${label} saved`);
      }
    } finally {
      // DOM-4: Release canvas memory immediately
      if (canvasRef) {
        canvasRef.width = 0;
        canvasRef.height = 0;
      }
    }
  } catch (e) {
    console.error("DiagView Export Error:", e);

    // Handle "Tainted Canvas" security error specifically
    if (e.name === "SecurityError" || e.message?.includes("tainted")) {
      showErrorToast(
        "Export blocked by cross-origin image",
        "An embedded image from another domain blocked canvas export. " +
          "Use SVG export instead, or ensure external images have CORS headers (Access-Control-Allow-Origin: *).",
      );
    } else {
      showErrorToast("Export Failed", e.message);
    }
  }
}

/**
 * Export as PNG
 */
export async function exportToPNG(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  return processImageExport(
    sourceElement,
    filename,
    "png",
    !!options.transparent,
    false,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Export as JPEG
 */
export async function exportToJPEG(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  return processImageExport(
    sourceElement,
    filename,
    "jpeg",
    !!options.transparent,
    false,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Export as WebP
 */
export async function exportToWebP(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  return processImageExport(
    sourceElement,
    filename,
    "webp",
    !!options.transparent,
    false,
    options.modalClone,
  );
}

/**
 * Copy to Clipboard (PNG)
 */
export async function copyToClipboard(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  return processImageExport(sourceElement, filename, "png", false, true, options.modalClone);
}

/**
 * Export as PDF
 */
export async function exportToPDF(sourceElement, options = {}) {
  const filename = options.filename || generateFilename(sourceElement.querySelector("svg"));
  const transparent = options.transparent || false;
  const modalClone = options.modalClone || null;

  try {
    showInfoToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    if (!window.jspdf) {
      await loadScript(pdfUrl, state.config.pdfLibraryIntegrity).catch(() => {
        // Silently handle load failure, the check below will trigger the fallback UI
      });
    }

    // Fallback: If no jsPDF, save as PNG
    if (!window.jspdf) {
      showInfoToast("PDF engine unavailable, falling back to PNG...");
      await exportToPNG(sourceElement, { filename, modalClone, silent: true });
      return;
    }

    if (transparent) {
      showWarningToast("PDF format does not support transparency. Using background color.");
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
      await exportToSVG(sourceElement, { filename, transparent: isTransparent, modalClone });
      break;
    case "copy":
      await copyToClipboard(sourceElement, { filename, modalClone });
      break;
    case "jpeg":
      await exportToJPEG(sourceElement, { filename, transparent: isTransparent, modalClone });
      break;
    case "png":
      await exportToPNG(sourceElement, { filename, transparent: isTransparent, modalClone });
      break;
    case "webp":
      await exportToWebP(sourceElement, { filename, transparent: isTransparent, modalClone });
      break;
    case "pdf":
      await exportToPDF(sourceElement, { filename, transparent: isTransparent, modalClone });
      break;
    default:
      await exportToPNG(sourceElement, { filename, modalClone });
  }

  // Fire onExport callback after export completes (matches onOpen/onClose pattern)
  if (state.config.onExport) {
    try {
      state.config.onExport(mode, filename);
    } catch (e) {
      console.error("DiagView: onExport callback error:", e);
    }
  }
}
