/**
 * Modal Controls Tests
 * closeModal awaits lazy imports while isModalOpen is still true; a second
 * Escape/close-click in that window used to run the whole teardown twice.
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import {
  closeModal,
  lockBodyScroll,
  unlockBodyScroll,
  syncBrandingVisibility,
} from "../src/ui/modal-controls.js";
import { syncTheme, teardownThemeWatchers } from "../src/core/theme.js";

describe("closeModal re-entrancy guard", () => {
  test("concurrent closeModal calls run the teardown (and onClose) exactly once", async () => {
    resetConfig();
    document.body.innerHTML = "";
    const onClose = jest.fn();
    updateConfig({ onClose });
    state.isModalOpen = true;
    state.isModalClosing = false;

    // Fire twice without awaiting the first — simulates rapid double-Escape
    await Promise.all([closeModal(), closeModal()]);

    // A third call after completion must also be a no-op
    await closeModal();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(state.isModalOpen).toBe(false);
    expect(state.isModalClosing).toBe(false);
  });
});

describe("closing the viewer leaves the page's fullscreen alone", () => {
  afterEach(() => {
    delete document.fullscreenElement;
    delete document.exitFullscreen;
  });

  test("a page in the browser's fullscreen stays in it", async () => {
    resetConfig();
    document.body.innerHTML = '<div id="diagview-modal" class="open"></div>';
    // jsdom has no Fullscreen API, so stand in for a page that entered it
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    const exitFullscreen = jest.fn(() => Promise.resolve());
    Object.defineProperty(document, "exitFullscreen", {
      value: exitFullscreen,
      configurable: true,
    });
    state.isModalOpen = true;
    state.isModalClosing = false;

    await closeModal();

    expect(state.isModalOpen).toBe(false);
    expect(document.getElementById("diagview-modal").classList.contains("open")).toBe(false);
    expect(exitFullscreen).not.toHaveBeenCalled();
    expect(document.fullscreenElement).toBe(document.documentElement);
  });
});

describe("scroll lock leaves <body> as it found it", () => {
  const body = document.body;

  afterEach(() => {
    body.removeAttribute("style");
    state.modalCleanupFunctions.clear();
  });

  test("no empty style attribute is left on a body that had none", () => {
    body.removeAttribute("style");
    lockBodyScroll();
    expect(body.style.overflow).toBe("hidden");

    unlockBodyScroll();

    expect(body.hasAttribute("style")).toBe(false);
  });

  test("the page's own body style is kept", () => {
    body.setAttribute("style", "margin: 0");
    lockBodyScroll();
    unlockBodyScroll();

    expect(body.getAttribute("style")).toBe("margin: 0px;");
  });

  test("an empty style attribute the page wrote itself is kept", () => {
    body.setAttribute("style", "");
    lockBodyScroll();
    unlockBodyScroll();

    expect(body.getAttribute("style")).toBe("");
  });

  test("the page's own inline overflow comes back on <body> and <html>", () => {
    const root = document.documentElement;
    body.setAttribute("style", "overflow: hidden");
    root.style.overflowY = "scroll";
    lockBodyScroll();
    expect(root.style.overflow).toBe("hidden");

    unlockBodyScroll();

    expect(body.style.overflow).toBe("hidden");
    expect(root.style.overflow).toBe("");
    expect(root.style.overflowY).toBe("scroll");
    root.removeAttribute("style");
  });
});

describe("scroll lock gives the page its scroll-behavior back", () => {
  const root = document.documentElement;
  let frames, raf, caf;

  // Let a restore frame left by an earlier test run first
  beforeAll(() => new Promise((resolve) => requestAnimationFrame(resolve)));

  beforeEach(() => {
    frames = [];
    raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = () => {};
    });
  });

  afterEach(() => {
    raf.mockRestore();
    caf.mockRestore();
    root.removeAttribute("style");
    document.body.removeAttribute("style");
    state.modalCleanupFunctions.clear();
  });

  const runFrames = () => frames.splice(0).forEach((cb) => cb());

  test("a reopen before the close has put it back keeps the page's value", () => {
    root.style.scrollBehavior = "smooth";
    lockBodyScroll();
    unlockBodyScroll();
    // Reopen before the frame that restores scroll-behavior
    lockBodyScroll();
    expect(root.style.scrollBehavior).toBe("auto");
    unlockBodyScroll();
    runFrames();

    expect(root.style.scrollBehavior).toBe("smooth");
  });
});

describe("destroy() with the viewer open leaves <html> as it found it", () => {
  const root = document.documentElement;
  let frames, raf;

  beforeEach(() => {
    resetConfig();
    frames = [];
    raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
  });

  afterEach(() => {
    raf.mockRestore();
    root.removeAttribute("style");
    state.modalCleanupFunctions.clear();
  });

  // Close, then teardown, then the frame that restores scroll-behavior
  const closeAndDestroy = () => {
    syncTheme();
    lockBodyScroll();
    unlockBodyScroll();
    teardownThemeWatchers();
    frames.forEach((cb) => cb());
  };

  test("no empty style attribute is left on an <html> that had none", () => {
    root.removeAttribute("style");
    closeAndDestroy();
    expect(root.hasAttribute("style")).toBe(false);
  });

  test("an empty style attribute the page wrote itself is kept", () => {
    root.setAttribute("style", "");
    closeAndDestroy();
    expect(root.getAttribute("style")).toBe("");
  });
});

describe("shortcut hint", () => {
  test("hides with showKeyboardHelp false and comes back when it is turned on", () => {
    resetConfig();
    document.body.innerHTML = '<div id="diagview-modal"></div>';
    const modal = document.getElementById("diagview-modal");
    syncBrandingVisibility();
    expect(modal.classList.contains("dv-no-help")).toBe(false);
    updateConfig({ showKeyboardHelp: false });
    syncBrandingVisibility();
    expect(modal.classList.contains("dv-no-help")).toBe(true);
    updateConfig({ showKeyboardHelp: true });
    syncBrandingVisibility();
    expect(modal.classList.contains("dv-no-help")).toBe(false);
  });
});
