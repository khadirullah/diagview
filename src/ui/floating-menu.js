/**
 * DiagView Floating Action Menu
 * Mobile-friendly FAB menu with zoom controls and export options
 * @module ui/floating-menu
 */

import { state, addModalCleanupFunction } from "../core/config.js";
import { detectTheme, setCanvasTheme } from "../core/theme.js";
import { sanitizeSVG } from "../core/utils.js";

import { exportDiagram } from "../features/export.js";
import { ICONS } from "./icons.js";
import { createMenuItem } from "./button-factory.js";
import { invalidateFocusableCache } from "./focus-manager.js";
import { BRANDING } from "../core/constants.js";

/**
 * Create floating action menu (Redesigned Panel Layout)
 */
export function createFloatingMenu(sourceElement, clonedSvg) {
  const existing = document.getElementById("diagview-temp-menu");
  if (existing) existing.remove();

  const theme = detectTheme();

  // Wrapper for menu and FAB
  const container = document.createElement("div");
  container.className = "diagview-fab-container";
  container.id = "diagview-temp-menu";

  // 1. FAB Button
  const fab = _createFAB(container, theme);

  // 2. Menu Panel
  const menuPanel = _createMenuPanel(container);

  // 3. Sections
  const zoomElements = _createZoomSection(menuPanel);
  _createCanvasThemeSection(menuPanel);
  const { transChk, expGrid } = _createExportSection(menuPanel);
  const toolsContainer = _createToolsSection(menuPanel);
  _createMenuFooter(menuPanel);

  const modal = document.getElementById("diagview-modal");
  if (modal) {
    modal.appendChild(container);
  } else {
    document.body.appendChild(container);
  }

  // 4. Setup Logic & Wiring
  _setupMenuController(
    { container, fab, menuPanel, zoomElements, transChk, expGrid, toolsContainer },
    sourceElement,
    clonedSvg,
  );
}

// --- Private Builders ---

function _createFAB(container, theme) {
  const fab = document.createElement("button");
  fab.className = "diagview-fab-btn";
  fab.id = "dv-toggle";
  fab.setAttribute("aria-label", "Toggle menu");
  fab.style.display = "grid";
  fab.style.placeItems = "center";
  fab.style.backgroundColor = theme.accent;
  fab.style.color = "#fff";
  fab.insertAdjacentHTML("afterbegin", sanitizeSVG(ICONS.menu, "permissive"));
  container.appendChild(fab);
  return fab;
}

function _createMenuPanel(container) {
  const menuPanel = document.createElement("div");
  menuPanel.className = "diagview-menu";
  menuPanel.id = "dv-menu-panel";
  menuPanel.tabIndex = -1;
  container.appendChild(menuPanel);
  return menuPanel;
}

function _createZoomSection(menuPanel) {
  const zoomSec = document.createElement("div");
  zoomSec.className = "dv-menu-sec";

  const zoomLbl = document.createElement("div");
  zoomLbl.className = "dv-menu-lbl";
  zoomLbl.textContent = "Zoom";
  zoomSec.appendChild(zoomLbl);

  const zoomControls = document.createElement("div");
  zoomControls.className = "dv-zoom";

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.id = "dv-zoomout";
  zoomOutBtn.title = "Zoom Out (-)";
  zoomOutBtn.setAttribute("aria-label", "Zoom out");
  zoomOutBtn.textContent = "−";

  const zoomTag = document.createElement("span");
  zoomTag.className = "dv-zoom-val";
  zoomTag.id = "dv-zoom-tag";
  zoomTag.textContent = "100%";

  const zoomInBtn = document.createElement("button");
  zoomInBtn.id = "dv-zoomin";
  zoomInBtn.title = "Zoom In (+)";
  zoomInBtn.setAttribute("aria-label", "Zoom in");
  zoomInBtn.textContent = "+";

  const resetBtn = document.createElement("button");
  resetBtn.id = "dv-reset";
  resetBtn.title = "Reset/Fit (Space)";
  resetBtn.setAttribute("aria-label", "Reset zoom");
  resetBtn.insertAdjacentHTML("afterbegin", ICONS.reset);

  zoomControls.append(zoomOutBtn, zoomTag, zoomInBtn, resetBtn);
  zoomSec.appendChild(zoomControls);
  menuPanel.appendChild(zoomSec);

  return { zoomInBtn, zoomOutBtn, resetBtn };
}

