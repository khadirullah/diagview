/**
 * DiagView modal DOM. Builds the viewer once and wires its top bar buttons.
 * @module ui/modal-dom
 */

import { state, addCleanupFunction } from "../core/config.js";
import { setSVGContent } from "../core/utils.js";
import { loadChunk } from "../core/lifecycle.js";
import { BRANDING, TIMING } from "../core/constants.js";
import { ICONS } from "./icons.js";
import { closeModal } from "./modal-controls.js";
import { showToast } from "./toast.js";
import { keysUsed } from "../features/keyboard.js";

/**
 * Create modal structure
 */
export function createModal() {
  if (document.getElementById("diagview-modal")) return;

  const modal = document.createElement("div");
  modal.id = "diagview-modal";
  modal.className = "diagview-modal";
  // A new modal after destroy() and init() keeps the key badges shown
  if (keysUsed) modal.classList.add("dv-keys");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Diagram viewer");
  modal.tabIndex = -1; // Allows silent focus capture

  // The keys work wherever focus is in the viewer, so the dialog carries
  // the instructions, and screen readers read them as it takes focus
  const instructions = document.createElement("p");
  instructions.id = "diagview-modal-instructions";
  instructions.hidden = true;
  instructions.textContent = "Use arrow keys to pan, plus and minus to zoom, Space to reset.";
  modal.appendChild(instructions);
  modal.setAttribute("aria-describedby", instructions.id);

  // 1. Loading Indicator
  const loading = document.createElement("div");
  loading.className = "diagview-loading";
  loading.id = "diagview-loading";
  const spinner = document.createElement("div");
  spinner.className = "diagview-spinner";
  loading.appendChild(spinner);
  modal.appendChild(loading);

  // 2. Modal Content
  const content = document.createElement("div");
  content.className = "diagview-modal-content";
  modal.appendChild(content);

  // 3. Topbar Construction
  const {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    textSelectDesktopBtn,
    closeBtn,
  } = _createModalTopbar(content);

  // 4. Main Content Construction (Viewport, Minimap, Laser)
  const viewport = _createModalMainContent(modal, content);

  // 5. Wire Events
  _wireModalEvents(
    {
      topbar,
      searchIconBtn,
      textSelectMobileBtn,
      searchBackBtn,
      searchInput,
      textSelectDesktopBtn,
      closeBtn,
    },
    viewport,
  );
}

/**
 * Create the modal topbar and its interactive elements
 * @private
 * @param {HTMLElement} content - Modal content container
 */
