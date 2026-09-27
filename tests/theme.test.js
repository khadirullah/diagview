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
  onAccentColor,
  noticeColors,
  getContrastRatio,
} from "../src/core/theme.js";
import { resetConfig, updateConfig } from "../src/core/config.js";
import { COLORS } from "../src/core/constants.js";

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

  describe("see-through backgroundColor", () => {
    const originalCSS = window.CSS;

    // Every colour here is black with some alpha. jsdom cannot resolve
    // "transparent" or the space syntax, so answer as a browser would.
    beforeEach(() => {
      delete document.documentElement.dataset.mockText;
      window.CSS = { supports: () => true };
      const computed = window.getComputedStyle;
      window.getComputedStyle = (el) => {
        const style = computed(el);
        if (el.tagName === "META") {
          Object.defineProperty(style, "color", { value: "rgba(0, 0, 0, 0)", configurable: true });
        }
        return style;
      };
    });

    afterEach(() => {
      window.CSS = originalCSS;
    });

    const withPage = (colour, run) => {
      document.body.style.backgroundColor = colour;
      try {
        clearThemeCache();
        run(detectTheme());
      } finally {
        document.body.style.backgroundColor = "";
      }
    };

    test.each(["transparent", "rgba(0, 0, 0, 0)", "rgb(0 0 0 / 0%)", "#0000", "#12345600"])(
      "%s on a light page keeps dark text and stays light",
      (colour) => {
        updateConfig({ backgroundColor: colour });
        withPage("rgb(255, 255, 255)", (theme) => {
          expect(theme.bg).toBe(colour);
          expect(theme.isDark).toBe(false);
          expect(theme.text).toBe(COLORS.TEXT_LIGHT);
        });
      },
    );

    test("transparent on a dark page uses light text", () => {
      updateConfig({ backgroundColor: "transparent" });
      withPage("rgb(15, 23, 42)", (theme) => {
        expect(theme.bg).toBe("transparent");
        expect(theme.isDark).toBe(true);
        expect(getContrastRatio(theme.text, "rgb(15, 23, 42)")).toBeGreaterThanOrEqual(4.5);
      });
    });

    test("a half see-through colour is judged mixed with the page", () => {
      // Black at 20% over white is a light grey, so the text stays dark
      updateConfig({ backgroundColor: "rgba(0, 0, 0, 0.2)" });
      withPage("rgb(255, 255, 255)", (theme) => {
        expect(theme.bg).toBe("rgba(0, 0, 0, 0.2)");
        expect(theme.isDark).toBe(false);
        expect(theme.text).toBe(COLORS.TEXT_LIGHT);
      });
      // Black at 80% over white is dark
      updateConfig({ backgroundColor: "rgb(0 0 0 / 80%)" });
      withPage("rgb(255, 255, 255)", (theme) => expect(theme.isDark).toBe(true));
    });

    test("opaque colours ignore the page", () => {
      updateConfig({ backgroundColor: "#000000" });
      withPage("rgb(255, 255, 255)", (theme) => {
        expect(theme.isDark).toBe(true);
        expect(theme.text).toBe(COLORS.TEXT_DARK);
      });
      updateConfig({ backgroundColor: "hsl(0, 0%, 0%)" });
      withPage("rgb(255, 255, 255)", (theme) => expect(theme.isDark).toBe(true));
    });

    test("the search ring follows the page under a transparent canvas", () => {
      updateConfig({ backgroundColor: "transparent" });
      withPage("rgb(255, 255, 255)", () => {
        syncTheme();
        expect(document.documentElement.style.getPropertyValue("--dv-search-ring")).toBe(
          COLORS.SEARCH_RING_LIGHT,
        );
      });
    });

    test("panels get the solid colour seen through a transparent canvas", () => {
      const panel = () => document.documentElement.style.getPropertyValue("--dv-panel-bg");
      updateConfig({ backgroundColor: "transparent" });
      withPage("rgb(15, 23, 42)", () => {
        const theme = syncTheme();
        expect(theme.seenBg).toBe("rgb(15, 23, 42)");
        expect(panel()).toBe("rgb(15, 23, 42)");
        expect(getContrastRatio(theme.text, panel())).toBeGreaterThanOrEqual(4.5);
      });
      // Black at 20% over white shows as a light grey
      updateConfig({ backgroundColor: "rgba(0, 0, 0, 0.2)" });
      withPage("rgb(255, 255, 255)", () => {
        const theme = syncTheme();
        expect(panel()).toBe("rgb(204, 204, 204)");
        expect(getContrastRatio(theme.text, panel())).toBeGreaterThanOrEqual(4.5);
      });
    });

    test("an opaque canvas colour is the panel colour as it is", () => {
      updateConfig({ backgroundColor: "#1e293b" });
      withPage("rgb(255, 255, 255)", () => {
        const theme = syncTheme();
        expect(theme.seenBg).toBe("#1e293b");
        expect(document.documentElement.style.getPropertyValue("--dv-panel-bg")).toBe("#1e293b");
      });
    });
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

  describe("accent colour", () => {
    const originalCSS = window.CSS;
    const originalGetComputedStyle = window.getComputedStyle;
    let vars;

    beforeEach(() => {
      vars = {};
      const base = window.getComputedStyle;
      window.getComputedStyle = (el) => {
        const style = base(el);
        const get = style.getPropertyValue.bind(style);
        style.getPropertyValue = (prop) =>
          el === document.documentElement && prop in vars ? vars[prop] : get(prop);
        return style;
      };
    });

    afterEach(() => {
      window.CSS = originalCSS;
      window.getComputedStyle = originalGetComputedStyle;
    });

    test("text on the accent stays white down to 3:1, then turns near-black", () => {
      const dark = COLORS.BG_DARK;
      expect(onAccentColor("#3b82f6")).toBe("#fff");
      expect(onAccentColor("#ef4444")).toBe("#fff");
      expect(onAccentColor("#dc2626")).toBe("#fff");
      expect(onAccentColor("#1d4ed8")).toBe("#fff");
      expect(onAccentColor("#60a5fa")).toBe(dark);
      expect(onAccentColor("#f59e0b")).toBe(dark);
      expect(onAccentColor("#22c55e")).toBe(dark);
      expect(onAccentColor("#fafafa")).toBe(dark);
      // Unparseable colours keep the old white
      expect(onAccentColor("not-a-colour")).toBe("#fff");
    });

    test("syncTheme publishes --dv-on-accent for the current accent", () => {
      updateConfig({ accentColor: "#f59e0b" });
      const theme = syncTheme();
      expect(theme.onAccent).toBe(COLORS.BG_DARK);
      expect(document.documentElement.style.getPropertyValue("--dv-on-accent")).toBe(
        COLORS.BG_DARK,
      );
      clearThemeCache();
      updateConfig({ accentColor: "#dc2626" });
      syncTheme();
      expect(document.documentElement.style.getPropertyValue("--dv-on-accent")).toBe("#fff");
    });

    test("uses the built-in default for light and dark pages", () => {
      expect(detectTheme().accent).toBe(COLORS.ACCENT_LIGHT);
      clearThemeCache();
      document.documentElement.classList.add("dark");
      expect(detectTheme().accent).toBe(COLORS.ACCENT_DARK);
    });

    test("reads --diagram-accent and ignores --primary and --accent-color", () => {
      vars["--primary"] = "#0000aa";
      vars["--accent-color"] = "#00aa00";
      expect(detectTheme().accent).toBe(COLORS.ACCENT_LIGHT);
      clearThemeCache();
      vars["--diagram-accent"] = " #aa0000 ";
      expect(detectTheme().accent).toBe("#aa0000");
    });

    test("skips a --diagram-accent that is a bare HSL triplet", () => {
      vars["--diagram-accent"] = "222.2 47.4% 11.2%";
      expect(detectTheme().accent).toBe(COLORS.ACCENT_LIGHT);
    });

    test("skips the triplet through CSS.supports when the engine has it", () => {
      const supports = jest.fn((prop, value) => prop === "color" && value.startsWith("#"));
      window.CSS = { supports };
      vars["--diagram-accent"] = "222.2 47.4% 11.2%";
      expect(detectTheme().accent).toBe(COLORS.ACCENT_LIGHT);
      expect(supports).toHaveBeenCalledWith("color", "222.2 47.4% 11.2%");
    });

    test("accentColor from config wins over page variables", () => {
      vars["--diagram-accent"] = "#aa0000";
      updateConfig({ accentColor: "#f59e0b" });
      expect(detectTheme().accent).toBe("#f59e0b");
    });

    test("an invalid accentColor is ignored and the chain continues", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      vars["--diagram-accent"] = "#0000aa";
      updateConfig({ accentColor: "not-a-colour" });
      expect(detectTheme().accent).toBe("#0000aa");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("accentColor"));
      warn.mockRestore();
    });
  });

  test("syncTheme updates root CSS variables", () => {
    document.documentElement.classList.add("dark");
    const theme = syncTheme();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--dv-bg")).toBe(theme.bg);
    expect(root.style.getPropertyValue("--dv-text-color")).toBe(theme.text);
    expect(root.style.getPropertyValue("--dv-accent")).toBe(theme.accent);
  });

  test("syncTheme picks the search ring colour from the canvas background", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const root = document.documentElement;
    const ring = () => root.style.getPropertyValue("--dv-search-ring");

    setCanvasTheme("dark");
    expect(ring()).toBe(COLORS.SEARCH_RING_DARK);

    setCanvasTheme("light");
    expect(ring()).toBe(COLORS.SEARCH_RING_LIGHT);

    setCanvasTheme("custom", "#1e293b");
    expect(ring()).toBe(COLORS.SEARCH_RING_DARK);

    setCanvasTheme("custom", "#fef3c7");
    expect(ring()).toBe(COLORS.SEARCH_RING_LIGHT);
    warn.mockRestore();
  });

  test("syncTheme gives the menu toggle a solid track on light canvases only", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const root = document.documentElement;
    const track = () => root.style.getPropertyValue("--dv-toggle-track");

    setCanvasTheme("light");
    expect(track()).toBe(COLORS.TOGGLE_TRACK_LIGHT);
    expect(getContrastRatio(COLORS.TOGGLE_TRACK_LIGHT, COLORS.BG_LIGHT)).toBeGreaterThanOrEqual(3);

    setCanvasTheme("dark");
    expect(track()).toBe("");
    warn.mockRestore();
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

  describe("own text colour", () => {
    const { TEXT_LIGHT: onLight, TEXT_DARK: onDark } = COLORS;
    let warn;

    beforeEach(() => {
      delete document.documentElement.dataset.mockText;
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      setCanvasTheme("auto");
      document.body.style.backgroundColor = "";
      warn.mockRestore();
    });

    test("built-in modes and swatches keep their text colour", () => {
      expect(setCanvasTheme("light").text).toBe(onLight);
      expect(setCanvasTheme("dark").text).toBe(onDark);
      expect(setCanvasTheme("custom", "#ffffff").text).toBe(onLight);
      for (const swatch of ["#0b0f19", "#0f172a", "#1e293b"]) {
        expect(setCanvasTheme("custom", swatch).text).toBe(onDark);
      }
      for (const light of ["#f8fafc", "#fef3c7", "#e2e8f0"]) {
        expect(setCanvasTheme("custom", light).text).toBe(onLight);
      }
      for (const dark of ["#000000", "#334155", "#1f2937", "#475569"]) {
        expect(setCanvasTheme("custom", dark).text).toBe(onDark);
      }
      expect(warn).not.toHaveBeenCalled();
    });

    test("Auto follows a light or dark page as before", () => {
      setCanvasTheme("auto");
      document.body.style.backgroundColor = "#ffffff";
      clearThemeCache();
      expect(detectTheme().text).toBe(onLight);

      document.documentElement.classList.add("dark");
      document.body.style.backgroundColor = "#0f172a";
      clearThemeCache();
      expect(detectTheme().text).toBe(onDark);
    });

    test.each(["#b3b3b3", "#9ca3af", "#fb923c", "#f97316"])(
      "a mid-tone canvas %s gets the dark text",
      (colour) => {
        const theme = setCanvasTheme("custom", colour);
        expect(theme.isDark).toBe(true);
        expect(theme.text).toBe(onLight);
        expect(getContrastRatio(colour, theme.text)).toBeGreaterThanOrEqual(4.5);
        expect(warn).not.toHaveBeenCalled();
      },
    );

    test.each(["#808080", "#3b82f6"])(
      "a mid-tone canvas %s where neither reaches 4.5:1 falls back to black",
      (colour) => {
        const theme = setCanvasTheme("custom", colour);
        expect(theme.text).toBe("#000000");
        expect(getContrastRatio(colour, theme.text)).toBeGreaterThanOrEqual(4.5);
      },
    );

    test("a mid-tone backgroundColor or page gets the dark text too", () => {
      updateConfig({ backgroundColor: "#b3b3b3" });
      clearThemeCache();
      expect(detectTheme().text).toBe(onLight);

      resetConfig();
      document.documentElement.classList.add("dark");
      document.body.style.backgroundColor = "#9ca3af";
      clearThemeCache();
      expect(detectTheme().text).toBe(onLight);
    });

    test("a textColor or page text variable that fails gets black or white, whichever reads better", () => {
      setCanvasTheme("custom", "#b3b3b3");
      updateConfig({ textColor: "#fafafa" });
      clearThemeCache();
      expect(detectTheme().text).toBe("#000000");

      updateConfig({ textColor: "#475569" });
      clearThemeCache();
      expect(detectTheme().text).toBe("#000000");

      setCanvasTheme("custom", "#6b7280");
      updateConfig({ textColor: "#475569" });
      clearThemeCache();
      expect(detectTheme().text).toBe("#ffffff");

      setCanvasTheme("custom", "#b3b3b3");

      updateConfig({ textColor: "#333333" });
      clearThemeCache();
      expect(detectTheme().text).toBe("#333333");

      resetConfig();
      setCanvasTheme("custom", "#b3b3b3");
      document.documentElement.dataset.mockText = "#f1f5f9";
      clearThemeCache();
      expect(detectTheme().text).toBe("#000000");

      document.documentElement.dataset.mockText = "#123456";
      clearThemeCache();
      expect(detectTheme().text).toBe("#123456");
      delete document.documentElement.dataset.mockText;
    });
  });
});

