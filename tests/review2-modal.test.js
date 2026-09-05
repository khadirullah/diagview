/**
 * Regression tests for the second review round (modal / export / a11y).
 * Each describe block maps to one commit on the review2/modal branch.
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { setupFocusTrap, invalidateFocusableCache } from "../src/ui/focus-manager.js";
import { createModal, openFullscreen } from "../src/ui/modal.js";
import { closeModal } from "../src/ui/modal-controls.js";
import { setupViewportInteractions, resetTouchState } from "../src/features/panzoom-integration.js";

// ---------------------------------------------------------------------------
// Shared harness: drive the REAL modal with a fake Panzoom implementation
// ---------------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function installFakePanzoom() {
  const instances = [];
  window.Panzoom = jest.fn((el) => {
    let scale = 1;
    let pan = { x: 0, y: 0 };
    const inst = {
      el,
      destroyed: false,
      zoom: jest.fn((s) => {
        scale = s;
      }),
      pan: jest.fn((x, y) => {
        pan = { x, y };
      }),
      getScale: () => scale,
      getPan: () => pan,
      reset: jest.fn(),
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
      zoomWithWheel: jest.fn(),
      setOptions: jest.fn(),
      destroy: jest.fn(() => {
        inst.destroyed = true;
      }),
    };
    instances.push(inst);
    return inst;
  });
  return instances;
}

function makeDiagram(id, index = 0) {
  const container = document.createElement("div");
  container.className = "diagram";
  container.dataset.diagviewId = id;
  container.dataset.diagviewIndex = String(index);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "50");
  rect.setAttribute("height", "50");
  svg.appendChild(rect);
  container.appendChild(svg);
  document.body.appendChild(container);
  return container;
}

async function settle() {
  // Lazy imports + rAF-based hand-offs: a few macrotask turns are enough
  for (let i = 0; i < 4; i++) await wait(20);
}

// ---------------------------------------------------------------------------
// 2. rememberZoom must persist wheel / keyboard / button zooms, not only drags
// ---------------------------------------------------------------------------
describe("rememberZoom saves on panzoomchange and on close", () => {
  let instances;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    sessionStorage.clear();
    instances = installFakePanzoom();
    updateConfig({ rememberZoom: true, showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  const key = (id) => `diagview-zoom-states:${id}`;

  test("a debounced panzoomchange (wheel/keyboard/button zoom) writes the state", async () => {
    const el = makeDiagram("d-remember");
    await openFullscreen(el);
    await settle();
    expect(state.isModalOpen).toBe(true);
    expect(sessionStorage.getItem(key("d-remember"))).toBeNull();

    const pz = instances[0];
    pz.zoom(2.5);
    pz.el.dispatchEvent(new CustomEvent("panzoomchange", { detail: { scale: 2.5, x: 0, y: 0 } }));
    // Not yet (debounced)…
    expect(sessionStorage.getItem(key("d-remember"))).toBeNull();
    await wait(250);
    // …but shortly after, without any panzoomend
    const saved = JSON.parse(sessionStorage.getItem(key("d-remember")));
    expect(saved.scale).toBe(2.5);
  });

  test("closing the modal saves synchronously and reopening restores the scale", async () => {
    const el = makeDiagram("d-remember-close");
    await openFullscreen(el);
    await settle();

    const pz = instances[0];
    pz.zoom(1.75);
    pz.el.dispatchEvent(new CustomEvent("panzoomchange", { detail: { scale: 1.75, x: 0, y: 0 } }));
    // Close before the debounce fires
    await closeModal();
    const saved = JSON.parse(sessionStorage.getItem(key("d-remember-close")));
    expect(saved.scale).toBe(1.75);

    await settle();
    await openFullscreen(el);
    await settle();
    const pz2 = instances[1];
    expect(pz2.zoom).toHaveBeenCalledWith(1.75, expect.anything());
  });
});

// ---------------------------------------------------------------------------
// 3. A close that lands while openFullscreen is awaiting must not leave a
//    half-initialised session behind
// ---------------------------------------------------------------------------
describe("close during openFullscreen's awaits leaves no stale session", () => {
  let instances;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    sessionStorage.clear();
    instances = installFakePanzoom();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  test("open immediately followed by close in the same tick settles clean", async () => {
    const calls = [];
    updateConfig({
      onOpen: () => calls.push("open"),
      onClose: () => calls.push("close"),
    });
    const el = makeDiagram("d-race");

    const opening = openFullscreen(el);
    const closing = closeModal();
    await Promise.all([opening, closing]);
    await settle();

    expect(state.isModalOpen).toBe(false);
    expect(state.isModalOpening).toBe(false);
    expect(state.isModalClosing).toBe(false);
    expect(document.getElementById("diagview-temp-menu")).toBeNull();
    expect(state.modalCleanupFunctions.size).toBe(0);
    expect(state.activePanzoom).toBeNull();
    // onOpen must never run after onClose
    const closeIdx = calls.indexOf("close");
    const openIdx = calls.lastIndexOf("open");
    expect(closeIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBeLessThan(closeIdx);

    // ...and a later open must still work (isModalOpening was reset)
    await openFullscreen(el);
    await settle();
    expect(state.isModalOpen).toBe(true);
    expect(document.getElementById("diagview-temp-menu")).not.toBeNull();
    expect(instances.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. A single tap shortly after a pinch must not count as a double tap
// ---------------------------------------------------------------------------
describe("touch: tap after pinch does not reset the zoom", () => {
  let viewport, element, panzoom;

  const touch = (type, count) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = Array.from({ length: count }, (_, i) => ({ clientX: i * 50, clientY: 0 }));
    viewport.dispatchEvent(ev);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    resetConfig();
    resetTouchState();
    state.isModalOpen = true;
    document.body.innerHTML = "";
    viewport = document.createElement("div");
    element = document.createElement("div");
    viewport.appendChild(element);
    document.body.appendChild(viewport);
    panzoom = {
      zoomWithWheel: jest.fn(),
      reset: jest.fn(),
      getScale: jest.fn(() => 1),
    };
    setupViewportInteractions(viewport, element, panzoom);
  });

  afterEach(() => {
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
    state.isModalOpen = false;
    jest.useRealTimers();
  });

  test("pinch end followed by a single tap within 300 ms does not reset", () => {
    touch("touchstart", 2);
    touch("touchend", 0); // pinch finished
    expect(state.touchState.isPinching).toBe(false);

    jest.advanceTimersByTime(120);
    touch("touchstart", 1);
    touch("touchend", 0); // a lone tap

    expect(panzoom.reset).not.toHaveBeenCalled();
  });

  test("a real double tap still resets", () => {
    touch("touchstart", 1);
    touch("touchend", 0);
    jest.advanceTimersByTime(120);
    touch("touchstart", 1);
    touch("touchend", 0);

    expect(panzoom.reset).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 1. Focus trap must only cycle through elements that are actually rendered
// ---------------------------------------------------------------------------
describe("focus trap ignores unrendered and closed-search controls", () => {
  let modal, cleanupTrap;
  const el = (tag, id, cls, parent) => {
    const n = document.createElement(tag);
    if (id) n.id = id;
    if (cls) n.className = cls;
    if (tag === "a") n.href = "#";
    parent.appendChild(n);
    return n;
  };

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    invalidateFocusableCache();

    // jsdom has no layout: emulate checkVisibility() via a data-hidden marker
    // on the display:none ancestor (what .dv-topbar-actions is on desktop).
    Element.prototype.checkVisibility = function () {
      return !this.closest("[data-hidden]");
    };

    modal = document.createElement("div");
    modal.id = "diagview-modal";
    modal.tabIndex = -1;
    document.body.appendChild(modal);

    const topbar = el("div", null, "diagview-topbar", modal);
    const actions = el("div", null, "dv-topbar-actions", topbar);
    actions.dataset.hidden = "1"; // desktop: display:none
    el("button", "dv-search-icon-btn", "dv-icon-btn", actions);
    el("button", "dv-text-select-btn", "dv-icon-btn", actions);
    el("a", null, "diagview-branding", topbar);
    const searchContainer = el("div", null, "diagview-search-container", topbar);
    el("input", "diagview-search", "diagview-search-input", searchContainer);
    el("button", "diagview-close", "diagview-close-btn", topbar);
    el("button", "dv-toggle", "diagview-fab", modal);

    state.isModalOpen = true;
    cleanupTrap = setupFocusTrap();
  });

  afterEach(() => {
    cleanupTrap?.();
    delete Element.prototype.checkVisibility;
    state.isModalOpen = false;
  });

  const pressTab = (shift = false) => {
    const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, cancelable: true });
    document.activeElement.dispatchEvent(ev);
    return ev;
  };

  test("Tab from the last control wraps to the first RENDERED control", () => {
    document.getElementById("dv-toggle").focus();
    const ev = pressTab();
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement.className).toBe("diagview-branding");
  });

  test("Shift+Tab from the first rendered control wraps to the last control", () => {
    document.querySelector(".diagview-branding").focus();
    const ev = pressTab(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe("dv-toggle");
  });

  test("inputs inside the collapsed mobile search container are skipped", () => {
    // Mobile: action row rendered, branding hidden, search collapsed
    document.querySelector(".dv-topbar-actions").removeAttribute("data-hidden");
    document.querySelector(".diagview-branding").dataset.hidden = "1";
    const container = document.querySelector(".diagview-search-container");
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    invalidateFocusableCache();

    // Mid-list Tab steps over the collapsed search input straight to Close
    document.getElementById("dv-text-select-btn").focus();
    pressTab();
    expect(document.activeElement.id).toBe("diagview-close");

    document.getElementById("dv-toggle").focus();
    pressTab();
    expect(document.activeElement.id).toBe("dv-search-icon-btn");

    // Shift+Tab from the search icon wraps to the FAB — never the hidden input
    pressTab(true);
    expect(document.activeElement.id).toBe("dv-toggle");

    // Opening search (class + styles) rebuilds the list and exposes the input
    document.querySelector(".diagview-topbar").classList.add("search-open");
    container.style.opacity = "";
    container.style.pointerEvents = "";
    document.querySelector(".dv-topbar-actions").dataset.hidden = "1";
    invalidateFocusableCache();

    document.getElementById("dv-toggle").focus();
    pressTab();
    expect(document.activeElement.id).toBe("diagview-search");
  });
});