function _createModalTopbar(content) {
  const topbar = document.createElement("div");
  topbar.className = "diagview-topbar";
  content.appendChild(topbar);

  // ── Mobile icon action row ──────────────────
  const mobileActions = document.createElement("div");
  mobileActions.className = "dv-topbar-actions";

  const searchIconBtn = document.createElement("button");
  searchIconBtn.id = "dv-search-icon-btn";
  searchIconBtn.className = "dv-icon-btn";
  searchIconBtn.setAttribute("aria-label", "Search diagram");
  searchIconBtn.setAttribute("aria-expanded", "false");
  searchIconBtn.setAttribute("type", "button");
  setSVGContent(searchIconBtn, ICONS.search);

  const textSelectMobileBtn = document.createElement("button");
  textSelectMobileBtn.id = "dv-text-select-btn";
  textSelectMobileBtn.className = "dv-icon-btn dv-hide-on-search";
  textSelectMobileBtn.setAttribute("aria-label", "Toggle text select to copy SVG node labels");
  textSelectMobileBtn.setAttribute("aria-pressed", "false");
  textSelectMobileBtn.setAttribute("type", "button");
  setSVGContent(textSelectMobileBtn, ICONS.textSelect);

  mobileActions.append(searchIconBtn, textSelectMobileBtn);
  topbar.appendChild(mobileActions);

  // Branding
  const brandingLink = document.createElement("a");
  brandingLink.href = BRANDING.URL;
  brandingLink.target = "_blank";
  brandingLink.rel = "noopener noreferrer";
  brandingLink.className = "diagview-branding";
  brandingLink.title = `${BRANDING.LABEL} by Khadirullah`;
  brandingLink.textContent = BRANDING.LABEL;
  topbar.appendChild(brandingLink);

  // Search Container
  const searchContainer = document.createElement("div");
  searchContainer.className = "diagview-search-container";
  const searchWrapper = document.createElement("div");
  searchWrapper.className = "diagview-search-wrapper";
  searchContainer.appendChild(searchWrapper);

  const searchBackBtn = document.createElement("button");
  searchBackBtn.id = "diagview-search-back";
  searchBackBtn.className = "diagview-search-back";
  searchBackBtn.setAttribute("aria-label", "Exit search");
  searchBackBtn.setAttribute("type", "button");
  setSVGContent(
    searchBackBtn,
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  );
  searchWrapper.appendChild(searchBackBtn);

  const searchIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  searchIcon.classList.add("diagview-search-icon");
  searchIcon.setAttribute("width", "18");
  searchIcon.setAttribute("height", "18");
  searchIcon.setAttribute("viewBox", "0 0 24 24");
  searchIcon.setAttribute("fill", "none");
  searchIcon.setAttribute("stroke", "currentColor");
  searchIcon.setAttribute("stroke-width", "2");
  setSVGContent(
    searchIcon,
    '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path>',
  );
  searchWrapper.appendChild(searchIcon);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "diagview-search";
  searchInput.className = "diagview-search-input";
  searchInput.placeholder = "Search nodes...";
  // A placeholder alone is a weak name. Some screen readers drop it once
  // the box holds text.
  searchInput.setAttribute("aria-label", "Search nodes");
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("aria-controls", "diagview-search-status");
  searchWrapper.appendChild(searchInput);

  const searchClear = document.createElement("button");
  searchClear.id = "diagview-search-clear";
  searchClear.className = "diagview-search-clear";
  searchClear.setAttribute("aria-label", "Clear search");
  searchClear.setAttribute("type", "button");
  searchClear.textContent = "✕";
  searchWrapper.appendChild(searchClear);

  const searchStatus = document.createElement("span");
  searchStatus.id = "diagview-search-status";
  searchStatus.className = "diagview-sr-only";
  searchStatus.setAttribute("aria-live", "polite");
  searchStatus.setAttribute("aria-atomic", "true");
  searchContainer.appendChild(searchWrapper);
  searchContainer.appendChild(searchStatus);
  topbar.appendChild(searchContainer);

  const zoomDisplay = document.createElement("span");
  zoomDisplay.id = "diagview-zoom-display";
  zoomDisplay.className = "diagview-zoom-display";
  zoomDisplay.textContent = "100%";
  topbar.appendChild(zoomDisplay);

  const shortcutHint = document.createElement("span");
  shortcutHint.className = "diagview-shortcut-hint";
  shortcutHint.appendChild(document.createTextNode("Press "));
  const kbd = document.createElement("kbd");
  kbd.textContent = "?";
  shortcutHint.appendChild(kbd);
  shortcutHint.appendChild(document.createTextNode(" for shortcuts"));
  topbar.appendChild(shortcutHint);

  const textSelectDesktopBtn = document.createElement("button");
  textSelectDesktopBtn.id = "dv-text-select-desktop-btn";
  textSelectDesktopBtn.className = "dv-text-select-btn";
  textSelectDesktopBtn.setAttribute("aria-label", "Toggle text select to copy SVG node labels");
  textSelectDesktopBtn.setAttribute("aria-pressed", "false");
  textSelectDesktopBtn.setAttribute("type", "button");
  textSelectDesktopBtn.setAttribute("data-tooltip", "Text select to copy SVG labels (T)");
  setSVGContent(textSelectDesktopBtn, ICONS.textSelect);
  topbar.appendChild(textSelectDesktopBtn);

  const closeBtn = document.createElement("button");
  closeBtn.className = "diagview-close-btn";
  closeBtn.id = "diagview-close";
  closeBtn.title = "Close (Esc)";
  closeBtn.setAttribute("aria-label", "Close fullscreen");
  closeBtn.setAttribute("type", "button");
  closeBtn.textContent = "✕";
  topbar.appendChild(closeBtn);

  return {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    textSelectDesktopBtn,
    closeBtn,
  };
}

/**
 * Create the main modal content (viewport, minimap, laser)
 * @private
 * @returns {HTMLDivElement} The viewport
 */
function _createModalMainContent(modal, content) {
  const viewport = document.createElement("div");
  viewport.id = "diagview-modal-viewport";
  viewport.className = "diagview-modal-viewport";

  // Intercept the events that would START a pan before they reach Panzoom,
  // so native text selection can begin. Move events must keep bubbling:
  // Panzoom ignores them without a preceding pointerdown, and other
  // features (meeting-mode's laser pointer) listen for them on the viewport.
  const stopPropIfTextSelect = (e) => {
    if (viewport.classList.contains("dv-text-select")) {
      e.stopPropagation();
    }
  };
  viewport.addEventListener("pointerdown", stopPropIfTextSelect, true);
  viewport.addEventListener("mousedown", stopPropIfTextSelect, true);
  viewport.addEventListener("touchstart", stopPropIfTextSelect, { passive: true, capture: true });

  content.appendChild(viewport);

  // Minimap
  const minimap = document.createElement("div");
  minimap.id = "diagview-minimap";
  minimap.className = "diagview-minimap";
  const minimapView = document.createElement("div");
  minimapView.className = "dv-mm-v";
  minimap.appendChild(minimapView);
  content.appendChild(minimap);

  // Laser
  const laser = document.createElement("div");
  laser.id = "diagview-laser";
  laser.className = "diagview-laser";
  content.appendChild(laser);

  document.body.appendChild(modal);

  return viewport;
}

