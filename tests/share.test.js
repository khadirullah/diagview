import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";

// Mock toast.js
jest.unstable_mockModule("../src/ui/toast.js", () => ({
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
}));

const { showSuccessToast, showErrorToast } = await import("../src/ui/toast.js");
const {
  generateShareLink,
  shareLink,
  restoreViewFromURL,
  applyRestoredViewState,
  getPendingShareState,
} = await import("../src/features/lazy/share.js");

describe("Share System", () => {
  let viewport, svg;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = `
      <div id="diagview-modal-viewport">
        <svg></svg>
      </div>
      <input id="diagview-search" value="">
    `;
    viewport = document.getElementById("diagview-modal-viewport");
    svg = viewport.querySelector("svg");

    // Mock SVG Point and Matrix
    const mockPoint = {
      x: 0,
      y: 0,
      matrixTransform: jest.fn().mockImplementation((matrix) => {
        return { x: mockPoint.x * matrix.a + matrix.e, y: mockPoint.y * matrix.d + matrix.f };
      }),
    };

    svg.createSVGPoint = jest.fn().mockReturnValue(mockPoint);
    svg.getScreenCTM = jest.fn().mockReturnValue({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      inverse: jest.fn().mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    });

    svg.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000 });
    viewport.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000 });

    state.activePanzoom = {
      getScale: jest.fn().mockReturnValue(1.0),
      zoom: jest.fn(),
      pan: jest.fn(),
    };

    // Mock window.location
    delete window.location;
    window.location = new URL("http://localhost/test");

    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
    window.isSecureContext = true;

    jest.clearAllMocks();
  });

  test("generateShareLink captures coordinates", () => {
    const link = generateShareLink(0);
    expect(link).toContain("dv-idx=0");
    expect(link).toContain("dv-z=1.000");
    expect(link).toContain("dv-cx=500");
    expect(link).toContain("dv-cy=500");
  });

  test("generateShareLink includes search query", () => {
    document.getElementById("diagview-search").value = "test-query";
    const link = generateShareLink(0);
    expect(link).toContain("dv-q=test-query");
  });

  test("shareLink copies to clipboard", async () => {
    await shareLink(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(showSuccessToast).toHaveBeenCalledWith(expect.stringContaining("copied"));
  });

  test("restoreViewFromURL parses params and sets state", () => {
    window.location = new URL(
      "http://localhost/test?dv-idx=0&dv-z=2.5&dv-cx=100&dv-cy=200&dv-r=90&dv-q=foo",
    );
    const diagram = { id: "diag1" };
    const diagrams = [diagram];
    const result = restoreViewFromURL(diagrams);

    expect(result.index).toBe(0);
    expect(result.diagram).toBe(diagram);

    const shareState = getPendingShareState(diagram);
    expect(shareState.scale).toBe(2.5);
    expect(shareState.cx).toBe(100);
    expect(shareState.cy).toBe(200);
    expect(shareState.rotation).toBe(90);
    expect(shareState.query).toBe("foo");
  });

  test("applyRestoredViewState applies zoom and rotation", () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-z=2.5&dv-r=180");
    restoreViewFromURL([diagram]);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    expect(state.activePanzoom.zoom).toHaveBeenCalledWith(2.5, expect.any(Object));
    expect(state.rotationAngle).toBe(180);
  });

  test("applyRestoredViewState triggers matrix-based panning", (done) => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=100&dv-cy=100");
    restoreViewFromURL([diagram]);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    requestAnimationFrame(() => {
      expect(state.activePanzoom.pan).toHaveBeenCalled();
      done();
    });
  });

  test("generateShareLink returns null if panzoom is missing", () => {
    state.activePanzoom = null;
    expect(generateShareLink(0)).toBeNull();
  });

  test("restoreViewFromURL returns false if no params", () => {
    window.location = new URL("http://localhost/test");
    expect(restoreViewFromURL([])).toBe(false);
  });

  test("applyRestoredViewState falls back to raw x/y if cx/cy missing", () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-x=150&dv-y=250");
    restoreViewFromURL([diagram]);

    applyRestoredViewState(diagram, state.activePanzoom);
    expect(state.activePanzoom.pan).toHaveBeenCalledWith(150, 250, expect.any(Object));
  });

  test("generateShareLink returns null if geometry mapping fails", () => {
    svg.getScreenCTM.mockReturnValue(null);
    expect(generateShareLink(0)).toBeNull();
  });

  test("shareLink falls back to execCommand if clipboard fails", async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error("Clip error"));
    document.execCommand = jest.fn();

    await shareLink(0);

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(showSuccessToast).toHaveBeenCalled();
  });

  test("applyRestoredViewState falls back to x/y if cx/cy fails in RAF", (done) => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=100&dv-cy=100&dv-x=50&dv-y=50");
    restoreViewFromURL([diagram]);

    // Ensure getScreenCTM returns null to trigger the fallback
    svg.getScreenCTM.mockReturnValue(null);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    requestAnimationFrame(() => {
      // Should hit line 309: panzoom.pan(x, y, { animate: false });
      expect(state.activePanzoom.pan).toHaveBeenCalledWith(50, 50, { animate: false });
      done();
    });
  });

  test("restoreViewFromURL returns false for out of bounds index", () => {
    window.location = new URL("http://localhost/test?dv-idx=5");
    expect(restoreViewFromURL([{}])).toBe(false);
  });

  test("shareLink shows error if link generation fails", async () => {
    state.activePanzoom = null;
    await shareLink(0);
    expect(showErrorToast).toHaveBeenCalledWith("Cannot generate share link");
  });

  test("shareLink shows error if both clipboard and execCommand fail", async () => {
    window.isSecureContext = false; // Disable clipboard
    document.execCommand = jest.fn().mockImplementation(() => {
      throw new Error("Hard fail");
    });

    await shareLink(0);
    expect(showErrorToast).toHaveBeenCalledWith("Failed to copy share link");
  });

  test("applyRestoredViewState handles internal geometry errors", (done) => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=100&dv-cy=100");
    restoreViewFromURL([diagram]);

    svg.createSVGPoint.mockImplementation(() => {
      throw new Error("Matrix Boom");
    });

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    requestAnimationFrame(() => {
      // Should not crash
      done();
    });
  });

  test("generateShareLink handles geometry mapping error", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    svg.createSVGPoint.mockImplementation(() => {
      throw new Error("Center fail");
    });

    expect(generateShareLink(0)).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
