/**
 * A lazy chunk that fails to load, as it does offline, under a strict CSP or
 * when a CDN errors. The minimap import rejects here.
 */
import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/features/lazy/minimap.js", () => {
  throw new TypeError("Failed to fetch dynamically imported module");
});

const { state, resetConfig, updateConfig } = await import("../src/core/config.js");
const { createModal, openFullscreen } = await import("../src/ui/modal.js");
const { closeModal } = await import("../src/ui/modal-controls.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  let warnSpy;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    fakePanzoom();
    window.scrollTo = jest.fn();
    updateConfig({ showFirstTimeThemeHint: false, animateOpen: false });
    createModal();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
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
});
