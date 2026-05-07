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
});
