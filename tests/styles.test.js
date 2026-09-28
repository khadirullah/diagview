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

  test("hides when the shortcuts panel is turned off, also on wide screens", () => {
    const wide = css.indexOf(".diagview-shortcut-hint {\n    display: flex;");
    const hide = css.indexOf(".dv-no-help .diagview-shortcut-hint {");
    expect(wide).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(wide);
    expect(ruleBody(".dv-no-help .diagview-shortcut-hint {")).toMatch(/display:\s*none/);
  });

  test("hint text uses the muted colour instead of opacity, so it keeps 4.5:1", () => {
    const body = ruleBody(".diagview-shortcut-hint {");
    expect(body).toContain("color: var(--dv-muted-text");
    expect(body).not.toMatch(/opacity\s*:/);
  });

  // Docs sites often style kbd with a more specific rule such as html.dark kbd
  test.each([".diagview-shortcut-hint kbd,", ".dv-menu-item kbd {", ".diagview-help-key kbd {"])(
    "%s outranks a host page's kbd colours, border, shadow, font and padding",
    (selector) => {
      const body = ruleBody(selector);
      for (const prop of ["color", "background", "border", "box-shadow", "padding"]) {
        expect(body).toMatch(new RegExp(`(^|[;\\s])${prop}:[^;]*!important`));
      }
      expect(body).toMatch(/font(-size)?:[^;]*!important/);
      expect(body).toMatch(/box-shadow:\s*none\s*!important/);
    },
  );

  test("menu key badges switch to the accent text colour on a hovered or active item", () => {
    expect(ruleBody(".dv-menu-item.active kbd {")).toMatch(
      /color:\s*var\(--dv-on-accent\)\s*!important/,
    );
    expect(css).toContain(".dv-menu-item:hover kbd,\n.dv-menu-item.active kbd {");
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

  test("reduced motion stops the laser pulse instead of speeding it up", () => {
    const idx = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    expect(ruleBody(".diagview-laser::before {", idx)).toMatch(/animation:\s*none;/);
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
  test("links in a diagram get an outline, since box-shadow does not paint on SVG", () => {
    const body = ruleBody(".diagview-wrapper svg a:focus-visible {");
    expect(body).toMatch(/outline:\s*2px solid var\(--dv-accent\) !important/);
    expect(css).toContain(
      ".diagview-modal svg a:focus-visible,\n.diagview-wrapper svg a:focus-visible {",
    );
  });

  test("the custom colour swatch shows the ring while its hidden input has keyboard focus", () => {
    const body = ruleBody(".dv-swatch-custom:has(:focus-visible) {");
    expect(body).not.toBeNull();
    expect(body).toMatch(/0 0 0 4px var\(--dv-accent\)/);
    expect(css).not.toMatch(/\.dv-swatch-custom:focus-within/);
  });

  test("keeps each control's own corners instead of its parent's", () => {
    const body = ruleBody(".diagview-menu *:focus-visible {");
    expect(body).toMatch(/box-shadow:/);
    expect(body).not.toMatch(/border-radius:/);
  });
});

describe("styles.css: page buttons", () => {
  test("the floating layout sets only the size, so ui.buttons.style decides the look", () => {
    const body = ruleBody(".diagview-controls-floating .diagview-btn {");
    expect(body).toMatch(/width:\s*36px/);
    expect(body).not.toMatch(/background|border|color|box-shadow|filter|!important/);
  });

  test("built-in icons are outlines and custom icons keep their own fill", () => {
    expect(ruleBody(".diagview-btn svg {")).not.toMatch(/fill|stroke/);
    const outline = ruleBody(".diagview-btn:not(.dv-custom-icon) svg {");
    expect(outline).toMatch(/fill:\s*none/);
    expect(outline).toMatch(/stroke:\s*currentColor/);
    expect(ruleBody(".dv-custom-icon svg:not([fill]) {")).toMatch(/fill:\s*currentColor/);
    expect(css).not.toContain(".dv-btn-accent svg");
  });

  // Same specificity and !important as .dv-btn-accent:hover, so order decides
  test("the success state comes after every style's hover rule, so it shows under the pointer", () => {
    const success = css.indexOf(".diagview-btn.success {");
    for (const style of ["transparent", "accent", "solid", "neutral"]) {
      const hover = css.indexOf(`.dv-btn-${style}:hover {`);
      expect(hover).toBeGreaterThan(-1);
      expect(success).toBeGreaterThan(hover);
    }
    expect(ruleBody(".diagview-btn.success {")).toMatch(/background:\s*#10b981 !important/);
  });

  test("the success check replaces the icon instead of drawing over it", () => {
    expect(ruleBody(".diagview-btn.success svg {")).toMatch(/visibility:\s*hidden/);
    const check = ruleBody(".diagview-btn.success::after {");
    expect(check).toMatch(/content:\s*""/);
    expect(check).toMatch(/border-width:/);
    expect(check).toMatch(/transform:\s*translateY\(-1px\) rotate\(45deg\)/);
  });

  test("every checkmark keyframe keeps the check rotated while it scales", () => {
    const start = css.indexOf("@keyframes checkmark {");
    const steps = css.slice(start, css.indexOf("\n}", start)).match(/transform:[^;]*/g);
    expect(steps).toHaveLength(3);
    for (const step of steps) expect(step).toContain("rotate(45deg)");
  });
});
