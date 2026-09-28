/**
 * Modal Controls Tests
 * closeModal awaits lazy imports while isModalOpen is still true; a second
 * Escape/close-click in that window used to run the whole teardown twice.
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { closeModal, lockBodyScroll, unlockBodyScroll } from "../src/ui/modal-controls.js";

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
});
