/**
 * v1.0.11 regression test: closeModal re-entrancy guard.
 * closeModal awaits lazy imports while isModalOpen is still true; a second
 * Escape/close-click in that window used to run the whole teardown twice.
 * Kept separate from v1011-fixes.test.js, which mocks modal-controls.
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { closeModal } from "../src/ui/modal-controls.js";

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
