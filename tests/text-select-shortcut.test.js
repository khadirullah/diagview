/**
 * Regression: the "T" text-select shortcut (dv:toggle-text-select event)
 * must keep working after the modal has been closed and reopened.
 * The subscription is created once per modal DOM, so it must not be torn
 * down by the per-session modal cleanup.
 */
import { jest } from "@jest/globals";
import {
  state,
  resetConfig,
  runModalCleanupFunctions,
  runCleanupFunctions,
} from "../src/core/config.js";

jest.unstable_mockModule("../src/ui/modal-controls.js", () => ({
  syncBrandingVisibility: jest.fn(),
  closeModal: jest.fn(),
  lockBodyScroll: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/floating-menu.js", () => ({
  createFloatingMenu: jest.fn(),
}));
jest.unstable_mockModule("../src/ui/viewport.js", () => ({
  pushModalHistoryState: jest.fn(),
  startVisualViewportSync: jest.fn(),
}));

const { createModal } = await import("../src/ui/modal.js");

describe("Text-select shortcut across modal sessions", () => {
  let panzoomMock;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    panzoomMock = { setOptions: jest.fn() };
    createModal();
    state.activePanzoom = panzoomMock;
    state.isModalOpen = true;
  });

  afterEach(() => {
    runCleanupFunctions();
    resetConfig();
  });

  const viewport = () => document.getElementById("diagview-modal-viewport");

  test("event toggles text-select on the first session", () => {
    state.events.emit("dv:toggle-text-select");
    expect(viewport().classList.contains("dv-text-select")).toBe(true);
    expect(panzoomMock.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ disablePan: true, disableZoom: true }),
    );
  });

  test("event still toggles text-select after a close/reopen cycle", () => {
    // Simulate closeModal's per-session teardown, then a reopen
    // (createModal is idempotent and will not re-wire events).
    runModalCleanupFunctions();
    createModal();
    state.activePanzoom = panzoomMock;
    state.isModalOpen = true;

    state.events.emit("dv:toggle-text-select");
    expect(viewport().classList.contains("dv-text-select")).toBe(true);
  });

  test("the notice shows the toolbar I-beam, accent when on and grey when off", async () => {
    const { ICONS } = await import("../src/ui/icons.js");
    const beam = new DOMParser()
      .parseFromString(ICONS.textSelect, "image/svg+xml")
      .documentElement.querySelectorAll("line").length;
    const notice = async () => {
      await new Promise((r) => setTimeout(r, 0));
      const t = [...document.querySelectorAll(".diagview-toast")].pop();
      return {
        type: t.className,
        text: t.textContent,
        lines: t.querySelectorAll("svg.diagview-toast-icon line").length,
      };
    };

    state.events.emit("dv:toggle-text-select");
    expect(await notice()).toEqual({
      type: "diagview-toast diagview-toast-success",
      text: "Text select ON, drag to copy",
      lines: beam,
    });
    state.events.emit("dv:toggle-text-select");
    expect(await notice()).toEqual({
      type: "diagview-toast diagview-toast-info",
      text: "Text select OFF",
      lines: beam,
    });
  });

  test("subscription is released on destroy-level cleanup", () => {
    runCleanupFunctions();
    state.events.emit("dv:toggle-text-select");
    expect(viewport().classList.contains("dv-text-select")).toBe(false);
    expect(panzoomMock.setOptions).not.toHaveBeenCalled();
  });
});
