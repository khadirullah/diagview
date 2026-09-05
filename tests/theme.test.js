/**
 * Theme Module Tests
 * Tests for dark mode detection, color contrast checking, and theme synchronization.
 */

import { jest } from "@jest/globals";
import {
  detectTheme,
  syncTheme,
  clearThemeCache,
  setCanvasTheme,
  normalizeSvgTextContrast,
} from "../src/core/theme.js";
import { resetConfig, updateConfig } from "../src/core/config.js";

describe("Theme Module", () => {
  beforeEach(() => {
    resetConfig();
    clearThemeCache();

    // Reset DOM state
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-bs-theme");
    document.documentElement.style.cssText = "";

    // Mock matchMedia
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    // Mock getComputedStyle for CSS variable tests
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = (el) => {
      const style = originalGetComputedStyle(el);
      // Mock getPropertyValue to return custom values for specific variables
      const originalGetPropertyValue = style.getPropertyValue.bind(style);
      style.getPropertyValue = (prop) => {
        if (prop === "--diagram-text" && el.dataset.mockText) return el.dataset.mockText;
        return originalGetPropertyValue(prop);
      };
      return style;
    };
  });

  test("identifies light mode by default", () => {
    const theme = detectTheme();
    expect(theme.isDark).toBe(false);
  });

  test("identifies dark mode via class on html", () => {
    document.documentElement.classList.add("dark");
    const theme = detectTheme();
    expect(theme.isDark).toBe(true);
  });

  test("identifies dark mode via data-theme attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const theme = detectTheme();
    expect(theme.isDark).toBe(true);
  });

  test("identifies dark mode via matchMedia", () => {
    window.matchMedia.mockImplementation((query) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
    }));
    const theme = detectTheme();
    expect(theme.isDark).toBe(true);
  });

  test("handles low contrast with high-contrast fallback", () => {
    // Force dark background but also dark text variable
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.dataset.mockText = "#111111"; // Very dark text

    // Mock background detection to be dark
    const originalBodyBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "rgb(0, 0, 0)";

    const theme = detectTheme();

    // Background is dark, so text should fallback to white for contrast
    expect(theme.text.toLowerCase()).toBe("#ffffff");

    document.body.style.backgroundColor = originalBodyBg;
  });

  test("backgroundColor config override replaces detection and sets isDark", () => {
    updateConfig({ backgroundColor: "#0f172a" });
    clearThemeCache();
    const theme = detectTheme();
    expect(theme.bg).toBe("#0f172a");
    expect(theme.isDark).toBe(true);
  });

  test("textColor config override is used when it has enough contrast", () => {
    updateConfig({ backgroundColor: "#ffffff", textColor: "#1e293b" });
    clearThemeCache();
    const theme = detectTheme();
    expect(theme.text).toBe("#1e293b");
  });

  test("textColor override still goes through the WCAG contrast guard", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ backgroundColor: "#ffffff", textColor: "#fafafa" });
    clearThemeCache();
    const theme = detectTheme();
    expect(theme.text).not.toBe("#fafafa");
    warn.mockRestore();
  });

  test("invalid colour overrides are ignored with a warning", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ backgroundColor: "not-a-colour" });
    clearThemeCache();
    const theme = detectTheme();
    expect(theme.bg).not.toBe("not-a-colour");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("backgroundColor"));
    warn.mockRestore();
  });

  test("syncTheme updates root CSS variables", () => {
    document.documentElement.classList.add("dark");
    const theme = syncTheme();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--dv-bg")).toBe(theme.bg);
    expect(root.style.getPropertyValue("--dv-text-color")).toBe(theme.text);
    expect(root.style.getPropertyValue("--dv-accent")).toBe(theme.accent);
  });

  test("caching prevents redundant detections within 1s", () => {
    const first = detectTheme();

    // Change DOM state
    document.documentElement.classList.add("dark");

    // Should still return the cached (light) theme
    const second = detectTheme();
    expect(second.isDark).toBe(false);
    expect(second).toBe(first);

    // Clear cache
    clearThemeCache();
    const third = detectTheme();
    expect(third.isDark).toBe(true);
  });

  test("setCanvasTheme updates active mode and custom color", () => {
    const themeDark = setCanvasTheme("dark");
    expect(themeDark.isDark).toBe(true);

    const themeCustom = setCanvasTheme("custom", "#0b0f19");
    expect(themeCustom.bg).toBe("#0b0f19");
    expect(themeCustom.isDark).toBe(true);
  });

  test("normalizeSvgTextContrast adjusts low-contrast SVG text", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("fill", "#000000");
    svg.appendChild(text);

    setCanvasTheme("dark");
    normalizeSvgTextContrast(svg, "#000000");

    expect(text.style.fill.toLowerCase()).toBe("#ffffff");
  });
});
