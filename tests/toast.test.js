import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig, runModalCleanupFunctions } from "../src/core/config.js";
import { clearThemeCache } from "../src/core/theme.js";
import {
  showToast,
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showProgressToast,
  showWarningToast,
  showMenuHint,
  closeMenuHint,
  hideToast,
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

  describe("warning notices", () => {
    const warning = () => document.querySelector(".diagview-toast-warning");

    test("are amber with dark text and announced at once", () => {
      showWarningToast("Switched to Transparent PNG");
      const t = warning();
      jest.advanceTimersByTime(100);
      const alert = document.querySelector("#diagview-toast-live [role=alert]");
      expect(alert.getAttribute("aria-live")).toBe("assertive");
      expect(alert.textContent).toBe("Switched to Transparent PNG");
      expect(t.style.backgroundColor).toBe("rgb(245, 158, 11)");
      expect(t.style.color).toBe("rgb(15, 23, 42)");
      expect(document.querySelector(".diagview-toast-error")).toBeNull();
    });

    test("stay for 5 seconds", () => {
      showWarningToast("Careful");
      jest.advanceTimersByTime(4900);
      expect(warning().style.opacity).not.toBe("0");
      jest.advanceTimersByTime(200);
      expect(warning().style.opacity).toBe("0");
    });

    test("use warningColor with text picked to reach 4.5:1", () => {
      updateConfig({ warningColor: "#7c3aed" });
      clearThemeCache();
      showWarningToast("Careful");
      expect(warning().style.backgroundColor).toBe("rgb(124, 58, 237)");
      expect(warning().style.color).toBe("rgb(255, 255, 255)");
      clearThemeCache();
    });

    test("fall back to amber and warn once when warningColor is not a colour", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      updateConfig({ warningColor: "#zzzzzz" });
      clearThemeCache();
      showWarningToast("First");
      clearThemeCache();
      showWarningToast("Second");
      expect(warning().style.backgroundColor).toBe("rgb(245, 158, 11)");
      const calls = warn.mock.calls.filter(([m]) => String(m).includes("warningColor"));
      expect(calls).toHaveLength(1);
      clearThemeCache();
    });
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
    showToast("Zoom reset");
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

  describe("screen reader announcements", () => {
    const live = () => document.getElementById("diagview-toast-live");
    const status = () => live().querySelector("[role=status]");
    const alert = () => live().querySelector("[role=alert]");

    test("a hidden polite and an assertive region hold the notices", () => {
      showSuccessToast("Link copied");
      expect(live().className).toBe("diagview-sr-only");
      expect(status().getAttribute("aria-live")).toBe("polite");
      expect(status().getAttribute("aria-atomic")).toBe("true");
      expect(alert().getAttribute("aria-live")).toBe("assertive");
      expect(alert().getAttribute("aria-atomic")).toBe("true");
      // The visible notice is not a live region of its own
      const toast = document.querySelector(".diagview-toast");
      expect(toast.hasAttribute("role")).toBe(false);
      expect(toast.hasAttribute("aria-live")).toBe(false);
    });

    test("the notice on screen is hidden from screen readers, so it is read once", () => {
      showWarningToast("Clipboard blocked");
      showSuccessToast("Copied");
      const container = document.getElementById("diagview-toast-container");
      expect(container.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelectorAll(".diagview-toast")).toHaveLength(2);
      expect(container.querySelector("button, a, input, [tabindex]")).toBeNull();
      expect(container.contains(live())).toBe(false);
    });

    test("the text arrives after the region is in the page", () => {
      showSuccessToast("Link copied");
      expect(document.body.contains(live())).toBe(true);
      expect(status().textContent).toBe("");
      jest.advanceTimersByTime(99);
      expect(status().textContent).toBe("");
      jest.advanceTimersByTime(1);
      expect(status().textContent).toBe("Link copied");
    });

    test("the same notice twice is emptied first, so it is read again", () => {
      showSuccessToast("Rotated 90°");
      jest.advanceTimersByTime(100);
      const region = status();
      showSuccessToast("Rotated 90°");
      expect(status()).toBe(region);
      expect(region.textContent).toBe("");
      jest.advanceTimersByTime(100);
      expect(region.textContent).toBe("Rotated 90°");
    });

    test("a quick result replaces its progress notice before it is read", () => {
      showProgressToast("Processing PNG...");
      jest.advanceTimersByTime(50);
      showSuccessToast("PNG saved");
      jest.advanceTimersByTime(50);
      expect(status().textContent).toBe("");
      jest.advanceTimersByTime(50);
      expect(status().textContent).toBe("PNG saved");
    });

    test("a result after a warning leaves the warning in its region", () => {
      showWarningToast("Switched to Transparent PNG");
      jest.advanceTimersByTime(100);
      showSuccessToast("Transparent PNG saved");
      jest.advanceTimersByTime(100);
      expect(alert().textContent).toBe("Switched to Transparent PNG");
      expect(status().textContent).toBe("Transparent PNG saved");
    });

    test("an error empties the polite region and goes in the assertive one", () => {
      showProgressToast("Processing PNG...");
      jest.advanceTimersByTime(100);
      showErrorToast("Export Failed");
      expect(status().textContent).toBe("");
      jest.advanceTimersByTime(100);
      expect(status().textContent).toBe("");
      expect(alert().textContent).toBe("Export Failed");
    });

    test("the region empties when its notice leaves the screen", () => {
      showToast("Saved", "success", 1000);
      jest.advanceTimersByTime(100);
      expect(status().textContent).toBe("Saved");
      jest.advanceTimersByTime(1300);
      expect(document.querySelector(".diagview-toast")).toBeNull();
      expect(status().textContent).toBe("");
      // The region stays for the next notice
      expect(live()).not.toBeNull();
    });

    test("an early notice's timer leaves a later one's text alone", () => {
      showToast("Saved", "success", 1000);
      jest.advanceTimersByTime(500);
      showToast("Saved", "success", 0);
      jest.advanceTimersByTime(1500);
      expect(status().textContent).toBe("Saved");
    });

    test("hideToast removes the region and drops a pending text", () => {
      showSuccessToast("Link copied");
      const region = status();
      hideToast();
      expect(live()).toBeNull();
      jest.advanceTimersByTime(200);
      expect(region.textContent).toBe("");
    });

    test("the region follows the modal as it opens and closes", () => {
      const modal = document.createElement("div");
      modal.id = "diagview-modal";
      document.body.appendChild(modal);
      showSuccessToast("Before");
      expect(live().parentNode).toBe(document.body);
      modal.classList.add("open");
      showSuccessToast("While open");
      expect(live().parentNode).toBe(modal);
      // The notices stay on top of the region
      expect(modal.lastElementChild.id).toBe("diagview-toast-container");
      jest.advanceTimersByTime(100);
      expect(status().textContent).toBe("While open");
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

describe("First-time theme hint", () => {
  let viewport;
  const hint = () => document.querySelector(".diagview-toast-menu-hint");

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    viewport = document.body.appendChild(document.createElement("div"));
    showMenuHint("Having visibility issues?\nChange the canvas theme from the menu ☰", viewport);
  });

  afterEach(() => runModalCleanupFunctions());

  test("shows as the callout above the menu button", () => {
    expect(hint()).not.toBeNull();
    expect(hint().classList.contains("diagview-toast-info")).toBe(true);
  });

  test.each(["pointerdown", "wheel"])("a %s on the diagram closes it", (type) => {
    viewport.dispatchEvent(new Event(type, { bubbles: true }));
    expect(hint()).toBeNull();
  });

  test("closing it removes the listeners that close it", () => {
    const listeners = state.modalCleanupFunctions.size;
    closeMenuHint();
    expect(hint()).toBeNull();
    expect(state.modalCleanupFunctions.size).toBe(listeners - 2);

    // A later notice is not closed by a press on the diagram
    const later = showInfoToast("Copied");
    viewport.dispatchEvent(new Event("pointerdown"));
    expect(later.isConnected).toBe(true);
  });

  test("closing the viewer removes the listeners too", () => {
    const remove = jest.spyOn(viewport, "removeEventListener");
    runModalCleanupFunctions();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(["pointerdown", "wheel"]);
    remove.mockRestore();
  });
});
