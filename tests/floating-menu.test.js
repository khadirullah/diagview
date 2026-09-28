/**
 * Floating Menu Tests
 * Tests the FAB toggle, outside-click dismissal, and control wiring.
 */

import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";

// 1. Define mocks BEFORE importing the module under test
jest.unstable_mockModule("../src/features/export.js", () => ({
  exportDiagram: jest.fn(() => Promise.resolve()),
}));
jest.unstable_mockModule("../src/features/lazy/share.js", () => ({
  shareLink: jest.fn(),
  copyShareLink: jest.fn(),
}));
jest.unstable_mockModule("../src/features/lazy/rotate.js", () => ({
  rotateDiagram: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/modal.js", () => ({
  openFullscreen: jest.fn(),
  closeModal: jest.fn(),
}));

// 2. Import the module under test AFTER mocks
const { createFloatingMenu } = await import("../src/ui/floating-menu.js");
const { exportDiagram } = await import("../src/features/export.js");
const { shareLink } = await import("../src/features/lazy/share.js");
const { rotateDiagram } = await import("../src/features/lazy/rotate.js");
const { setupViewportInteractions } = await import("../src/features/panzoom-integration.js");

describe("Floating Menu UI", () => {
  let sourceElement, clonedSvg;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    jest.clearAllMocks();

    // Create mock diagram structure
    sourceElement = document.createElement("div");
    sourceElement.className = "diagram";
    clonedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sourceElement.appendChild(clonedSvg);
    document.body.appendChild(sourceElement);

    // Mock getComputedStyle for theme detection
    window.getComputedStyle = jest.fn().mockReturnValue({
      getPropertyValue: jest.fn().mockReturnValue("#ffffff"),
      display: "block",
      visibility: "visible",
      opacity: "1",
    });
  });

  test("createFloatingMenu creates the FAB and panel in the DOM", () => {
    createFloatingMenu(sourceElement, clonedSvg);

    const container = document.getElementById("diagview-temp-menu");
    const toggle = document.getElementById("dv-toggle");
    const panel = document.getElementById("dv-menu-panel");

    expect(container).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(panel).not.toBeNull();
  });

  test("footer links that open a new tab do not expose window.opener", () => {
    createFloatingMenu(sourceElement, clonedSvg);

    const links = [...document.querySelectorAll('.dv-menu-footer a[target="_blank"]')];
    expect(links).toHaveLength(2);
    links.forEach((a) => expect(a.rel).toBe("noopener noreferrer"));
  });

  test("FAB colour follows --dv-accent so accent changes apply while open", () => {
    // jsdom drops var() values, so watch the assignment itself
    const proto = Object.getPrototypeOf(document.body.style);
    const set = jest.spyOn(proto, "backgroundColor", "set");
    createFloatingMenu(sourceElement, clonedSvg);
    expect(set).toHaveBeenCalledWith("var(--dv-accent)");
    set.mockRestore();
  });

  test("FAB toggle button opens and closes the menu", () => {
    createFloatingMenu(sourceElement, clonedSvg);
    const toggle = document.getElementById("dv-toggle");
    const panel = document.getElementById("dv-menu-panel");

    // Initially closed
    expect(panel.classList.contains("active")).toBe(false);

    // First click -> open
    toggle.click();
    expect(panel.classList.contains("active")).toBe(true);

    // Second click -> close
    toggle.click();
    expect(panel.classList.contains("active")).toBe(false);
  });

  test("Clicking outside the menu closes it", () => {
    jest.useFakeTimers();
    state.isModalOpen = true;
    createFloatingMenu(sourceElement, clonedSvg);
    const toggle = document.getElementById("dv-toggle");
    const panel = document.getElementById("dv-menu-panel");

    // Open menu
    toggle.click();
    expect(panel.classList.contains("active")).toBe(true);

    // Advance timers so the outside-click listener is attached
    jest.advanceTimersByTime(100);

    // Click on a separate element outside the container
    const outsideElement = document.createElement("div");
    document.body.appendChild(outsideElement);
    outsideElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(panel.classList.contains("active")).toBe(false);
    jest.useRealTimers();
  });

  describe("panning the diagram with the menu open", () => {
    let viewport, panel;

    const pointer = (type, x, pointerType) =>
      viewport.firstChild.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 }), {
          isPrimary: true,
          pointerType,
        }),
      );

    beforeEach(() => {
      jest.useFakeTimers();
      state.isModalOpen = true;
      viewport = document.createElement("div");
      viewport.className = "diagview-modal-viewport";
      viewport.appendChild(document.createElement("div"));
      document.body.appendChild(viewport);
      setupViewportInteractions(viewport, viewport.firstChild, {
        reset: jest.fn(),
        zoomWithWheel: jest.fn(),
      });
      createFloatingMenu(sourceElement, clonedSvg);
      panel = document.getElementById("dv-menu-panel");
      document.getElementById("dv-toggle").click();
      jest.advanceTimersByTime(100);
    });

    afterEach(() => {
      for (const fn of Array.from(state.modalCleanupFunctions)) fn();
      state.modalCleanupFunctions.clear();
      jest.useRealTimers();
    });

    test("a mouse drag closes the menu even though its click is swallowed", () => {
      pointer("pointerdown", 10, "mouse");
      pointer("pointerup", 160, "mouse");
      viewport.firstChild.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      expect(panel.classList.contains("active")).toBe(false);
    });

    test("a finger pan leaves the menu open", () => {
      pointer("pointerdown", 10, "touch");
      pointer("pointerup", 160, "touch");
      expect(panel.classList.contains("active")).toBe(true);
    });
  });

  test("Interaction: Share button calls shareLink", async () => {
    createFloatingMenu(sourceElement, clonedSvg);
    const shareBtn = document.getElementById("dv-share");
    shareBtn.click();

    await new Promise((r) => setTimeout(r, 10));
    expect(shareLink).toHaveBeenCalled();
  });

  test("Interaction: Rotate button calls rotateDiagram", async () => {
    createFloatingMenu(sourceElement, clonedSvg);
    const rotateBtn = document.getElementById("dv-rotate");
    rotateBtn.click();

    await new Promise((r) => setTimeout(r, 10));
    expect(rotateDiagram).toHaveBeenCalled();
  });

  test("Interaction: Export buttons call exportDiagram", async () => {
    createFloatingMenu(sourceElement, clonedSvg);
    const pngBtn = document.querySelector('[data-action="png"]');
    pngBtn.click();

    await new Promise((r) => setTimeout(r, 10));
    expect(exportDiagram).toHaveBeenCalledWith(sourceElement, "png", expect.any(Object));
  });

  test("Interaction: Transparent toggle switch disables JPEG and PDF buttons", () => {
    createFloatingMenu(sourceElement, clonedSvg);
    const transChk = document.getElementById("dv-exp-trans");
    const jpegBtn = document.querySelector('[data-action="jpeg"]');
    const pdfBtn = document.querySelector('[data-action="pdf"]');

    expect(jpegBtn.hasAttribute("disabled")).toBe(false);
    expect(pdfBtn.hasAttribute("disabled")).toBe(false);

    // Toggle transparent ON
    transChk.checked = true;
    transChk.dispatchEvent(new Event("change"));

    expect(jpegBtn.hasAttribute("disabled")).toBe(true);
    expect(pdfBtn.hasAttribute("disabled")).toBe(true);

    // Toggle transparent OFF
    transChk.checked = false;
    transChk.dispatchEvent(new Event("change"));

    expect(jpegBtn.hasAttribute("disabled")).toBe(false);
    expect(pdfBtn.hasAttribute("disabled")).toBe(false);
  });
  describe("Canvas theme selection", () => {
    const selected = () =>
      [
        ...document.querySelectorAll(
          "#dv-menu-panel .dv-theme-modes:not(.dv-text-modes) button, .dv-swatches > *",
        ),
      ]
        .filter((el) => el.classList.contains("active"))
        .map((el) => el.dataset.canvas || el.title);

    test("marks only the option that matches the canvas", () => {
      createFloatingMenu(sourceElement, clonedSvg);
      expect(selected()).toEqual(["auto"]);

      document.querySelector('[data-canvas="light"]').click();
      expect(selected()).toEqual(["light"]);

      document.querySelector('[data-canvas="#1e293b"]').click();
      expect(selected()).toEqual(["#1e293b"]);

      document.querySelector('[data-canvas="auto"]').click();
      expect(selected()).toEqual(["auto"]);
    });

    test("custom colour picker clears the swatches and marks itself", () => {
      createFloatingMenu(sourceElement, clonedSvg);
      document.querySelector('[data-canvas="#0f172a"]').click();

      const input = document.querySelector(".dv-custom-color-input");
      input.value = "#123456";
      input.dispatchEvent(new Event("input"));
      expect(selected()).toEqual(["Custom Color Picker"]);

      // A picked colour that equals a swatch marks that swatch instead
      input.value = "#ffffff";
      input.dispatchEvent(new Event("input"));
      expect(selected()).toEqual(["#ffffff"]);
    });

    test("reflects the current canvas when rebuilt or reopened", () => {
      state.activeCanvasThemeMode = "custom";
      state.customCanvasColor = "#0B0F19";
      createFloatingMenu(sourceElement, clonedSvg);
      expect(selected()).toEqual(["#0b0f19"]);

      // Changed elsewhere (e.g. a share link) while the menu was closed
      state.activeCanvasThemeMode = "dark";
      state.customCanvasColor = null;
      document.getElementById("dv-toggle").click();
      expect(selected()).toEqual(["dark"]);
    });
  });
});
