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
  noticeColors: jest.fn((bg) => ({ bg, text: "#fff" })),
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
    // Focus lands before the click returns, so keys typed right after F go
    // to the box instead of the shortcut handler
    expect(document.activeElement).toBe(document.getElementById("diagview-search"));

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
    // No duration of its own, so Panzoom uses zoomAnimationDuration
    expect(panzoomMock.reset).toHaveBeenCalledWith({ animate: true });
  });

  test("a link to a section of the page closes the viewer and goes there", async () => {
    const { closeModal } = await import("../src/ui/modal-controls.js");
    const viewport = document.getElementById("diagview-modal-viewport");
    viewport.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<a xlink:href="#details"><rect/></a><a xlink:href="#other" target="_blank"><rect/></a></svg>';
    const [local, newTab] = viewport.querySelectorAll("a");

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    local.dispatchEvent(click);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(click.defaultPrevented).toBe(true);
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("#details");

    // A link that opens elsewhere is left to the browser
    newTab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(closeModal).toHaveBeenCalledTimes(1);
    location.hash = "";
  });

  test("a link to a part of the diagram goes to the page's own copy of it", async () => {
    const viewport = document.getElementById("diagview-modal-viewport");
    // The viewer's copy carries prefixed ids, the page's diagram the originals
    viewport.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="#dv-mg0abc-x1y2z-node2"><rect/></a>' +
      '<g id="dv-mg0abc-x1y2z-node2"></g></svg>';
    svg.innerHTML = '<g id="node2"></g>';

    viewport
      .querySelector("a")
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(location.hash).toBe("#node2");
    location.hash = "";
  });

  test("a link to the section the address already names still scrolls there", async () => {
    const viewport = document.getElementById("diagview-modal-viewport");
    viewport.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="#details"><rect/></a></svg>';
    const section = document.createElement("section");
    section.id = "details";
    section.scrollIntoView = jest.fn();
    document.body.appendChild(section);
    location.hash = "#details";

    viewport
      .querySelector("a")
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
    location.hash = "";
  });

  test("the wait for the viewer's history step leaves no popstate listener behind", async () => {
    const viewport = document.getElementById("diagview-modal-viewport");
    viewport.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="#details"><rect/></a></svg>';
    history.replaceState({ diagviewModal: true }, "");
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    try {
      viewport
        .querySelector("a")
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      // No popstate comes, so the time limit ends the wait
      await new Promise((resolve) => setTimeout(resolve, 600));

      const listener = add.mock.calls.find(([type]) => type === "popstate")[1];
      expect(remove).toHaveBeenCalledWith("popstate", listener);
      expect(location.hash).toBe("#details");
    } finally {
      add.mockRestore();
      remove.mockRestore();
      history.replaceState(null, "");
      location.hash = "";
    }
  });

  test("links that open a new tab do not expose window.opener", async () => {
    await openFullscreen(container);
    const links = [...document.querySelectorAll('a[target="_blank"]')];
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((a) => expect(a.rel).toBe("noopener noreferrer"));
  });

  test("shows first-time theme hint toast when enabled", async () => {
    localStorage.removeItem("diagview-canvas-hint-shown");
    updateConfig({ showFirstTimeThemeHint: true });
    await openFullscreen(container);
    expect(localStorage.getItem("diagview-canvas-hint-shown")).toBe("true");
    const hint = document.querySelector(".diagview-toast");
    expect(hint.textContent).toBe(
      "Hint: Having visibility issues? Change canvas theme from the menu ☰",
    );
    expect(hint.classList.contains("diagview-toast-menu-hint")).toBe(true);
  });
});
