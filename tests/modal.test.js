import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";

// Mock dependencies
jest.unstable_mockModule("../src/ui/modal-controls.js", () => ({
  syncBrandingVisibility: jest.fn(),
  closeModal: jest.fn(),
  lockBodyScroll: jest.fn(),
}));
jest.unstable_mockModule("../src/core/theme.js", () => ({
  detectTheme: jest.fn(() => ({ bg: "#fff", text: "#000" })),
  syncTheme: jest.fn(),
}));
jest.unstable_mockModule("../src/core/lifecycle.js", () => ({
  addModalListener: jest.fn(),
  addModalCleanupFunction: jest.fn(),
}));
jest.unstable_mockModule("../src/core/svg-clone.js", () => ({
  cloneSVGForModal: jest.fn((svg) => svg.cloneNode(true)),
}));

const panzoomMock = {
  zoom: jest.fn(),
  pan: jest.fn(),
  getScale: jest.fn(() => 1),
  getPan: jest.fn(() => ({ x: 0, y: 0 })),
  reset: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  setOptions: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

jest.unstable_mockModule("../src/features/panzoom-integration.js", () => ({
  initializePanzoom: jest.fn(() => panzoomMock),
  setupViewportInteractions: jest.fn(),
  resetTouchState: jest.fn(),
  saveZoomState: jest.fn(),
  restoreZoomState: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/focus-manager.js", () => ({
  setupModalFocusManagement: jest.fn(),
  saveFocus: jest.fn(),
  setInitialFocus: jest.fn(),
  invalidateFocusableCache: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/floating-menu.js", () => ({
  createFloatingMenu: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/viewport.js", () => ({
  pushModalHistoryState: jest.fn(),
  startVisualViewportSync: jest.fn(),
}));

const { createModal, openFullscreen } = await import("../src/ui/modal.js");

describe("Modal System", () => {
  let container, svg;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "diagram";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);
    createModal();
    jest.clearAllMocks();
  });

  test("createModal is a singleton", () => {
    const modal1 = document.getElementById("diagview-modal");
    createModal();
    const modal2 = document.getElementById("diagview-modal");
    expect(modal1).toBe(modal2);
  });

  test("openFullscreen opens modal and applies animation class if enabled", async () => {
    updateConfig({ animateOpen: true });
    await openFullscreen(container);
    const modal = document.getElementById("diagview-modal");
    expect(modal.classList.contains("open")).toBe(true);
    expect(modal.classList.contains("animate-open")).toBe(true);
  });

  test("openFullscreen respects explicit zoom option", async () => {
    await openFullscreen(container, { zoom: 2.5 });
    // Wait for lazy imports in _initCoreInteractions
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(panzoomMock.zoom).toHaveBeenCalledWith(2.5, expect.any(Object));
  });

  test("openFullscreen bails if no SVG found", () => {
    const emptyContainer = document.createElement("div");
    openFullscreen(emptyContainer);
    expect(state.isModalOpen).toBe(false);
  });

  test("text select toggle pauses panzoom", async () => {
    await openFullscreen(container);
    state.activePanzoom = panzoomMock;

    const textSelectBtn = document.getElementById("dv-text-select-desktop-btn");
    textSelectBtn.click();
    expect(panzoomMock.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ disablePan: true, disableZoom: true }),
    );
    expect(
      document.getElementById("diagview-modal-viewport").classList.contains("dv-text-select"),
    ).toBe(true);

    // Toggle off
    textSelectBtn.click();
    expect(panzoomMock.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ disablePan: false, disableZoom: false }),
    );
  });

  test("search toggle updates UI state", () => {
    const searchBtn = document.getElementById("dv-search-icon-btn");
    const topbar = document.querySelector(".diagview-topbar");

    searchBtn.click();
    expect(topbar.classList.contains("search-open")).toBe(true);
    expect(searchBtn.getAttribute("aria-expanded")).toBe("true");

    searchBtn.click();
    expect(topbar.classList.contains("search-open")).toBe(false);
  });

  test("closeModal is called on fullscreenchange if no element remains", async () => {
    const { addModalListener } = await import("../src/core/lifecycle.js");
    const { closeModal } = await import("../src/ui/modal-controls.js");

    await openFullscreen(container);

    // Find the listener callback
    const call = addModalListener.mock.calls.find((c) => c[1] === "fullscreenchange");
    const callback = call[2];

    // Simulate exit fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });

    callback();
    expect(closeModal).toHaveBeenCalled();
  });

  test("resize handler resets panzoom on significant change", async () => {
    await openFullscreen(container);
    state.activePanzoom = panzoomMock;

    const { addModalListener } = await import("../src/core/lifecycle.js");
    const call = addModalListener.mock.calls.find((c) => c[0] === window && c[1] === "resize");
    const callback = call[2];

    // Change window size significantly (>20%)
    window.innerWidth = 100;
    window.innerHeight = 100;

    callback();

    // It's throttled and uses rAF, so wait
    await new Promise((r) => setTimeout(r, 400));
    expect(panzoomMock.reset).toHaveBeenCalled();
  });
});