/**
 * Wire up all event listeners for the modal topbar
 * @private
 */
function _wireModalEvents(elements, viewport) {
  const {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    textSelectDesktopBtn,
    closeBtn,
  } = elements;

  function _doTextSelectToggle() {
    const on = viewport.classList.toggle("dv-text-select");

    try {
      if (state.activePanzoom) {
        // BUG FIX: pause()/resume() do not exist in @panzoom/panzoom.
        // We use setOptions to disable/enable interactions instead.
        state.activePanzoom.setOptions({ disablePan: on, disableZoom: on });
      }
    } catch (err) {
      console.warn("DiagView: Failed to toggle Panzoom state", err);
    }

    [textSelectMobileBtn, textSelectDesktopBtn].forEach((btn) => {
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    // Reset focus to modal so keyboard shortcuts (R, M, L, etc.) work immediately
    // even if the user toggled the button using the mouse.
    const modal = document.getElementById("diagview-modal");
    if (modal) modal.focus();

    showToast(
      on ? "Text select ON, drag to copy" : "Text select OFF",
      on ? "success" : "info",
      null,
      "textSelect",
    );
  }

  // Text Selection (keyboard "T" emits this event).
  // _wireModalEvents runs once per modal DOM (createModal is idempotent), so
  // the subscription must live for the instance and be released on destroy().
  // Registering it as modal-scoped cleanup removed it on the first close and
  // nothing re-subscribed, which silently killed the shortcut afterwards.
  addCleanupFunction(state.events.on("dv:toggle-text-select", () => _doTextSelectToggle()));

  textSelectMobileBtn.addEventListener("click", _doTextSelectToggle);
  textSelectDesktopBtn.addEventListener("click", _doTextSelectToggle);

  // Search Toggle
  searchIconBtn.addEventListener("click", () => {
    const open = topbar.classList.toggle("search-open");
    searchIconBtn.classList.toggle("active", open);
    searchIconBtn.setAttribute("aria-expanded", String(open));
    // Focus in the same task. Waiting a frame let keys typed right after F
    // reach the shortcut handler instead of the box. preventScroll keeps the
    // page still while the search bar is still sliding in on phones.
    if (open) searchInput?.focus({ preventScroll: true });
  });

  // Search Clear & Back
  searchBackBtn.addEventListener("click", () => {
    topbar.classList.remove("search-open");
    searchIconBtn.classList.remove("active");
    searchIconBtn.setAttribute("aria-expanded", "false");
    // The Back button hides with the search bar, so focus goes to the button
    // that opens it again
    searchIconBtn.focus();
    loadChunk("search", () => import("../features/lazy/search.js"))
      .then((m) => m.clearSearch())
      .catch(() => {});
  });

  // The clear button is wired by setupSearch(), which has the diagram copy

  // Modal Close
  closeBtn.addEventListener("click", () => closeModal());

  // A link to a part of this page closes the viewer, then goes there as a
  // click on the page would. Left to the browser, the jump counted as Back.
  viewport.addEventListener("click", async (e) => {
    const link = e.target.closest?.("a[*|href]");
    const hash = link?.getAttribute("href") ?? link?.getAttribute("xlink:href");
    if (!hash?.startsWith("#") || hash === "#" || link.hasAttribute("target")) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    // The viewer's copy prefixes its ids, so a link to a part of the
    // diagram goes to that part of the page's own diagram
    let id = hash.slice(1);
    if (viewport.contains(document.getElementById(id))) id = id.replace(/^dv-[^-]+-[^-]+-/, "");
    await closeModal();
    // Closing steps back over the viewer's history entry. Jump only once
    // that step has landed and the browser has restored its scroll position,
    // or the step undoes the jump.
    if (history.state?.diagviewModal) {
      let landed;
      await new Promise((resolve) => {
        landed = resolve;
        window.addEventListener("popstate", resolve, { once: true });
        setTimeout(resolve, TIMING.CLEANUP_DELAY);
      });
      window.removeEventListener("popstate", landed);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    // Setting the hash the address already has does not scroll
    const target = document.getElementById(id);
    if (location.hash === "#" + id) target?.scrollIntoView();
    else location.hash = id;
    // For a part inside an SVG, Firefox scrolls to the top of the SVG, which
    // leaves the part off screen in a diagram taller than the window
    if (target?.ownerSVGElement) {
      const box = target.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        window.scrollBy(0, box.top - pad);
      }
    }
  });
}
