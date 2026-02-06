/**
 * DiagView Floating Action Menu
 * Mobile-friendly FAB menu with zoom controls and export options
 * @module ui/floating-menu
 */

import { state, addCleanupFunction } from "../core/config.js";
import { detectTheme } from "../core/theme.js";
import { throttle } from "../core/utils.js";
import { addManagedListener } from "../core/lifecycle.js";
import { exportDiagram } from "../features/export.js";
import { ICONS } from "./icons.js";
import { createMenuItem } from "./button-factory.js";

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

  container.innerHTML = `
    <!-- Menu Panel (Hidden by default) -->
    <div class="diagview-menu" id="dv-menu-panel">
      <!-- Section 1: Zoom -->
      <div class="dv-menu-sec">
        <div class="dv-menu-lbl">Zoom</div>
        <div class="dv-zoom">
          <button id="dv-zoomout" title="Zoom Out (-)" aria-label="Zoom out">−</button>
          <span class="dv-zoom-val" id="dv-zoom-tag">100%</span>
          <button id="dv-zoomin" title="Zoom In (+)" aria-label="Zoom in">+</button>
          <button id="dv-reset" title="Reset/Fit (Space)" aria-label="Reset zoom">${ICONS.reset}</button>
        </div>
      </div>

      <!-- Section 2: Export -->
      <div class="dv-menu-sec">
        <div class="dv-menu-lbl">Export</div>
        <div class="dv-exp">
          <button data-action="png">PNG</button>
          <button data-action="png-t">PNG-T</button>
          <button data-action="svg">SVG</button>
          <button data-action="webp">WebP</button>
          <button data-action="pdf">PDF</button>
          <button data-action="copy">Copy</button>
        </div>
      </div>

      <!-- Section 3: Tools -->
      <div class="dv-menu-sec">
        <div class="dv-menu-lbl">Tools</div>
        <div id="dv-tools-container"></div>
      </div>
    </div>

    <!-- FAB Button (Grid layout center) -->
    <button class="diagview-fab-btn" id="dv-toggle" aria-label="Toggle menu" style="display: grid; place-items: center;">
      ${ICONS.menu}
    </button>
  `;

  document.body.appendChild(container);

  // Apply theme to FAB
  const fab = container.querySelector("#dv-toggle");
  fab.style.backgroundColor = theme.accent;
  fab.style.color = "#fff";

  // Create tool menu items using button factory
  const toolsContainer = container.querySelector("#dv-tools-container");

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
  const menuPanel = container.querySelector("#dv-menu-panel");
  let isOpen = false;

  const toggleMenu = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    isOpen = !isOpen;
    menuPanel.classList.toggle("active", isOpen);
    fab.classList.toggle("open", isOpen);
    fab.innerHTML = isOpen ? ICONS.close : ICONS.menu;
    fab.setAttribute("aria-expanded", isOpen);
  };

  fab.onclick = toggleMenu;

  // Close when clicking outside
  const handleClickOutside = (e) => {
    if (isOpen && !container.contains(e.target)) {
      isOpen = false;
      menuPanel.classList.remove("active");
      fab.classList.remove("open");
      fab.innerHTML = ICONS.menu;
      fab.setAttribute("aria-expanded", "false");
    }
  };

  // Use timeout to avoid immediate close if triggered by a bubble event
  setTimeout(() => {
    addManagedListener(document, "click", handleClickOutside);
  }, 0);

  // --- Event Wiring ---

  // Helper for simple clicks
  const bindClick = (id, fn) => {
    const btn = container.querySelector(`#${id}`);
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        fn(e);
      };
    }
  };

  // Zoom controls
  bindClick("dv-zoomin", () => state.activePanzoom?.zoomIn());
  bindClick("dv-zoomout", () => state.activePanzoom?.zoomOut());
  bindClick("dv-reset", () => state.activePanzoom?.reset({ animate: true }));

  // Export Grid Delegation
  const expGrid = container.querySelector(".dv-exp");
  expGrid.onclick = (e) => {
    e.stopPropagation();
    const btn = e.target.closest("button");
    if (!btn) return;

    const type = btn.dataset.action;
    btn.classList.add("active");
    setTimeout(() => btn.classList.remove("active"), 200);

    // Call export
    switch (type) {
      case "copy":
        exportDiagram(sourceElement, "copy", clonedSvg);
        break;
      case "png-t":
        exportDiagram(sourceElement, "png-transparent", clonedSvg);
        break;
      case "png":
        exportDiagram(sourceElement, "download", clonedSvg);
        break;
      default:
        exportDiagram(sourceElement, type, clonedSvg);
    }

    toggleMenu();
  };

  // Update zoom display
  if (state.activePanzoom) {
    const zoomTag = container.querySelector("#dv-zoom-tag");
    const updateZoom = throttle((e) => {
      zoomTag.textContent = `${Math.round(e.detail.scale * 100)}%`;
    }, 100);

    addManagedListener(clonedSvg, "panzoomchange", updateZoom);
  }
}
