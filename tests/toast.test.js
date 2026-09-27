import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { clearThemeCache } from "../src/core/theme.js";
import {
  showToast,
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showProgressToast,
  showWarningToast,
} from "../src/ui/toast.js";
import { ICONS } from "../src/ui/icons.js";

describe("Toast Notification System", () => {
  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    jest.useFakeTimers();
    // Shim rAF to fire in next tick for tests
    jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
      return setTimeout(cb, 0);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("showToast creates container and message", () => {
    showToast("Hello World");
    jest.advanceTimersByTime(1);
    const container = document.getElementById("diagview-toast-container");
    expect(container).not.toBeNull();
    expect(container.textContent).toContain("Hello World");
  });

  test("showToast is a singleton", () => {
    showToast("First");
    jest.advanceTimersByTime(1);
    const container1 = document.getElementById("diagview-toast-container");
    showToast("Second");
    jest.advanceTimersByTime(1);
    const container2 = document.getElementById("diagview-toast-container");
    expect(container1).toBe(container2);
  });

  test("toast disappears after duration", () => {
    showToast("Hello", "success", 1000);
    jest.advanceTimersByTime(1);
    const container = document.getElementById("diagview-toast-container");
    const toast = container.firstChild;

    // Advance timers for dismissal
    jest.advanceTimersByTime(1100);
    expect(toast.style.opacity).toBe("0");

    // Advance transition timer (300ms in toast.js)
    jest.advanceTimersByTime(400);
    expect(document.getElementById("diagview-toast-container")).toBeNull();
  });

  test("success toast text contrasts with the accent on a light page", () => {
    updateConfig({ accentColor: "#dc2626" });
    showToast("Red", "success", 0);
    expect(document.querySelector(".diagview-toast").style.color).toBe("rgb(255, 255, 255)");
    document.body.innerHTML = "";
    clearThemeCache();
    updateConfig({ accentColor: "#f59e0b" });
    showToast("Amber", "success", 0);
    expect(document.querySelector(".diagview-toast").style.color).toBe("rgb(15, 23, 42)");
    clearThemeCache();
  });

  test("the default accent gets dark text and errors stay red with white", () => {
    showSuccessToast("Saved");
    const saved = document.querySelector(".diagview-toast-success");
    expect(saved.style.backgroundColor).toBe("rgb(59, 130, 246)");
    expect(saved.style.color).toBe("rgb(15, 23, 42)");
    showErrorToast("Broken");
    const error = document.querySelector(".diagview-toast-error");
    expect(error.style.backgroundColor).toBe("rgb(215, 61, 61)");
    expect(error.style.color).toBe("rgb(255, 255, 255)");
    clearThemeCache();
  });

  test("duration 0 does not auto-hide", () => {
    showToast("Persistent", "success", 0);
    jest.advanceTimersByTime(10000);
    const container = document.getElementById("diagview-toast-container");
    expect(container).not.toBeNull();
    expect(container.children.length).toBe(1);
  });

  test("convenience methods work", () => {
    showSuccessToast("Success");
    jest.advanceTimersByTime(1);
    expect(document.body.textContent).toContain("Success");

    showErrorToast("Error", "Details");
    jest.advanceTimersByTime(1);
    expect(document.body.textContent).toContain("Error: Details");
  });

  test("each type draws its own hidden SVG icon before the message", () => {
    const icon = () => {
      const t = [...document.querySelectorAll(".diagview-toast")].pop();
      const svg = t.firstElementChild;
      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("class")).toBe("diagview-toast-icon");
      return { text: t.textContent, paths: shapes(svg) };
    };
    const shapes = (svg) =>
      [...svg.children].map((c) => `${c.tagName}:${c.getAttribute("d") ?? c.getAttribute("r")}`);
    const paths = (markup) =>
      shapes(new DOMParser().parseFromString(markup, "image/svg+xml").documentElement);

    showSuccessToast("Saved");
    expect(icon()).toEqual({ text: "Saved", paths: paths(ICONS.check) });
    showInfoToast("Working");
    expect(icon()).toEqual({ text: "Working", paths: paths(ICONS.info) });
    showWarningToast("Careful");
    expect(icon()).toEqual({ text: "Careful", paths: paths(ICONS.warning) });
    showErrorToast("Broken");
    expect(icon()).toEqual({ text: "Broken", paths: paths(ICONS.close) });
  });

  test("a progress notice draws a spinning ring", () => {
    showProgressToast("Processing PNG...");
    const t = document.querySelector(".diagview-toast-info");
    const svg = t.firstElementChild;
    expect(t.textContent).toBe("Processing PNG...");
    expect(svg.getAttribute("class")).toBe("diagview-toast-icon diagview-toast-spin");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path").getAttribute("d")).toBe(ICONS.spinner.match(/d="([^"]+)"/)[1]);
  });

  test("a plain toast has no icon", () => {
    showToast("Text select ON");
    expect(document.querySelector(".diagview-toast svg")).toBeNull();
  });

  describe("one notice at a time", () => {
    const shown = () => [...document.querySelectorAll(".diagview-toast")].map((t) => t.textContent);

    test("the result replaces its progress notice", () => {
      showInfoToast("Processing PNG...");
      showSuccessToast("2.0x PNG saved");
      expect(shown()).toEqual(["2.0x PNG saved"]);
    });

    test("a new notice replaces the previous one", () => {
      showSuccessToast("Rotated 90°");
      showSuccessToast("Rotated 180°");
      showSuccessToast("Rotated 270°");
      expect(shown()).toEqual(["Rotated 270°"]);
    });

    test("a warning stays under the result that follows it", () => {
      showWarningToast("Switched to Transparent PNG");
      showSuccessToast("Transparent PNG saved");
      expect(shown()).toEqual(["Switched to Transparent PNG", "Transparent PNG saved"]);

      showSuccessToast("Copied");
      expect(shown()).toEqual(["Switched to Transparent PNG", "Copied"]);
    });

    test("an error replaces everything on screen", () => {
      showWarningToast("Switched to Transparent PNG");
      showInfoToast("Processing PNG...");
      showErrorToast("Export Failed");
      expect(shown()).toEqual(["Export Failed"]);
    });

    test("a replaced notice's timer leaves the new one alone", () => {
      showSuccessToast("First");
      jest.advanceTimersByTime(1000);
      showToast("Second", "success", 0);
      jest.advanceTimersByTime(10000);
      expect(shown()).toEqual(["Second"]);
    });
  });

  describe("where the container goes", () => {
    let modal;
    const container = () => document.getElementById("diagview-toast-container");

    beforeEach(() => {
      modal = document.createElement("div");
      modal.id = "diagview-modal";
      modal.className = "diagview-modal";
      document.body.appendChild(modal);
    });

    test("on the page while the modal exists but is closed", () => {
      showToast("Saved");
      expect(container().parentNode).toBe(document.body);
      expect(modal.contains(container())).toBe(false);
    });

    test("inside the modal while it is open", () => {
      modal.classList.add("open");
      showToast("Saved");
      expect(container().parentNode).toBe(modal);
    });

    test("follows the modal as it opens and closes", () => {
      showToast("Before");
      expect(container().parentNode).toBe(document.body);

      modal.classList.add("open");
      showToast("While open");
      expect(container().parentNode).toBe(modal);

      modal.classList.remove("open");
      showToast("After");
      expect(container().parentNode).toBe(document.body);
      expect(container().textContent).toContain("After");
    });
  });
});
