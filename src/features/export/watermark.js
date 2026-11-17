/**
 * Watermark for exported files, read from the config and the diagram's
 * attributes and drawn into the export copy
 * @module features/export/watermark
 */

import { state } from "../../core/config.js";
import { detectTheme, getContrastRatio } from "../../core/theme.js";
import { settingHolders, readSetting } from "../../core/svg-clone.js";

/**
 * A number, or a string that holds one. NaN for anything else, "" included.
 * @private
 */
const toNumber = (v) =>
  typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;

/**
 * One of the allowed watermark values, case and spaces ignored. A missing
 * or empty value gives the first one, the default. An unknown value logs a
 * warning and gives the default too.
 * @private
 * @param {*} value - Value from the config or an attribute
 * @param {string[]} list - Allowed values, the default first
 * @param {string} name - Setting name for the warning
 * @returns {string} The value to use
 */
function oneOf(value, list, name) {
  const v = String(value || list[0])
    .trim()
    .toLowerCase();
  if (list.includes(v)) return v;
  console.warn(
    `DiagView: Unknown watermark ${name} "${value}", expected ${list.join(", ")}. Using ${list[0]}.`,
  );
  return list[0];
}

/**
 * Resolve the watermark style, position, placement and opacity. An unknown
 * style, position or placement logs a warning and uses the default, so a
 * typo still gives a watermark. An opacity outside 0 to 1 is clamped into
 * that range, and one that is not a number uses 0.2. A missing or empty value
 * uses the default without a warning.
 * @private
 */
function resolveWatermark(config) {
  // The first value in each list is the default
  const style = oneOf(config.style, ["corner", "background", "both"], "style");
  const pos = oneOf(
    config.position,
    ["bottom-right", "bottom-left", "top-right", "top-left", "center", "four-sides"],
    "position",
  );
  const placement = oneOf(config.placement, ["diagram", "margin"], "placement");

  const raw = config.opacity;
  let opacity = raw == null || (typeof raw === "string" && !raw.trim()) ? 0.2 : toNumber(raw);
  // NaN fails both tests, so input that is not a number lands here too
  if (!(opacity >= 0 && opacity <= 1)) {
    const fixed = isNaN(opacity) ? 0.2 : Math.min(1, Math.max(0, opacity));
    console.warn(
      `DiagView: Watermark opacity "${raw}" should be a number from 0 to 1. Using ${fixed}.`,
    );
    opacity = fixed;
  }

  return { style, pos, placement, opacity };
}

/**
 * Injects a watermark into the SVG for branding during export.
 * Supports "background" (centered/rotated) and "corner" styles. `pad` is
 * the width of the blank margin the export adds around the diagram.
 * @private
 */
