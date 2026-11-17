/**
 * A lazy chunk that fails to load, as it does offline, under a strict CSP or
 * when a CDN errors. The minimap import rejects here.
 */
import { jest } from "@jest/globals";
import { wait } from "./helpers/timers.js";

jest.unstable_mockModule("../src/features/lazy/minimap.js", () => {
  throw new TypeError("Failed to fetch dynamically imported module");
});
jest.unstable_mockModule("../src/features/lazy/share.js", () => {
  throw new TypeError("Failed to fetch dynamically imported module");
});

const { state, resetConfig, updateConfig } = await import("../src/core/config.js");
const { createModal, openFullscreen } = await import("../src/ui/modal.js");
const { closeModal } = await import("../src/ui/modal-controls.js");
const { saveZoomState, clearAllZoomStates } =
  await import("../src/features/panzoom-integration.js");
const { shareStates } = await import("../src/features/share-state.js");

const settle = async () => {
  for (let i = 0; i < 4; i++) await wait(20);
};

function fakePanzoom() {
  window.Panzoom = jest.fn(() => ({
    zoom: jest.fn(),
    pan: jest.fn(),
    getScale: () => 1,
    getPan: () => ({ x: 0, y: 0 }),
    reset: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    zoomWithWheel: jest.fn(),
    setOptions: jest.fn(),
    destroy: jest.fn(),
  }));
}

function makeDiagram() {
  const container = document.createElement("div");
  container.className = "diagram";
  container.dataset.diagviewId = "d-chunk";
  container.dataset.diagviewIndex = "0";
  container.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Node A</text><text>Node B</text></svg>';
  document.body.appendChild(container);
  return container;
}

describe("the minimap chunk fails to load", () => {
  // Every warning in this file. The chunk warns once per page, so the count
  // must not depend on which test opened the viewer first.
  const warnings = [];
  const warn = console.warn;
  beforeAll(() => {
    console.warn = (...args) => warnings.push(args);
  });
  afterAll(() => {
    console.warn = warn;
  });

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    fakePanzoom();
    window.scrollTo = jest.fn();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  test("the viewer still opens and wires search once", async () => {
    const input = document.getElementById("diagview-search");
    const added = jest.spyOn(input, "addEventListener");

    await openFullscreen(makeDiagram());
    await settle();

    expect(state.isModalOpen).toBe(true);
    const inputs = added.mock.calls.filter(([type]) => type === "input");
    const keys = added.mock.calls.filter(([type]) => type === "keydown");
    expect(inputs).toHaveLength(1);
    expect(keys).toHaveLength(1);
  });

  test("one warning names the feature, however often the viewer opens", async () => {
    const diagram = makeDiagram();
    for (let i = 0; i < 2; i++) {
      await openFullscreen(diagram);
      await settle();
      await closeModal();
    }

    const named = warnings.filter(([msg]) => String(msg).includes("minimap feature"));
    expect(named).toHaveLength(1);
    expect(named[0][0]).toBe("DiagView: Could not load the minimap feature, so it does not work");
  });
});

describe("the share chunk fails to load", () => {
  const warn = console.warn;
  beforeAll(() => {
    console.warn = () => {};
  });
  afterAll(() => {
    console.warn = warn;
  });

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    clearAllZoomStates();
    fakePanzoom();
    window.scrollTo = jest.fn();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false, rememberZoom: true });
    createModal();
  });

  afterEach(async () => {
    if (state.isModalOpen) await closeModal();
    await settle();
    delete window.Panzoom;
  });

  test("an open without a share link still restores the view and the search", async () => {
    saveZoomState("d-chunk", { getScale: () => 2.5, getPan: () => ({ x: 0, y: 0 }) });

    await openFullscreen(makeDiagram(), { searchQuery: "Node A" });
    await settle();

    expect(state.activePanzoom.zoom).toHaveBeenCalledWith(2.5, { animate: false });
    expect(document.getElementById("diagview-search").value).toBe("Node A");
  });

  test("a share link open warns, restores the remembered view and keeps the search", async () => {
    saveZoomState("d-chunk", { getScale: () => 2.5, getPan: () => ({ x: 0, y: 0 }) });
    const diagram = makeDiagram();
    shareStates.set(diagram, { scale: 3, cx: 10, cy: 10, query: "Node B" });
    const warnings = [];
    console.warn = (...args) => warnings.push(args);

    await openFullscreen(diagram, { searchQuery: "Node A" });
    await settle();

    expect(warnings.map(([msg]) => msg)).toContain(
      "DiagView: Could not load the share link feature, so it does not work",
    );
    expect(state.activePanzoom.zoom).toHaveBeenCalledWith(2.5, { animate: false });
    expect(document.getElementById("diagview-search").value).toBe("Node A");
  });

  test("the search from a share link survives a failed share chunk", async () => {
    const diagram = makeDiagram();
    shareStates.set(diagram, { scale: 3, cx: 10, cy: 10, query: "Node B" });

    await openFullscreen(diagram);
    await settle();

    expect(document.getElementById("diagview-search").value).toBe("Node B");
  });
});