function _createCanvasThemeSection(menuPanel) {
  const themeSec = document.createElement("div");
  themeSec.className = "dv-menu-sec";

  const themeLbl = document.createElement("div");
  themeLbl.className = "dv-menu-lbl";
  themeLbl.textContent = "Canvas Theme";

  const modeGroup = document.createElement("div");
  modeGroup.className = "dv-theme-modes";

  const modes = [
    { label: "☀️ Light", mode: "light" },
    { label: "🌙 Dark", mode: "dark" },
    { label: "🖥️ Auto", mode: "auto" },
  ];

  modes.forEach(({ label, mode }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dv-theme-btn";
    btn.textContent = label;
    if (state.activeCanvasThemeMode === mode) btn.classList.add("active");

    btn.onclick = () => {
      modeGroup.querySelectorAll(".dv-theme-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setCanvasTheme(mode);
    };
    modeGroup.appendChild(btn);
  });

  const swatchGroup = document.createElement("div");
  swatchGroup.className = "dv-swatches";

  const customWrapper = document.createElement("label");
  customWrapper.className = "dv-swatch-btn dv-swatch-custom";
  customWrapper.title = "Custom Color Picker";
  customWrapper.textContent = "🎨";

  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.value = state.customCanvasColor || "#0b0f19";
  customInput.className = "dv-custom-color-input";

  customInput.oninput = (e) => {
    const val = e.target.value;
    setCanvasTheme("custom", val);
  };

  customWrapper.appendChild(customInput);
  swatchGroup.appendChild(customWrapper);

  const swatches = [
    { name: "White", color: "#ffffff" },
    { name: "Dark Slate", color: "#0b0f19" },
    { name: "Navy", color: "#0f172a" },
    { name: "Charcoal", color: "#1e293b" },
  ];

  swatches.forEach(({ name, color }) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "dv-swatch-btn";
    sw.title = name;
    sw.style.backgroundColor = color;
    if (color === "#ffffff") sw.style.border = "1px solid #cbd5e1";

    sw.onclick = () => {
      swatchGroup.querySelectorAll(".dv-swatch-btn").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
      setCanvasTheme("custom", color);
    };
    swatchGroup.appendChild(sw);
  });

  themeSec.appendChild(themeLbl);
  themeSec.appendChild(modeGroup);
  themeSec.appendChild(swatchGroup);
  menuPanel.appendChild(themeSec);
}

function _createExportSection(menuPanel) {
  const expSec = document.createElement("div");
  expSec.className = "dv-menu-sec";

  const expLbl = document.createElement("div");
  expLbl.className = "dv-menu-lbl dv-menu-lbl--row";
  expLbl.textContent = "Export";

  const transLabel = document.createElement("label");
  transLabel.className = "dv-exp-trans-label";

  const transChk = document.createElement("input");
  transChk.type = "checkbox";
  transChk.id = "dv-exp-trans";
  transChk.className = "dv-exp-trans-chk";

  transLabel.appendChild(transChk);
  transLabel.appendChild(document.createTextNode("Transparent"));

  expLbl.appendChild(transLabel);
  expSec.appendChild(expLbl);

  const expGrid = document.createElement("div");
  expGrid.className = "dv-exp";
  [
    { label: "PNG", action: "png" },
    { label: "JPEG", action: "jpeg" },
    { label: "SVG", action: "svg" },
    { label: "Copy SVG", action: "copy-svg" },
    { label: "WebP", action: "webp" },
    { label: "PDF", action: "pdf" },
    { label: "Copy Image", action: "copy" },
  ].forEach((item) => {
    const btn = document.createElement("button");
    btn.dataset.action = item.action;
    btn.textContent = item.label;
    expGrid.appendChild(btn);
  });

  const updateDisabledStates = () => {
    const isTransparent = transChk.checked;
    ["jpeg", "pdf"].forEach((action) => {
      const btn = expGrid.querySelector(`[data-action="${action}"]`);
      if (btn) {
        if (isTransparent) {
          btn.setAttribute("disabled", "true");
          btn.classList.add("disabled");
          btn.title = "Not available with transparent background";
        } else {
          btn.removeAttribute("disabled");
          btn.classList.remove("disabled");
          btn.removeAttribute("title");
        }
      }
    });
  };

  transChk.onchange = updateDisabledStates;

  expSec.appendChild(expGrid);
  menuPanel.appendChild(expSec);

  return { transChk, expGrid };
}

function _createToolsSection(menuPanel) {
  const toolsSec = document.createElement("div");
  toolsSec.className = "dv-menu-sec";

  const toolsLbl = document.createElement("div");
  toolsLbl.className = "dv-menu-lbl";
  toolsLbl.textContent = "Tools";

  const toolsContainer = document.createElement("div");
  toolsContainer.id = "dv-tools-container";

  toolsSec.appendChild(toolsLbl);
  toolsSec.appendChild(toolsContainer);
  menuPanel.appendChild(toolsSec);

  return toolsContainer;
}

function _createMenuFooter(menuPanel) {
  const footer = document.createElement("div");
  footer.className = "dv-menu-footer";

  const brandLink = document.createElement("a");
  brandLink.className = "dv-menu-brand";
  brandLink.href = BRANDING.URL;
  brandLink.target = "_blank";
  brandLink.textContent = BRANDING.LABEL;

  const authorLink = document.createElement("a");
  authorLink.href = BRANDING.AUTHOR_URL;
  authorLink.target = "_blank";
  authorLink.textContent = BRANDING.AUTHOR_NAME;

  footer.appendChild(brandLink);
  footer.appendChild(document.createTextNode(" by "));
  footer.appendChild(authorLink);
  menuPanel.appendChild(footer);
}

