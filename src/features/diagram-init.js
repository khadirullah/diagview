/**
 * DiagView Diagram Initialization
 * Enhances diagrams with interactive UI
 * @module features/diagram-init
 */

import { openFullscreen } from "../ui/modal.js";
import { exportDiagram } from "./export.js";
import { state } from "../core/config.js";
import {
  generateUniqueId,
  getDiagramTitle,
  getDiagramSvg,
  removeEmptyAttr,
  sanitizeSVG,
} from "../core/utils.js";
import { resolveElementSecurity, settingHolders, readSetting } from "../core/svg-clone.js";
import { ICONS } from "../ui/icons.js";
import { LAYOUTS, BUTTON_STYLES, OFF_HINTS } from "../core/constants.js";
import { createButtonGroup } from "../ui/button-factory.js";
import { forgetZoomState } from "./panzoom-integration.js";
import { isValidSvg, showErrorBoundary } from "./diagram-validate.js";

// Map to store per-diagram cleanup functions (for SPA-safe teardown)
const cleanupMap = new WeakMap();

// Every element initializeDiagram() has touched and not yet released, so that
// destroy() can restore all of them (including layout "off", error-boundary
// and shadow-root diagrams that have no wrapper to find them by).
const trackedElements = new Set();

// data-diagview-accent is gone, so point to its replacement once per page
let accentWarned = false;

// Parts of a diagram that act on a click themselves. Mermaid gives every node
// with a click line the class "clickable", and draws a link as an <a>.
// a[*|href] also matches the older xlink:href links.
const OWN_CLICK = "a[*|href], [onclick], .clickable";

/**
 * Whether a click on a diagram should open the viewer. A click the page
 * already handled, one with a modifier key held, and one on a link or a
 * clickable node inside the diagram are left to the page and the browser.
 * @param {MouseEvent} e - The click
 * @param {Element} area - The element the click listener sits on
 * @returns {boolean} True to open the viewer
 */
function clickOpensViewer(e, area) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
  const own = e.target.closest?.(OWN_CLICK);
  return !own || own === area || !area.contains(own);
}

/**
 * Get button style class from config
 */
function getButtonStyleClass() {
  const configStyle = state.config.ui?.buttons?.style;
  const btnStyle = configStyle ?? BUTTON_STYLES.ACCENT;
  return `dv-btn-${btnStyle}`;
}

/**
 * Icon and style class for one button. A custom icon goes through the
 * strict sanitizer like a diagram, so a script or handler in it never runs,
 * and gets dv-custom-icon so the CSS draws it as written instead of as an
 * outline. One that does not parse falls back to the built-in icon.
 */
function getIcon(key, defaultIcon, styleClass) {
  const custom = state.config.ui?.buttons?.icons?.[key];
  const icon = custom && sanitizeSVG(custom, "strict");
  return icon
    ? { icon, styleClass: `${styleClass} dv-custom-icon` }
    : { icon: defaultIcon, styleClass };
}

/**
 * Read per-element data-diagview-* overrides and merge over global config.
 * Only layout and offHint are merged, from the element itself. Scale,
 * sanitize and allow-remote are checked here for warnings, from the same
 * elements export and the viewer read them from. Export reads scale and the
 * data-diagview-watermark-* attributes itself when it runs.
 *
 * @param {HTMLElement} element - Diagram container element
 * @param {SVGSVGElement|null} svg - The element's SVG, if it has one
 * @returns {object} A local config snapshot for this element only
 */
