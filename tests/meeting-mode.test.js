import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";

// Mock toast.js before importing meeting-mode.js
jest.unstable_mockModule("../src/ui/toast.js", () => ({
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
}));

const { showSuccessToast } = await import("../src/ui/toast.js");
const { enableMeetingMode, disableMeetingMode, toggleMeetingMode, resetMeetingState } =
  await import("../src/features/lazy/meeting-mode.js");

// JSDOM has no PointerEvent, so build one from a MouseEvent
const pointerMove = (x, y, isPrimary = true) => {
  const e = new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "isPrimary", { value: isPrimary });
  return e;
};

describe("Meeting Mode", () => {
  let viewport, laser;

  beforeEach(() => {
    resetConfig();
    resetMeetingState();
    document.body.innerHTML = `
      <div id="diagview-modal-viewport"></div>
      <div id="diagview-laser" style="display: none"></div>
      <button id="dv-meeting" data-action="meeting"></button>
    `;
    viewport = document.getElementById("diagview-modal-viewport");
    laser = document.getElementById("diagview-laser");
    jest.clearAllMocks();
  });

  test("enableMeetingMode sets state and shows laser", () => {
    enableMeetingMode();
    expect(state.meetingMode).toBe(true);
    expect(viewport.classList.contains("meeting")).toBe(true);
    expect(laser.style.display).toBe("block");
    expect(showSuccessToast).toHaveBeenCalledWith(expect.stringContaining("Laser pointer active"));
  });

  test("pointer movement centres the laser on the cursor", () => {
    enableMeetingMode();
    viewport.dispatchEvent(pointerMove(500, 400));
    // The stylesheet centres the 28px dot with translate(-50%, -50%); the
    // inline transform must keep that or the dot's top-left lands on the cursor
    expect(laser.style.transform).toBe("translate3d(500px, 400px, 0) translate(-50%, -50%)");
  });

  test("a second finger does not move the laser", () => {
    enableMeetingMode();
    viewport.dispatchEvent(pointerMove(150, 250));
    viewport.dispatchEvent(pointerMove(600, 700, false));
    expect(laser.style.transform).toBe("translate3d(150px, 250px, 0) translate(-50%, -50%)");
  });

  test("laser position ignores visualViewport.scale (modal is not counter-scaled)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { scale: 2, offsetLeft: 0, offsetTop: 0 },
    });
    try {
      enableMeetingMode();
      viewport.dispatchEvent(pointerMove(500, 400));
      expect(laser.style.transform).toBe("translate3d(500px, 400px, 0) translate(-50%, -50%)");
    } finally {
      if (original) Object.defineProperty(window, "visualViewport", original);
      else delete window.visualViewport;
    }
  });

  test("does not write the unused state.laserPointer", () => {
    enableMeetingMode();
    expect(state.laserPointer).toBeNull();
  });

  test("disableMeetingMode resets state and hides laser", () => {
    enableMeetingMode();
    disableMeetingMode();
    expect(state.meetingMode).toBe(false);
    expect(viewport.classList.contains("meeting")).toBe(false);
    expect(laser.style.display).toBe("none");
    expect(showSuccessToast).toHaveBeenCalledWith("Meeting mode OFF");
  });

  test("the laser stops following the pointer after disable", () => {
    enableMeetingMode();
    viewport.dispatchEvent(pointerMove(150, 250));
    disableMeetingMode(true);
    viewport.dispatchEvent(pointerMove(600, 700));
    expect(laser.style.transform).toBe("translate3d(150px, 250px, 0) translate(-50%, -50%)");
  });

  test("toggleMeetingMode switches states", () => {
    toggleMeetingMode(); // OFF -> ON
    expect(state.meetingMode).toBe(true);
    toggleMeetingMode(); // ON -> OFF
    expect(state.meetingMode).toBe(false);
  });

  test("toggleMeetingMode updates button state", () => {
    const btn = document.getElementById("dv-meeting");
    toggleMeetingMode(); // ON
    expect(btn.classList.contains("active")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    toggleMeetingMode(); // OFF
    expect(btn.classList.contains("active")).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("enableMeetingMode does nothing if viewport is missing", () => {
    document.body.innerHTML = "";
    enableMeetingMode();
    expect(state.meetingMode).toBe(false);
  });

  test("disableMeetingMode works silently", () => {
    enableMeetingMode();
    jest.clearAllMocks();
    disableMeetingMode(true);
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  test("cleanup function disables meeting mode", async () => {
    const { runModalCleanupFunctions } = await import("../src/core/config.js");
    enableMeetingMode();
    expect(state.meetingMode).toBe(true);

    runModalCleanupFunctions();
    expect(state.meetingMode).toBe(false);
    expect(state.meetingCleanupRegistered).toBe(false);
  });

  test("toggleMeetingMode works even if button is missing", () => {
    document.getElementById("dv-meeting").remove();
    expect(() => toggleMeetingMode()).not.toThrow();
    expect(state.meetingMode).toBe(true);
  });

  test("disableMeetingMode handles missing elements gracefully", () => {
    enableMeetingMode();
    laser.remove();
    expect(() => disableMeetingMode()).not.toThrow();
  });

  test("enableMeetingMode does not re-register cleanup if already registered", () => {
    enableMeetingMode();
    const originalRegister = state.meetingCleanupRegistered;
    enableMeetingMode(); // Should skip the block
    expect(state.meetingCleanupRegistered).toBe(originalRegister);
  });

  test("disableMeetingMode handles missing viewport", () => {
    enableMeetingMode();
    viewport.remove();
    state.activeMeetingHandlers.viewport = null;
    expect(() => disableMeetingMode()).not.toThrow();
  });
});