/**
 * Controller for Floating Menu logic and event wiring
 * @private
 */
function _setupMenuController(elements, sourceElement, clonedSvg) {
  const { container, fab, menuPanel, zoomElements, transChk, expGrid, toolsContainer } = elements;
  const { zoomInBtn, zoomOutBtn, resetBtn } = zoomElements;

  let isOpen = false;
  const menuTimeouts = new Set();

  const safeTimeout = (fn, delay) => {
    const id = setTimeout(() => {
      menuTimeouts.delete(id);
      fn();
    }, delay);
    menuTimeouts.add(id);
    return id;
  };

  addModalCleanupFunction(() => {
    menuTimeouts.forEach((id) => clearTimeout(id));
    menuTimeouts.clear();
  });

  const toggleMenu = (e, forceState) => {
    e?.preventDefault();
    e?.stopPropagation();

    const nextState = typeof forceState === "boolean" ? forceState : !isOpen;
    if (nextState === isOpen) return; // Guard against redundant state changes

    isOpen = nextState;

    invalidateFocusableCache();
    menuPanel.classList.toggle("active", isOpen);
    fab.classList.toggle("open", isOpen);
    fab.replaceChildren();
    fab.insertAdjacentHTML(
      "afterbegin",
      sanitizeSVG(isOpen ? ICONS.close : ICONS.menu, "permissive"),
    );
    fab.setAttribute("aria-expanded", isOpen);

    if (isOpen) {
      requestAnimationFrame(() => {
        if (isOpen) menuPanel.focus();
      });
    } else {
      // Restore focus to the main modal instead of the FAB button.
      // This allows keyboard shortcuts (R, M, L, etc.) to resume immediately
      // without being blocked by the "interactive element" check in focus-manager.
      const modal = document.getElementById("diagview-modal");
      if (modal) {
        modal.focus();
      } else {
        fab.focus();
      }
    }
  };

  fab.onclick = toggleMenu;

  // Tools initialization
  const toolDefs = [
    { id: "dv-share", icon: ICONS.share, label: "Share Link", shortcut: "L", feat: "share" },
    { id: "dv-rotate", icon: ICONS.rotate, label: "Rotate 90°", shortcut: "R", feat: "rotate" },
    {
      id: "dv-meeting",
      icon: ICONS.laser,
      label: "Meeting Mode",
      shortcut: "M",
      feat: "meeting-mode",
    },
  ];

  toolDefs.forEach((def) => {
    const btn = createMenuItem({
      id: def.id,
      icon: def.icon,
      label: def.label,
      shortcut: def.shortcut,
      onClick: async () => {
        let mod;
        try {
          // Use static paths so Rollup can inline them for UMD builds
          if (def.feat === "share") mod = await import("../features/lazy/share.js");
          else if (def.feat === "rotate") mod = await import("../features/lazy/rotate.js");
          else if (def.feat === "meeting-mode")
            mod = await import("../features/lazy/meeting-mode.js");

          if (def.feat === "share") mod.shareLink(state.currentDiagramIndex);
          else if (def.feat === "rotate") mod.rotateDiagram();
          else if (def.feat === "meeting-mode") mod.toggleMeetingMode();
          toggleMenu(null, false);
        } catch (err) {
          console.error(`DiagView: Failed to load ${def.label}`, err);
        }
      },
    });
    if (btn) toolsContainer.appendChild(btn);
  });

  // Outside click handling
  const handleClickOutside = (e) => {
    if (isOpen && !container.contains(e.target)) {
      toggleMenu(null, false);
    }
  };

  requestAnimationFrame(() => {
    if (!state.isModalOpen || !document.contains(container)) return;
    document.addEventListener("click", handleClickOutside);
    addModalCleanupFunction(() => document.removeEventListener("click", handleClickOutside));
  });

  // Wiring Helpers
  const bindClick = (btn, fn) => {
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        fn(e);
      };
    }
  };

  bindClick(zoomInBtn, () => state.activePanzoom?.zoomIn());
  bindClick(zoomOutBtn, () => state.activePanzoom?.zoomOut());
  bindClick(resetBtn, () => state.activePanzoom?.reset({ animate: true }));

  expGrid.onclick = (e) => {
    e.stopPropagation();
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;

    const type = btn.dataset.action;
    btn.classList.add("active");
    safeTimeout(() => btn.classList.remove("active"), 200);

    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;

    const isTrans = transChk?.checked || false;
    exportDiagram(sourceElement, type, { transparent: isTrans, modalClone: clonedSvg }).finally(
      () => {
        btn.removeAttribute("aria-busy");
        btn.disabled = false;
      },
    );

    toggleMenu(null, false);
  };
}