function readElementOverrides(element, svg) {
  // Start from a shallow copy of global config so we never mutate state
  const cfg = Object.assign({}, state.config);

  const { dataset } = element;

  // data-diagview-layout="header|floating|off"
  if (dataset.diagviewLayout) {
    const v = dataset.diagviewLayout.toLowerCase();
    if ([LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(v)) {
      cfg.layout = v;
    } else {
      console.warn(`DiagView: Unknown data-diagview-layout "${v}" on element, ignoring.`);
    }
  }

  // data-diagview-off-hint="none|icon|label|below"
  if (dataset.diagviewOffHint) {
    const v = dataset.diagviewOffHint.toLowerCase();
    if (OFF_HINTS.includes(v)) {
      cfg.offHint = v;
    } else {
      console.warn(`DiagView: Unknown data-diagview-off-hint "${v}" on element, ignoring.`);
    }
  }

  // The outer match of a nested pair first, then the inner one
  const holders = svg ? settingHolders(svg) : [element];

  // data-diagview-scale="4" (integer 1 to 10). Export reads the attribute
  // itself, so this only warns about a bad value once, at init.
  const scale = readSetting(holders, "diagviewScale");
  if (scale) {
    const n = parseInt(scale, 10);
    if (isNaN(n) || n < 1 || n > 10) {
      console.warn(`DiagView: data-diagview-scale "${scale}" must be 1 to 10, ignoring.`);
    }
  }

  if ("diagviewAccent" in dataset && !accentWarned) {
    accentWarned = true;
    console.warn("DiagView: data-diagview-accent was removed, use accentColor or --diagram-accent");
  }

  // data-diagview-sanitize="strict|permissive|off" and
  // data-diagview-allow-remote="true|false" are NOT merged into cfg: the
  // modal and the exporter resolve them themselves through the same gate
  // (see svg-clone.js) at the moment the SVG is cloned. The call here only
  // serves to emit the "override ignored" warnings once, at init time.
  resolveElementSecurity(holders, { warn: true });

  return cfg;
}

/**
 * The offHint element for a diagram with layout "off", or null for "none".
 * CSS draws its icon, so it holds no <svg> that getDiagramSvg() or the
 * observer could take for the diagram. The element's aria-label already
 * says it opens, so the hint is hidden from screen readers.
 * @param {object} cfg - The element's config
 * @param {boolean} after - The hint goes after the element, which is the <svg> itself
 * @returns {HTMLElement|null} The hint, not yet in the page
 */
function createOffHint(cfg, after) {
  const style = cfg.offHint;
  if (!style || style === "none") return null;
  const hint = document.createElement("div");
  hint.className = `diagview-off-hint diagview-off-hint--${style}`;
  if (after) hint.classList.add("diagview-off-hint--after");
  hint.setAttribute("aria-hidden", "true");
  // CSS shows the text that suits the device
  if (style !== "icon") {
    // In the page font, not the monospace of a <pre> that holds a diagram
    hint.style.setProperty("--dv-hint-font", getComputedStyle(document.body).fontFamily);
    ["mouse", "touch"].forEach((kind) => {
      const span = document.createElement("span");
      span.className = `diagview-off-hint-${kind}`;
      span.textContent = cfg.offHintText[kind];
      hint.appendChild(span);
    });
  }
  return hint;
}

/**
 * Initialize diagram with enhanced UI
 * @param {HTMLElement} element - Diagram container
 * @param {number} [precalculatedIndex=-1] - Optional index to avoid global DOM query
 */
export function initializeDiagram(element, precalculatedIndex = -1) {
  const svg = getDiagramSvg(element);
  if (element.dataset.diagviewInit) return;

  element.dataset.diagviewInit = "1";

  // Record everything we are about to change on the element and its SVG so
  // deinitializeDiagram() can put it all back exactly as it was.
  const record = {
    fn: null,
    wrapper: null,
    errorDiv: null,
    hint: null,
    svg,
    // DiagView named the SVG
    svgLabel: false,
    prev: {
      display: svg ? svg.style.display : "",
      transition: svg ? svg.style.transition : "",
      color: svg ? svg.style.color : "",
      // Emptied attributes are removed on teardown unless they were here
      style: element.hasAttribute("style"),
      svgStyle: svg?.hasAttribute("style"),
      svgClass: svg?.hasAttribute("class"),
    },
  };
  cleanupMap.set(element, record);
  trackedElements.add(element);

  // Resolve config for this element: global config + any data-diagview-* overrides (A1)
  const elementConfig = readElementOverrides(element, svg);

  // Error boundary: Check for valid SVG
  if (!svg || !isValidSvg(svg)) {
    record.errorDiv = showErrorBoundary(element, svg);
    return;
  }

  // Generate a unique ID, or keep the one the viewer gave a diagram that was
  // opened by code before it scrolled into view
  if (!element.dataset.diagviewId) element.dataset.diagviewId = generateUniqueId();

  // MAJ-7: Cache the index to avoid expensive global DOM queries on modal open
  if (precalculatedIndex >= 0) {
    element.dataset.diagviewIndex = precalculatedIndex;
  } else {
    const allDiagrams = document.querySelectorAll(state.config.diagramSelector);
    element.dataset.diagviewIndex = Array.prototype.indexOf.call(allDiagrams, element);
  }

  // MAJ-1: We no longer mutate the original SVG's IDs to avoid "Double Prefixing"
  // and architectural fragility. IDs are now isolated only during cloning (Modal/Export).

  // Get layout configuration from element-local config
  const layout = elementConfig.layout;
  const isOff = layout === LAYOUTS.OFF;
  const isFloating = layout === LAYOUTS.FLOATING;
  const title = getDiagramTitle(svg, element);

  // An SVG with no name of its own takes the title, so screen readers name
  // the drawing on the page and its copy in the viewer. A <title>, a name
  // Mermaid or the page set, and a decorative SVG stay as they are. An
  // <svg> with layout "off" already gets the name "Open ... in fullscreen".
  record.svgLabel =
    !!title &&
    !(isOff && svg === element) &&
    !svg.matches(
      '[aria-label],[aria-labelledby],[aria-hidden="true"],[role~="none"],[role~="presentation"]',
    ) &&
    !svg.querySelector(":scope > title");
  if (record.svgLabel) svg.setAttribute("aria-label", title);

  // If layout is "off", the diagram itself opens fullscreen on a click, or
  // on Enter or Space once Tab reaches it. styles.css gives it the zoom-in
  // cursor a card has.
  if (isOff) {
    const openHandler = () => openFullscreen(element);
    const clickHandler = (e) => {
      if (clickOpensViewer(e, element)) openHandler();
    };
    // Only a key on the diagram itself. Enter on a link inside follows it.
    const keyHandler = (e) => {
      if (e.target === element && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openHandler();
      }
    };
    element.addEventListener("click", clickHandler);
    element.addEventListener("keydown", keyHandler);

    // A button must not hold links, so a diagram with its own links is a
    // group, and Tab still reaches them. Attributes the page set stay.
    const group = element.querySelector("a[*|href],button,input,select,textarea,[tabindex]");
    const added = Object.entries({
      tabindex: 0,
      role: group ? "group" : "button",
      "aria-label": group
        ? `${title || "Diagram"}, press Enter to open fullscreen`
        : `Open ${title || "diagram"} in fullscreen`,
    }).filter(([name]) => !element.hasAttribute(name));
    added.forEach(([name, value]) => element.setAttribute(name, value));

    // The hint goes inside the element, last. An <svg> cannot hold it, so
    // it goes right after one, in the flow, and the svg gets no host class.
    const after = svg === element;
    const hint = createOffHint(elementConfig, after);
    // Icon and label sit in the corner, so the element must be positioned
    const host = hint && !after && elementConfig.offHint !== "below";
    const hadClass = element.hasAttribute("class");
    if (host) element.classList.add("diagview-off-host");
    if (hint && after) element.after(hint);
    else if (hint) element.appendChild(hint);
    record.hint = hint;

    // Store cleanup for this specific element (no wrapper in 'off' layout)
    record.fn = () => {
      element.removeEventListener("click", clickHandler);
      element.removeEventListener("keydown", keyHandler);
      added.forEach(([name]) => element.removeAttribute(name));
      hint?.remove();
      if (host) {
        element.classList.remove("diagview-off-host");
        removeEmptyAttr(element, "class", hadClass);
      }
    };

    // Apply minimal SVG styling
    if (svg) {
      svg.style.transition = "filter 0.3s ease";
      svg.classList.add("dv-svg-content");
    }
    return;
  }

  const styleClass = getButtonStyleClass();

  // Create wrapper structure
  const wrapper = document.createElement("div");
  wrapper.className = "diagview-wrapper";

  const viewport = document.createElement("div");
  viewport.className = "diagview-viewport";

  const controls = document.createElement("div");
  controls.className = "diagview-controls";

  // Create label (only for header layout)
  const label = document.createElement("div");
  label.className = "diagview-label";
  label.textContent = title.toUpperCase() || "DIAGRAM";
  // A title still cut after two lines shows whole, as the page wrote it, on
  // hover. Firefox rounds a title that just fits 1px taller.
  label.addEventListener("pointerenter", () => {
    if (label.scrollHeight > label.clientHeight + 1) label.title = title;
    else label.removeAttribute("title");
  });

  // Create buttons using button factory
  const buttons = [
    {
      action: "copy",
      title: "Copy to clipboard",
      ...getIcon("copy", ICONS.copy, styleClass),
      feedback: true,
      onClick: () => exportDiagram(element, "copy"),
    },
    {
      action: "download",
      title: "Download PNG",
      ...getIcon("download", ICONS.dl, styleClass),
      feedback: true,
      onClick: () => exportDiagram(element, "download"),
    },
    {
      action: "fullscreen",
      title: "Open fullscreen",
      ...getIcon("fullscreen", ICONS.fs, styleClass),
      onClick: () => openFullscreen(element),
    },
  ];

  const btnGroup = createButtonGroup(buttons);

  // Assemble controls
  if (!isFloating) {
    controls.appendChild(label);
  }
  controls.appendChild(btnGroup);

  if (isFloating) {
    controls.classList.add("diagview-controls-floating");
  }

  // Assemble structure
  element.parentNode.insertBefore(wrapper, element);

  if (isFloating) {
    // Floating: Viewport first, then controls overlay
    wrapper.appendChild(viewport);
    wrapper.appendChild(controls);
  } else {
    // Header: Controls first, then viewport
    wrapper.appendChild(controls);
    wrapper.appendChild(viewport);
  }

  viewport.appendChild(element);

  // Click viewport to open fullscreen
  const viewportHandler = (e) => {
    if (!e.target.closest(".diagview-controls") && clickOpensViewer(e, viewport)) {
      openFullscreen(element);
    }
  };
  viewport.addEventListener("click", viewportHandler);

  // Store cleanup function and wrapper reference for this specific element
  record.fn = () => viewport.removeEventListener("click", viewportHandler);
  record.wrapper = wrapper;

  // Apply SVG theme
  if (svg) {
    svg.style.transition = "filter 0.3s ease";
    svg.classList.add("dv-svg-content");
    svg.style.color = "inherit";
  }
}

/**
 * Remove diagram enhancements, returning the element (and its SVG) to the
 * exact state it was in before initializeDiagram() ran.
 */
export function deinitializeDiagram(element) {
  if (!element?.dataset.diagviewInit) return;

  // Run per-element cleanup
  const data = cleanupMap.get(element);
  if (data) {
    const { fn, wrapper, errorDiv, svg, prev } = data;

    // Always use the stored wrapper reference (bulletproof against DOM moves).
    // A diagram the page has taken out of its card and off the page stays
    // out, and only the empty card goes.
    if (wrapper?.parentNode && (element.isConnected || wrapper.contains(element))) {
      wrapper.parentNode.insertBefore(element, wrapper);
    }
    wrapper?.remove();

    if (fn) fn();
    if (errorDiv) errorDiv.remove();

    if (svg) {
      if (data.svgLabel) svg.removeAttribute("aria-label");
      svg.classList.remove("dv-svg-content");
      svg.style.display = prev.display;
      svg.style.transition = prev.transition;
      svg.style.color = prev.color;
      removeEmptyAttr(svg, "style", prev.svgStyle);
      removeEmptyAttr(svg, "class", prev.svgClass);
    }

    removeEmptyAttr(element, "style", prev.style);

    cleanupMap.delete(element);
  }

  trackedElements.delete(element);

  delete element.dataset.diagviewInit;
  // A diagram set up again gets a new id, so its remembered zoom is no use
  forgetZoomState(element.dataset.diagviewId);
  delete element.dataset.diagviewId;
  delete element.dataset.diagviewIndex;
  delete element.dataset.diagviewError;
}

/**
 * Release every diagram initializeDiagram() has touched (used by destroy()).
 */
export function deinitializeAllDiagrams() {
  Array.from(trackedElements).forEach((element) => deinitializeDiagram(element));
  trackedElements.clear();
}

/**
 * Whether an element has left the page. One in a shadow root passed to
 * initShadowRoot() never counts. The observer cannot see it come back, and
 * DiagView keeps that shadow root anyway.
 * @param {Element} element - A diagram or its container
 * @returns {boolean} True when it is off the page and outside any shadow root
 */
export function isDetached(element) {
  if (element.isConnected) return false;
  const root = element.getRootNode();
  return !(root.nodeType === 11 && /** @type {ShadowRoot} */ (root).host);
}

/**
 * Release every diagram whose element has left the page, as when a
 * single-page app swaps a route without calling destroy(). Its card,
 * listeners and record go, so nothing here keeps the old subtree alive. A
 * diagram the page puts back is set up again like a new one.
 */
export function releaseDetachedDiagrams() {
  trackedElements.forEach((element) => {
    if (isDetached(element)) deinitializeDiagram(element);
  });
}

/**
 * The diagram's own SVG, skipping the icon in DiagView's error box
 * @param {Element} element - Diagram container
 * @returns {SVGSVGElement|undefined} The SVG, if there is one
 */
function findDiagramSvg(element) {
  const own = getDiagramSvg(element);
  if (own === element) return own;
  return Array.from(element.querySelectorAll("svg")).find(
    (candidate) => !candidate.closest(".diagview-error"),
  );
}

/**
 * Check a diagram that is already set up again, after the page changed what
 * is inside it, as a live editor or hot reload does when it renders the
 * same element again. Two cases release the element so the caller sets it
 * up from scratch:
 * - it shows the error box, and its SVG is now valid or has been replaced,
 *   so the next setup draws the diagram or an error box for the new SVG
 * - it works, and its SVG has been replaced with one that fails validation,
 *   so the toolbar gives way to the error box
 * A working diagram whose SVG is replaced with another valid one keeps its
 * toolbar, as the buttons act on whatever SVG the element holds.
 * @param {HTMLElement} element - Diagram container with data-diagview-init
 * @returns {boolean} True if the element was released for re-initialization
 */
export function recheckDiagram(element) {
  const record = cleanupMap.get(element);
  if (!record) return false;

  const svg = findDiagramSvg(element);
  if (!svg) return false;

  const replaced = svg !== record.svg;
  const release = element.dataset.diagviewError
    ? replaced || isValidSvg(svg)
    : replaced && !isValidSvg(svg);
  if (!release) {
    // A new render into the element drops the off hint with the old SVG
    const { hint } = record;
    if (hint && !hint.parentNode && svg !== element) element.appendChild(hint);
    return false;
  }

  deinitializeDiagram(element);
  return true;
}
