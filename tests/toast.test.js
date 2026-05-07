import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import { showToast, showSuccessToast, showErrorToast } from "../src/ui/toast.js";

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
    expect(document.body.textContent).toContain("✓ Success");

    showErrorToast("Error", "Details");
    jest.advanceTimersByTime(1);
    expect(document.body.textContent).toContain("✕ Error: Details");
  });
});