describe("Theme Module: modern colour syntax and rejected colours", () => {
  const originalGetComputedStyle = window.getComputedStyle;
  const originalCSS = window.CSS;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  let warn;

  // Emulates Chrome: computed colours keep oklch()/lab()/color() verbatim, a
  // rejected assignment leaves the previous colour in place, and CSS.supports
  // knows which strings are colours.
  const chromeLike = ({ bodyBg = "rgb(255, 255, 255)", parserColor = "rgb(0, 0, 0)" } = {}) => {
    window.getComputedStyle = (el) => {
      const style = originalGetComputedStyle(el);
      if (el === document.body) {
        Object.defineProperty(style, "backgroundColor", { value: bodyBg, configurable: true });
      } else if (el.tagName === "META") {
        Object.defineProperty(style, "color", { value: parserColor, configurable: true });
      }
      return style;
    };
  };

  beforeEach(() => {
    resetConfig();
    clearThemeCache();
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.cssText = "";
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    window.CSS = {
      supports: (prop, value) =>
        prop === "color" &&
        /^(oklch|lab|color|rgb|rgba)\(|^#[0-9a-f]{3,8}$|^rebeccapurple$/i.test(value),
    };
    // 1x1 canvas readback used for colour spaces getComputedStyle keeps verbatim
    HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: "",
      fillRect() {},
      clearRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray([247, 249, 253, 255]) }),
    });
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    window.CSS = originalCSS;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    warn.mockRestore();
    document.querySelectorAll("meta[aria-hidden]").forEach((m) => m.remove());
  });

  test("an oklch() page background is parsed as light and keeps dark text", () => {
    chromeLike({ bodyBg: "oklch(0.98 0.01 250)", parserColor: "oklch(0.98 0.01 250)" });

    const theme = detectTheme();

    expect(theme.isDark).toBe(false);
    expect(theme.text).toBe("#1e293b");
    expect(theme.text).not.toBe("#ffffff");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("Low contrast"));
  });

  test("a #-prefixed non-hex backgroundColor is rejected with a warning", () => {
    chromeLike();
    updateConfig({ backgroundColor: "#zzzzzz" });
    clearThemeCache();

    const theme = detectTheme();

    expect(theme.bg).not.toBe("#zzzzzz");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("backgroundColor"));
    expect(document.documentElement.style.getPropertyValue("--dv-bg")).toBe("");
  });

  test("an unknown textColor name is rejected every time, never cached as a colour", () => {
    // Chrome-like: the parser element keeps its previous colour after a rejected assignment
    chromeLike({ parserColor: "rgb(0, 0, 0)" });
    updateConfig({ textColor: "notacolour" });

    clearThemeCache();
    let theme = detectTheme();
    expect(theme.text).not.toBe("notacolour");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("textColor"));

    clearThemeCache();
    theme = detectTheme();
    expect(theme.text).not.toBe("notacolour");
  });

  test("each invalid colour warns once, a new invalid value warns again", () => {
    updateConfig({ accentColor: "bad-accent", backgroundColor: "bad-bg", textColor: "bad-text" });
    const colourWarnings = () =>
      warn.mock.calls.filter(([msg]) => String(msg).includes("is not a valid colour"));

    for (let i = 0; i < 3; i++) {
      clearThemeCache();
      detectTheme();
    }
    expect(colourWarnings()).toHaveLength(3);

    updateConfig({ accentColor: "worse-accent" });
    clearThemeCache();
    detectTheme();
    expect(colourWarnings()).toHaveLength(4);
    expect(colourWarnings()[3][0]).toContain('accentColor "worse-accent"');
  });

  test("low contrast warns once per colour pair", () => {
    const contrastWarnings = () =>
      warn.mock.calls.filter(([msg]) => String(msg).includes("Low contrast"));
    updateConfig({ backgroundColor: "#fdfdfd", textColor: "#fcfcfc" });

    for (let i = 0; i < 3; i++) {
      clearThemeCache();
      detectTheme();
    }
    expect(contrastWarnings()).toHaveLength(1);

    updateConfig({ backgroundColor: "#010101", textColor: "#020202" });
    clearThemeCache();
    detectTheme();
    expect(contrastWarnings()).toHaveLength(2);
  });

  test("a named colour still resolves through computed style", () => {
    chromeLike({ parserColor: "rgb(102, 51, 153)" });
    updateConfig({ backgroundColor: "rebeccapurple" });
    clearThemeCache();

    const theme = detectTheme();

    expect(theme.bg).toBe("rebeccapurple");
    expect(theme.isDark).toBe(true);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("backgroundColor"));
  });

  test("notice text reaches 4.5:1 on any colour", () => {
    const dark = COLORS.BG_DARK;
    // The default blue and yellow read better with near-black text
    expect(noticeColors("#3b82f6")).toEqual({ bg: "#3b82f6", text: dark });
    expect(noticeColors("#facc15")).toEqual({ bg: "#facc15", text: dark });
    // Dark colours keep white text
    expect(noticeColors("#9333ea")).toEqual({ bg: "#9333ea", text: "#fff" });
    expect(noticeColors("#111827")).toEqual({ bg: "#111827", text: "#fff" });
    // Mid grey fails with both, so it is darkened just enough for white
    expect(getContrastRatio("#fff", "#7c7c7c")).toBeLessThan(4.5);
    expect(getContrastRatio(dark, "#7c7c7c")).toBeLessThan(4.5);
    const grey = noticeColors("#7c7c7c");
    expect(grey.text).toBe("#fff");
    expect(grey.bg).not.toBe("#7c7c7c");
    expect(getContrastRatio("#fff", grey.bg)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio("#fff", grey.bg)).toBeLessThan(4.7);
  });
});
