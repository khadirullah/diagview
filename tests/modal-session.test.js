/**
 * Modal Session Tests
 * Drives the real modal with a fake Panzoom: rememberZoom persistence,
 * open/close races, the open-while-open guard, text-select and initial focus.
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { createModal, openFullscreen } from "../src/ui/modal.js";
import { closeModal } from "../src/ui/modal-controls.js";
import { clearAllZoomStates, restoreZoomState } from "../src/features/panzoom-integration.js";

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
// rememberZoom must persist wheel / keyboard / button zooms, not only drags
// ---------------------------------------------------------------------------
describe("rememberZoom saves on panzoomchange and on close", () => {
  let instances;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    clearAllZoomStates();
    instances = installFakePanzoom();
    updateConfig({ rememberZoom: true, showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  // restoreZoomState on a Panzoom that is not the active one reports whether
  // a view is remembered without applying it
  const probe = { zoom: jest.fn(), pan: jest.fn() };
  const remembered = (id) => restoreZoomState(id, probe);

  test("a debounced panzoomchange (wheel/keyboard/button zoom) writes the state", async () => {
    const el = makeDiagram("d-remember");
    await openFullscreen(el);
    await settle();
    expect(state.isModalOpen).toBe(true);
    expect(remembered("d-remember")).toBe(false);

    const pz = instances[0];
    pz.zoom(2.5);
    pz.el.dispatchEvent(new CustomEvent("panzoomchange", { detail: { scale: 2.5, x: 0, y: 0 } }));
    // Not yet (debounced)…
    expect(remembered("d-remember")).toBe(false);
    await wait(250);
    // …but shortly after, without any panzoomend
    expect(remembered("d-remember")).toBe(true);
    expect(probe.zoom).not.toHaveBeenCalled();

    await closeModal();
    await settle();
    await openFullscreen(el);
    await settle();
    expect(instances[1].zoom).toHaveBeenCalledWith(2.5, expect.anything());
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
    expect(remembered("d-remember-close")).toBe(true);

    await settle();
    await openFullscreen(el);
    await settle();
    const pz2 = instances[1];
    expect(pz2.zoom).toHaveBeenCalledWith(1.75, expect.anything());
  });

  async function zoomAndClose(el, scale, x, y) {
    await openFullscreen(el);
    await settle();
    const pz = instances[instances.length - 1];
    pz.zoom(scale);
    pz.pan(x, y);
    await closeModal();
    await settle();
  }

  test("the view is remembered even when sessionStorage throws", async () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    const spies = ["getItem", "setItem", "removeItem", "key", "clear"].map((m) =>
      jest.spyOn(Storage.prototype, m).mockImplementation(blocked),
    );
    const wasAvailable = state.isStorageAvailable;
    state.isStorageAvailable = false;
    try {
      const el = makeDiagram("d-blocked");
      await zoomAndClose(el, 1.6, 30, 40);
      await openFullscreen(el);
      await settle();
      const pz = instances[instances.length - 1];
      expect(pz.zoom).toHaveBeenCalledWith(1.6, expect.anything());
      expect(pz.pan).toHaveBeenCalledWith(30, 40, expect.anything());
    } finally {
      state.isStorageAvailable = wasAvailable;
      spies.forEach((s) => s.mockRestore());
    }
  });

  test("nothing is written to sessionStorage", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    try {
      await zoomAndClose(makeDiagram("d-no-storage"), 2, 10, 10);
      expect(setItem).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      setItem.mockRestore();
    }
  });

  test("a diagram opened by code before its lazy init is still remembered", async () => {
    const el = makeDiagram("unused");
    delete el.dataset.diagviewId; // lazy init has not run yet
    await zoomAndClose(el, 2.5, 20, 30);

    expect(el.dataset.diagviewId).toBeTruthy();
    await openFullscreen(el);
    await settle();
    expect(instances[instances.length - 1].zoom).toHaveBeenCalledWith(2.5, expect.anything());
  });

  test("an element DiagView does not know gets no id when opened", async () => {
    const el = makeDiagram("unused");
    delete el.dataset.diagviewId;
    delete el.dataset.diagviewIndex;
    await zoomAndClose(el, 2, 0, 0);

    expect(el.dataset.diagviewId).toBeUndefined();
  });

  test("rememberZoom false stores nothing", async () => {
    updateConfig({ rememberZoom: false });
    const el = makeDiagram("d-off");
    await zoomAndClose(el, 2, 10, 10);

    updateConfig({ rememberZoom: true });
    expect(remembered("d-off")).toBe(false);
  });

  test("each diagram keeps its own view", async () => {
    const first = makeDiagram("d-first", 0);
    const second = makeDiagram("d-second", 1);
    await zoomAndClose(first, 3, 50, 60);

    await openFullscreen(second);
    await settle();
    const pz = instances[instances.length - 1];
    expect(pz.zoom).not.toHaveBeenCalledWith(3, expect.anything());
    expect(pz.zoom).toHaveBeenCalledWith(1, expect.anything());
  });
});

// ---------------------------------------------------------------------------
// A close that lands while openFullscreen is awaiting must not leave a
//    half-initialised session behind
// ---------------------------------------------------------------------------
describe("close during openFullscreen's awaits leaves no stale session", () => {
  let instances;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    clearAllZoomStates();
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
// openFullscreen while the modal is already open must not re-run the
//    open sequence on top of the live session
// ---------------------------------------------------------------------------
describe("openFullscreen is a no-op while the modal is already open", () => {
  let instances;
  const rafCallbacks = [];

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    document.documentElement.style.scrollBehavior = "";
    delete document.documentElement.dataset.dvPrevScrollBehavior;
    clearAllZoomStates();
    instances = installFakePanzoom();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
    document.documentElement.style.scrollBehavior = "";
    rafCallbacks.length = 0;
  });

  test("second open keeps the first session; close restores scroll-behavior", async () => {
    document.documentElement.style.scrollBehavior = "smooth";
    const d0 = makeDiagram("d-first", 0);
    const d1 = makeDiagram("d-second", 1);

    await openFullscreen(d0);
    await settle();
    expect(state.isModalOpen).toBe(true);
    expect(instances.length).toBe(1);
    expect(state.activeSourceElement).toBe(d0);

    await openFullscreen(d1);
    await settle();
    // The live session is untouched: no second panzoom, same source element
    expect(instances.length).toBe(1);
    expect(instances[0].destroyed).toBe(false);
    expect(state.activePanzoom).toBe(instances[0]);
    expect(state.activeSourceElement).toBe(d0);

    await closeModal();
    await settle();
    // unlockBodyScroll restores the stash on the next frame
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
    expect(instances[0].destroyed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Text-select mode must not swallow mousemove (laser pointer needs it)
// ---------------------------------------------------------------------------
describe("text-select mode lets mousemove reach document listeners", () => {
  let viewport, child;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    createModal();
    viewport = document.getElementById("diagview-modal-viewport");
    child = document.createElement("div");
    viewport.appendChild(child);
    viewport.classList.add("dv-text-select");
  });

  afterEach(() => {
    viewport.classList.remove("dv-text-select");
    // createModal registered modal-scoped handlers (focus trap); drop them
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
  });

  test("mousemove and pointermove bubble to document while dv-text-select is on", () => {
    const onMove = jest.fn();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointermove", onMove);

    child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));

    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("pointermove", onMove);
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  test("events that would start a pan are still stopped", () => {
    const onDown = jest.fn();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("pointerdown", onDown);

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    child.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("pointerdown", onDown);
    expect(onDown).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The initial-focus rAF must be cancelled when the modal closes first
// ---------------------------------------------------------------------------
describe("initial-focus rAF is cancelled on close", () => {
  let instances, rafQueue, origRAF, origCAF;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    clearAllZoomStates();
    instances = installFakePanzoom();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();

    // Capture rAF callbacks so the test decides when frames run
    rafQueue = new Map();
    let nextId = 1;
    origRAF = window.requestAnimationFrame;
    origCAF = window.cancelAnimationFrame;
    window.requestAnimationFrame = jest.fn((cb) => {
      const id = nextId++;
      rafQueue.set(id, cb);
      return id;
    });
    window.cancelAnimationFrame = jest.fn((id) => rafQueue.delete(id));
  });

  afterEach(async () => {
    window.requestAnimationFrame = origRAF;
    window.cancelAnimationFrame = origCAF;
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  test("closing right after open leaves focus where restoreFocus put it", async () => {
    const trigger = document.createElement("button");
    trigger.id = "outside-trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const el = makeDiagram("d-raf");
    const opening = openFullscreen(el);
    await closeModal();
    await opening;
    await settle();

    expect(state.isModalOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);

    // Now run every frame callback that is still pending
    for (const cb of Array.from(rafQueue.values())) cb(performance.now());
    rafQueue.clear();

    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById("diagview-modal").contains(document.activeElement)).toBe(false);
    expect(instances.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A diagram over performance.criticalFileLimit must not open or throw
// ---------------------------------------------------------------------------
describe("openFullscreen with a diagram over the size limit", () => {
  let instances;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    instances = installFakePanzoom();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  test("stops before opening and leaves the viewer usable", async () => {
    const small = makeDiagram("d-small", 0);
    const viewport = document.getElementById("diagview-modal-viewport");
    const marker = document.createElement("span");
    viewport.appendChild(marker);

    updateConfig({ performance: { criticalFileLimit: 10 } });
    await expect(openFullscreen(small)).resolves.toBeUndefined();
    await settle();
    expect(state.isModalOpen).toBe(false);
    expect(state.isModalOpening).toBe(false);
    expect(state.activeSourceElement).toBe(null);
    expect(instances.length).toBe(0);
    expect(viewport.contains(marker)).toBe(true);
    expect(document.body.textContent).toContain("Diagram blocked");

    // A normal limit opens the same diagram
    updateConfig({ performance: { criticalFileLimit: 50000000 } });
    await openFullscreen(small);
    await settle();
    expect(state.isModalOpen).toBe(true);
    expect(state.activeSourceElement).toBe(small);
  });
});
