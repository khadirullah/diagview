/**
 * DiagView Floating Action Menu
 * Mobile-friendly FAB menu with zoom controls and export options
 * @module ui/floating-menu
 */

import { state } from "../core/config.js";
import { detectTheme } from "../core/theme.js";
import { throttle, setSVGContent } from "../core/utils.js";
import { addModalListener } from "../core/lifecycle.js";
import { exportDiagram } from "../features/export.js";
import { ICONS } from "./icons.js";
import { createMenuItem } from "./button-factory.js";
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
  const fab = document.createElement("button");
  fab.className = "diagview-fab-btn";
  fab.id = "dv-toggle";
  fab.setAttribute("aria-label", "Toggle menu");
  fab.style.display = "grid";
  fab.style.placeItems = "center";
  fab.style.backgroundColor = theme.accent;
  fab.style.color = "#fff";
  fab.insertAdjacentHTML("afterbegin", ICONS.menu);
  container.appendChild(fab);

  // 2. Menu Panel
  const menuPanel = document.createElement("div");
  menuPanel.className = "diagview-menu";
  menuPanel.id = "dv-menu-panel";
  menuPanel.tabIndex = -1;
  container.appendChild(menuPanel);

  // Section 1: Zoom
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

  // Section 2: Export
  const expSec = document.createElement("div");
  expSec.className = "dv-menu-sec";

  const expLbl = document.createElement("div");
  expLbl.className = "dv-menu-lbl";
  expLbl.style.display = "flex";
  expLbl.style.justifyContent = "space-between";
  expLbl.style.alignItems = "center";
  expLbl.textContent = "Export";

  const transLabel = document.createElement("label");
  transLabel.style.display = "flex";
  transLabel.style.alignItems = "center";
  transLabel.style.gap = "4px";
  transLabel.style.fontSize = "10px";
  transLabel.style.cursor = "pointer";
  transLabel.style.textTransform = "none";
  transLabel.style.letterSpacing = "normal";

  const transChk = document.createElement("input");
  transChk.type = "checkbox";
  transChk.id = "dv-exp-trans";
  transChk.style.margin = "0";
  transChk.style.width = "auto";
  transChk.style.cursor = "pointer";
  transChk.style.accentColor = "var(--dv-accent)";

  transLabel.appendChild(transChk);
  transLabel.appendChild(document.createTextNode("Transparent "));

  const transHint = document.createElement("span");
  transHint.style.opacity = "0.5";
  transHint.style.fontSize = "8px";
  transHint.textContent = "(PNG/WebP/SVG)";
  transLabel.appendChild(transHint);

  expLbl.appendChild(transLabel);
  expSec.appendChild(expLbl);

  const expGrid = document.createElement("div");
  expGrid.className = "dv-exp";
  ["PNG", "JPEG", "SVG", "WebP", "PDF", "Copy"].forEach((fmt) => {
    const btn = document.createElement("button");
    btn.dataset.action = fmt.toLowerCase();
    btn.textContent = fmt;
    expGrid.appendChild(btn);
  });
  expSec.appendChild(expGrid);
  menuPanel.appendChild(expSec);

  // Section 3: Tools
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

  // Section 4: Branding
  const footer = document.createElement("div");
  footer.className = "dv-menu-footer";

  const brandLink = document.createElement("a");
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

  const modal = document.getElementById("diagview-modal");
  if (modal) {
    modal.appendChild(container);
  } else {
    document.body.appendChild(container);
  }

  // Create tool menu items using button factory

  const shareBtn = createMenuItem({
    id: "dv-share",
    icon: ICONS.share,
    label: "Share Link",
    shortcut: "L",
    onClick: async () => {
      const { shareLink } = await import("../features/lazy/share.js");
      shareLink(state.currentDiagramIndex);
      toggleMenu();
    },
  });

  const rotateBtn = createMenuItem({
    id: "dv-rotate",
    icon: ICONS.rotate,
    label: "Rotate 90°",
    shortcut: "R",
    onClick: async () => {
      const { rotateDiagram } = await import("../features/lazy/rotate.js");
      rotateDiagram();
      toggleMenu();
    },
  });

  const meetingBtn = createMenuItem({
    id: "dv-meeting",
    icon: ICONS.laser,
    label: "Meeting Mode",
    shortcut: "M",
    onClick: async () => {
      const { toggleMeetingMode } = await import("../features/lazy/meeting-mode.js");
      toggleMeetingMode();
      toggleMenu();
    },
  });

  // Append tool buttons
  if (shareBtn) toolsContainer.appendChild(shareBtn);
  if (rotateBtn) toolsContainer.appendChild(rotateBtn);
  if (meetingBtn) toolsContainer.appendChild(meetingBtn);

  // Toggle State Logic
  let isOpen = false;

  const toggleMenu = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    isOpen = !isOpen;
    menuPanel.classList.toggle("active", isOpen);
    fab.classList.toggle("open", isOpen);
    fab.replaceChildren();
    fab.insertAdjacentHTML("afterbegin", isOpen ? ICONS.close : ICONS.menu);
    fab.setAttribute("aria-expanded", isOpen);

    if (isOpen) {
      // Focus the panel itself instead of the first button
      // This prevents the "Space" shortcut from accidentally clicking "Zoom Out"
      setTimeout(() => {
        menuPanel.focus();
      }, 50);
    } else {
      // Return focus to FAB when closing
      fab.focus();
    }
  };

  fab.onclick = toggleMenu;

  // Close when clicking outside
  const handleClickOutside = (e) => {
    if (isOpen && !container.contains(e.target)) {
      isOpen = false;
      menuPanel.classList.remove("active");
      fab.classList.remove("open");
      fab.replaceChildren();
      fab.insertAdjacentHTML("afterbegin", ICONS.menu);
      fab.setAttribute("aria-expanded", "false");
    }
  };

  // Use timeout to avoid immediate close if triggered by a bubble event
  setTimeout(() => {
    // Safety check: ensure modal is still open and menu still exists
    if (!state.isModalOpen || !document.contains(container)) return;
    addModalListener(document, "click", handleClickOutside);
  }, 0);

  // --- Event Wiring ---

  // Zoom controls
  const bindClick = (btn, fn) => {
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        fn(e);
      };
    }
  };

  // Zoom controls
  bindClick(zoomInBtn, () => state.activePanzoom?.zoomIn());
  bindClick(zoomOutBtn, () => state.activePanzoom?.zoomOut());
  bindClick(resetBtn, () => state.activePanzoom?.reset({ animate: true }));

  // Export Grid Delegation

  expGrid.onclick = (e) => {
    e.stopPropagation();
    const btn = e.target.closest("button");
    if (!btn) return;

    const type = btn.dataset.action;
    btn.classList.add("active");
    setTimeout(() => btn.classList.remove("active"), 200);

    const isTrans = transChk ? transChk.checked : false;

    exportDiagram(sourceElement, type, { transparent: isTrans, modalClone: clonedSvg });

    toggleMenu();
  };

  // Update zoom display
  if (state.activePanzoom) {
    const updateZoom = throttle((e) => {
      zoomTag.textContent = `${Math.round(e.detail.scale * 100)}%`;
    }, 100);

    addModalListener(clonedSvg, "panzoomchange", updateZoom);
  }
}
