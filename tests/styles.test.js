/**
 * Stylesheet Tests
 * Textual checks on src/ui/styles.css: jsdom does not lay out CSS, and the
 * visual behaviour is covered by the headless Chrome sweep in tests/e2e.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/styles.css");
const css = readFileSync(cssPath, "utf8");

// Body of the first rule whose selector text contains `selector`
function ruleBody(selector, from = 0) {
  const idx = css.indexOf(selector, from);
  if (idx === -1) return null;
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("styles.css: menu headings and search placeholder", () => {
  test("use the muted text colour instead of opacity, so they keep 4.5:1", () => {
    const body = ruleBody(".dv-menu-lbl {");
    expect(body).toContain("var(--dv-muted-text");
    expect(body).not.toMatch(/opacity\s*:/);
  });

  test("the search placeholder uses it too, at full opacity in every browser", () => {
    const body = ruleBody(".diagview-search-input::placeholder {");
    expect(body).toContain("var(--dv-muted-text");
    expect(body).toMatch(/opacity:\s*1/);
  });
});

describe("styles.css: desktop tooltip", () => {
  test("is placed below the element so the topbar button's tooltip is not clipped", () => {
    const body = ruleBody("[data-tooltip]::after");
    expect(body).not.toBeNull();
    expect(body).toMatch(/top:\s*calc\(100% \+ 8px\)/);
    expect(body).not.toMatch(/bottom:\s*calc/);
  });
});

describe("styles.css: topbar shortcut hint", () => {
  test("key badge takes the canvas text colour, not the host page's kbd colour", () => {
    expect(ruleBody(".diagview-shortcut-hint kbd")).toMatch(/color:\s*var\(--dv-text-color\)/);
  });
});

describe("styles.css: dead and contradicting rules", () => {
  test("never-emitted helper classes are gone", () => {
    expect(css).not.toContain(".dv-selection-allowed");
    expect(css).not.toContain(".dv-exp-trans-hint");
  });

  test("search highlight runs no animation and promotes no layers", () => {
    expect(css).not.toContain("dv-pulse");
    const start = css.indexOf(".dv-searching");
    const end = css.indexOf("/* Modal Viewport");
    expect(start).toBeGreaterThan(-1);
    const rules = css.slice(start, end);
    expect(rules).not.toMatch(/animation\s*:/);
    expect(rules).not.toMatch(/will-change\s*:/);
    expect(rules).not.toMatch(/filter\s*:/);
  });

  test("search keeps the diagram's own colours and outlines from the canvas", () => {
    const start = css.indexOf(".dv-searching");
    const rules = css.slice(start, css.indexOf("/* Modal Viewport"));
    expect(rules).not.toMatch(/fill\s*:/);
    expect(rules).not.toContain("--dv-accent");
    expect(rules).toContain("var(--dv-search-ring");
  });

  test("search dimming outranks the id-scoped opacity Mermaid sets on some shapes", () => {
    const body = ruleBody(".dv-search-match *");
    expect(body).toMatch(/opacity:\s*0\.15\s*!important/);
  });

  test("dimming and undimming a large diagram animate nothing, even with host page transitions", () => {
    expect(ruleBody(".dv-search-match *")).not.toMatch(/transition\s*:/);
    const body = ruleBody(".diagview-modal-viewport\n  svg\n  :is(path, rect");
    expect(body).not.toBeNull();
    expect(body).toMatch(/transition:\s*none\s*!important/);
  });

  test("search outlines Mermaid 11 shapes drawn inside a g.label-container", () => {
    const body = ruleBody(".dv-search-match > .label-container > :is(");
    expect(body).not.toBeNull();
    expect(body).toContain("var(--dv-search-ring");
  });

  test("per-control outline rules that always lose to the global focus ring are gone", () => {
    for (const sel of [
      ".dv-icon-btn:focus-visible",
      ".dv-text-select-btn:focus-visible",
      ".diagview-close-btn:focus-visible",
      ".dv-exp-trans-chk:focus-visible",
    ]) {
      expect(css).not.toContain(sel);
    }
    // the shared box-shadow ring stays
    expect(ruleBody(".diagview-modal *:focus-visible")).toMatch(/box-shadow/);
  });

  test("help modal z-index is clamped to the 32-bit maximum", () => {
    expect(ruleBody(".diagview-help-modal {")).toMatch(/z-index:\s*2147483647;/);
    expect(css).not.toContain("2147483648");
  });

  test("mobile closed-search rule outranks the later base rule", () => {
    const mobile = css.indexOf("@media (max-width: 639px)");
    const base = css.indexOf("\n.diagview-search-container {");
    expect(mobile).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(mobile);
    const body = ruleBody(".diagview-topbar .diagview-search-container {", mobile);
    expect(body).not.toBeNull();
    expect(body).toMatch(/flex:\s*0;/);
    expect(body).toMatch(/max-width:\s*0;/);
  });

  test("reduced-motion rule covers the modal and pseudo-elements but keeps the spinner spinning", () => {
    const idx = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const open = css.indexOf("{", css.indexOf(".diagview-modal", idx));
    const selector = css.slice(idx, open);
    expect(selector).toMatch(/\.diagview-modal,/);
    expect(selector).toMatch(/\.diagview-modal \*:not\(\.diagview-spinner\)/);
    expect(selector).toMatch(/\.diagview-modal \*::before/);
    expect(selector).toMatch(/\.diagview-modal \*::after/);
  });
});

describe("styles.css: menu buttons", () => {
  test("canvas and text colour buttons tint with the accent on hover", () => {
    const body = ruleBody(".dv-theme-btn:hover {");
    expect(body).toMatch(/background:\s*color-mix\(in srgb, var\(--dv-primary/);
    expect(body).not.toMatch(/rgba\(255, 255, 255/);
  });
});

describe("styles.css: keyboard focus ring", () => {
  test("keeps each control's own corners instead of its parent's", () => {
    const body = ruleBody(".diagview-menu *:focus-visible {");
    expect(body).toMatch(/box-shadow:/);
    expect(body).not.toMatch(/border-radius:/);
  });
});
