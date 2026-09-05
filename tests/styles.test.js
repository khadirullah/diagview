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

describe("styles.css: desktop tooltip", () => {
  test("is placed below the element so the topbar button's tooltip is not clipped", () => {
    const body = ruleBody("[data-tooltip]::after");
    expect(body).not.toBeNull();
    expect(body).toMatch(/top:\s*calc\(100% \+ 8px\)/);
    expect(body).not.toMatch(/bottom:\s*calc/);
  });
});

describe("styles.css: dead and contradicting rules", () => {
  test("never-emitted helper classes are gone", () => {
    expect(css).not.toContain(".dv-selection-allowed");
    expect(css).not.toContain(".dv-exp-trans-hint");
  });

  test("dv-pulse keyframes carry no invalid brightness property", () => {
    const start = css.indexOf("@keyframes dv-pulse");
    const end = css.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(start, end)).not.toMatch(/brightness\s*:/);
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