export function injectWatermark(svg, d, sourceSvg = null, pad = 0) {
  if (!(svg instanceof SVGElement)) return;

  // 1. Start with global config
  const config = { ...state.config.watermark };

  // 2. Apply element-level overrides if available (A1)
  // Resolve the diagram from the page SVG being exported so the inline
  // toolbar and the public exportTo*(el) API see the same overrides as the
  // modal. Each attribute comes from the outer match first, then the inner
  // one. An SVG in no match reads its parent; state.activeSourceElement is
  // only set while the modal is open.
  const holders = settingHolders(sourceSvg);
  if (!holders.length) holders.push(sourceSvg?.parentElement || state.activeSourceElement);
  const read = (key) => readSetting(holders, key);

  const enabled = read("diagviewWatermark");
  if (enabled) config.enabled = enabled === "true";
  config.text = read("diagviewWatermarkText") || config.text;
  config.style = read("diagviewWatermarkStyle") || config.style;
  config.position = read("diagviewWatermarkPos") || config.position;
  config.placement = read("diagviewWatermarkPlacement") || config.placement;
  const raw = read("diagviewWatermarkOpacity")?.trim();
  if (raw) {
    const n = toNumber(raw);
    if (!isNaN(n)) {
      config.opacity = n;
    } else {
      console.warn(
        `DiagView: data-diagview-watermark-opacity "${raw}" should be a number from 0 to 1. Using the config opacity.`,
      );
    }
  }

  // Final validation before processing
  if (!config.enabled || !config.text || !d || d.w <= 0 || d.h <= 0) return;

  // Black or white, whichever stands out more on the colour the file is
  // drawn on. isDark alone follows a dark OS even on a white page.
  const { seenBg, isDark } = detectTheme();
  const onWhite = getContrastRatio(seenBg, "#fff");
  const onBlack = getContrastRatio(seenBg, "#000");
  const light = onWhite > onBlack || (onWhite === onBlack && isDark);
  const mainColor = light ? "#ffffff" : "#000000";
  const contrastColor = light ? "#000000" : "#ffffff";

  const { style, pos, placement, opacity } = resolveWatermark(config);

  // Width of the text per pixel of font size. Measured in the browser's
  // bold sans-serif, as "WWW" is far wider than "iii". Without a canvas,
  // 0.6 per character is the average.
  let widthPerPx = config.text.length * 0.6;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "bold 100px sans-serif";
    widthPerPx = ctx.measureText(config.text).width / 100 || widthPerPx;
  } catch {
    // Keep the estimate
  }

  const createWatermarkElement = (fontSize, textOpacity, maxWidth = 0) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = config.text;
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");

    // Safe-Fit Scaling: Automatically fit text to available width without distortion
    let effectiveFontSize = fontSize;
    if (maxWidth > 0 && fontSize * widthPerPx > maxWidth) {
      effectiveFontSize = maxWidth / widthPerPx;
    }

    text.setAttribute("font-size", `${effectiveFontSize}px`);
    text.setAttribute("fill", mainColor);
    text.setAttribute("stroke", contrastColor);
    text.setAttribute("stroke-width", String(effectiveFontSize * 0.05));
    text.setAttribute("paint-order", "stroke");
    // Three decimals, so 0.2 * 0.8 is written as 0.16, not 0.16000000000000003
    text.setAttribute("fill-opacity", String(Math.round(textOpacity * 1000) / 1000));
    text.setAttribute("stroke-opacity", String(Math.round(textOpacity * 500) / 1000));
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
  // With placement "margin" the marks sit in the middle of the blank margin
  // around the diagram, so they never cover a shape. The text shrinks to fit
  // that band.
  if (style === "corner" || style === "both") {
    const inMargin = placement === "margin";
    const maxDim = Math.max(d.w, d.h);
    let fontSize = maxDim * 0.025; // Always small relative to diagram
    if (inMargin) fontSize = Math.min(fontSize, pad * 0.6);
    // On a long or tall diagram that size does not fit across the short
    // side, so a corner mark left its corner and the four-sides marks ran
    // into each other. Shrink it until each mark and its inset fit, with
    // the marks on opposite sides clear of each other.
    else fontSize = Math.min(fontSize, Math.min(d.w, d.h) / (pos === "four-sides" ? 5 : 3));
    const margin = fontSize;
    const inset = inMargin ? 0 : margin;
    const sideOpacity = style === "both" ? opacity * 0.8 : opacity;

    const top = inMargin ? d.y - pad / 2 : d.y + margin + fontSize;
    const bottom = inMargin ? d.y + d.h + pad / 2 : d.y + d.h - margin;
    const place = (x, y, anchor, maxWidth, rotation) => {
      const el = createWatermarkElement(fontSize, sideOpacity, maxWidth);
      if (inMargin) el.setAttribute("dominant-baseline", "middle");
      addAt(el, x, y, anchor, rotation);
    };

    if (pos === "four-sides") {
      const left = inMargin ? d.x - pad / 2 : d.x + margin;
      const right = inMargin ? d.x + d.w + pad / 2 : d.x + d.w - margin;
      place(d.x + d.w / 2, top, "middle", d.w * 0.5);
      place(d.x + d.w / 2, bottom, "middle", d.w * 0.5);
      place(left, d.y + d.h / 2, "middle", d.h * 0.5, -90);
      place(right, d.y + d.h / 2, "middle", d.h * 0.5, 90);
    } else if (pos !== "center") {
      // Corner text lines up with the diagram's left or right edge
      const east = pos.includes("right");
      place(
        east ? d.x + d.w - inset : d.x + inset,
        pos.includes("bottom") ? bottom : top,
        east ? "end" : "start",
        d.w * 0.35, // Strict corner limit
      );
    }
  }
}
