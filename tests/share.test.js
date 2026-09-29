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

  test("generateShareLink keeps enough decimals for a quarter pixel on screen", () => {
    // 10 screen pixels to a unit: two decimals
    const at = (scale) =>
      svg.getScreenCTM.mockReturnValue({
        a: scale,
        b: 0,
        c: 0,
        d: scale,
        e: 0,
        f: 0,
        inverse: () => ({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: 12.3456, f: 7.891 }),
      });
    at(10);
    let link = new URL(generateShareLink(0));
    expect(link.searchParams.get("dv-cx")).toBe("62.35");
    expect(link.searchParams.get("dv-cy")).toBe("57.89");

    // A unit smaller than a pixel needs no decimals
    at(0.1);
    link = new URL(generateShareLink(0));
    expect(link.searchParams.get("dv-cx")).toBe("5012");
    expect(link.searchParams.get("dv-cy")).toBe("5008");
  });

  test("generateShareLink includes search query", () => {
    document.getElementById("diagview-search").value = "test-query";
    const link = generateShareLink(0);
    expect(link).toContain("dv-q=test-query");
  });

  test("generateShareLink drops existing query and hash", () => {
    window.location = new URL("http://localhost/docs/page?token=secret#section");
    const link = generateShareLink(0);
    expect(link).toContain("http://localhost/docs/page?");
    expect(link).not.toContain("token=");
    expect(link).not.toContain("#section");
    expect(link).toContain("dv-idx=0");
  });

  test("generateShareLink works on file:// pages (origin is 'null')", () => {
    window.location = new URL("file:///home/user/docs/index.html");
    expect(window.location.origin).toBe("null");
    const link = generateShareLink(0);
    expect(link).toContain("file:///home/user/docs/index.html?");
    expect(link).toContain("dv-idx=0");
  });

  test("shareLink copies to clipboard", async () => {
    await shareLink(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(showSuccessToast).toHaveBeenCalledWith("Share link copied!");
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

  test("restoreViewFromURL keeps the decimals of the centre", () => {
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=62.35&dv-cy=-7.5");
    const diagram = { id: "diag1" };
    restoreViewFromURL([diagram]);

    const shareState = getPendingShareState(diagram);
    expect(shareState.cx).toBe(62.35);
    expect(shareState.cy).toBe(-7.5);
  });

  test("applyRestoredViewState applies zoom and rotation", async () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-z=2.5&dv-r=180");
    restoreViewFromURL([diagram]);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    // Rotation is now APPLIED via a dynamic import of rotate.js before
    // zoom/pan run — flush the async chain.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(state.activePanzoom.zoom).toHaveBeenCalledWith(2.5, expect.any(Object));
    expect(state.rotationAngle).toBe(180);
  });

  // The corrective pan is deferred one macrotask + one frame so it runs after
  // Panzoom's forced init pan(startX, startY) timer (which otherwise resets it).
  const flushRestoreTiming = () =>
    new Promise((resolve) => setTimeout(() => requestAnimationFrame(resolve)));

  test("applyRestoredViewState triggers matrix-based panning", async () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=100&dv-cy=100");
    restoreViewFromURL([diagram]);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    await flushRestoreTiming();
    expect(state.activePanzoom.pan).toHaveBeenCalled();
  });

  test("generateShareLink returns null if panzoom is missing", () => {
    state.activePanzoom = null;
    expect(generateShareLink(0)).toBeNull();
  });

  test("restoreViewFromURL returns false if no params", () => {
    window.location = new URL("http://localhost/test");
    expect(restoreViewFromURL([])).toBe(false);
  });

  test("applyRestoredViewState falls back to raw x/y if cx/cy missing", async () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-x=150&dv-y=250");
    restoreViewFromURL([diagram]);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    await flushRestoreTiming();
    expect(state.activePanzoom.pan).toHaveBeenCalledWith(150, 250, expect.any(Object));
  });

  test("generateShareLink returns null if geometry mapping fails", () => {
    svg.getScreenCTM.mockReturnValue(null);
    expect(generateShareLink(0)).toBeNull();
  });

  test("shareLink falls back to execCommand if clipboard fails", async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error("Clip error"));
    document.execCommand = jest.fn().mockReturnValue(true);

    await shareLink(0);

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(showSuccessToast).toHaveBeenCalled();
  });

  test("applyRestoredViewState falls back to x/y if cx/cy fails in RAF", async () => {
    const diagram = { id: "diag1" };
    window.location = new URL("http://localhost/test?dv-idx=0&dv-cx=100&dv-cy=100&dv-x=50&dv-y=50");
    restoreViewFromURL([diagram]);

    // Ensure getScreenCTM returns null to trigger the fallback
    svg.getScreenCTM.mockReturnValue(null);

    state.isModalOpen = true;
    applyRestoredViewState(diagram, state.activePanzoom);

    await flushRestoreTiming();
    expect(state.activePanzoom.pan).toHaveBeenCalledWith(50, 50, { animate: false });
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

  test("shareLink says the copy failed when execCommand returns false", async () => {
    window.isSecureContext = false;
    document.execCommand = jest.fn().mockReturnValue(false);

    await shareLink(0);
    expect(showErrorToast).toHaveBeenCalledWith("Failed to copy share link");
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  test.each([
    ["returns false", () => false],
    [
      "throws",
      () => {
        throw new Error("Hard fail");
      },
    ],
  ])("shareLink removes the temp input and restores focus when execCommand %s", async (_, impl) => {
    window.isSecureContext = false;
    document.execCommand = jest.fn().mockImplementation(impl);
    const search = document.getElementById("diagview-search");
    search.focus();
    const inputsBefore = document.querySelectorAll("input").length;

    await shareLink(0);
    expect(document.querySelectorAll("input").length).toBe(inputsBefore);
    expect(document.activeElement).toBe(search);
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

  test("generateShareLink and restoreViewFromURL handle theme mode parameters", () => {
    state.activeCanvasThemeMode = "dark";
    const link = generateShareLink(0);
    expect(link).toContain("dv-t=dark");

    window.location = new URL("http://localhost/test?dv-idx=0&dv-t=dark&dv-c=0b0f19");
    const res = restoreViewFromURL([{}]);
    expect(res).not.toBe(false);
    const pending = getPendingShareState(res.diagram);
    expect(pending.themeMode).toBe("dark");
    expect(pending.customColor).toBe("#0b0f19");
  });

  test("dv-c only accepts 3, 4, 6 or 8 hex digits", () => {
    const restore = (color) => {
      window.location = new URL(`http://localhost/test?dv-idx=0&dv-t=custom&dv-c=${color}`);
      const res = restoreViewFromURL([{}]);
      return getPendingShareState(res.diagram).customColor;
    };

    expect(restore("abcde")).toBeNull();
    expect(restore("abcdefg")).toBeNull();
    expect(restore("abc")).toBe("#abc");
    expect(restore("abcd")).toBe("#abcd");
    expect(restore("abcdef")).toBe("#abcdef");
    expect(restore("abcdef80")).toBe("#abcdef80");
  });
});
