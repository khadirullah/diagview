// Look of the fullscreen menu buttons: hover on the Canvas Theme and Text
// Colours buttons on light, dark and custom canvases, and the corners of
// the menu button and swatches while they have keyboard focus.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

// Button colours, plus its background as seen, laid over the first solid
// background behind it, so a see-through hover that matches the panel counts
// as no change
const look = (sel) =>
  page.evaluate((s) => {
    const rgba = (c) => {
      const n = c.match(/[\d.]+/g).map(Number);
      const unit = c.startsWith("color(");
      return {
        r: unit ? n[0] * 255 : n[0],
        g: unit ? n[1] * 255 : n[1],
        b: unit ? n[2] * 255 : n[2],
        a: n.length > 3 ? n[3] : 1,
      };
    };
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    let under = el.parentElement;
    while (under && rgba(getComputedStyle(under).backgroundColor).a < 1)
      under = under.parentElement;
    const back = rgba(under ? getComputedStyle(under).backgroundColor : "rgb(255, 255, 255)");
    const top = rgba(cs.backgroundColor);
    const seen = ["r", "g", "b"].map((k) => Math.round(top[k] * top.a + back[k] * (1 - top.a)));
    return { bg: cs.backgroundColor, seen, border: cs.borderTopColor, color: cs.color };
  }, sel);

const distance = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

async function setCanvas(canvas) {
  if (canvas === "custom") {
    await page.evaluate(() => {
      const input = document.querySelector(".dv-custom-color-input");
      input.value = "#fde68a";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  } else {
    await page.click(`.dv-theme-btn[data-canvas="${canvas}"]`);
  }
  await page.waitForTimeout(300);
}

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  await page.click("#dv-toggle");
  await page.waitForTimeout(400);
});

test.afterAll(async () => {
  await page.context().close();
});

for (const canvas of ["light", "dark", "custom"]) {
  test(`${canvas} canvas: theme and text buttons show a hover that is not the selected look`, async () => {
    await setCanvas(canvas);
    const idleSel = canvas === "dark" ? '[data-canvas="light"]' : '[data-canvas="dark"]';
    for (const sel of [`.dv-theme-btn${idleSel}`, '.dv-text-mode-btn[data-text-mode="readable"]']) {
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      const idle = await look(sel);
      await page.hover(sel);
      await page.waitForTimeout(300);
      const hovered = await look(sel);
      const active = await look(".dv-text-mode-btn.active");
      // Clearly visible against the button at rest, and far from the full
      // accent fill of the selected button
      expect(distance(hovered.seen, idle.seen), `${sel} hover ${hovered.bg}`).toBeGreaterThan(30);
      expect(distance(hovered.seen, active.seen), `${sel} hover against selected`).toBeGreaterThan(
        60,
      );
      expect(hovered.color, `${sel} text colour`).toBe(idle.color);
    }
  });
}

test("hovering the selected button keeps it looking selected", async () => {
  await setCanvas("light");
  const sel = '.dv-theme-btn[data-canvas="light"]';
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  const before = await look(sel);
  await page.hover(sel);
  await page.waitForTimeout(300);
  expect(await look(sel)).toEqual(before);
});

const corner = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    return {
      radius: cs.borderTopLeftRadius,
      ring: cs.boxShadow,
      focused: document.activeElement === el,
      visible: el.matches(":focus-visible"),
    };
  }, sel);

test("a swatch stays round while it has keyboard focus", async () => {
  await page.focus('.dv-swatch-btn[data-canvas="#ffffff"]');
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const swatch = await corner('.dv-swatch-btn[data-canvas="#ffffff"]');
  expect(swatch.focused).toBe(true);
  expect(swatch.radius).toBe("50%");
});

test("the menu button keeps its round corners after Escape closes the menu", async () => {
  expect(await corner("#dv-toggle")).toMatchObject({ radius: "50%" }); // open
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const fab = await corner("#dv-toggle");
  expect(fab.focused).toBe(true);
  expect(fab.radius).toBe("16px");
  // Chrome and Safari show the focus ring here, and it must still be drawn
  if (fab.visible) expect(fab.ring).not.toBe("none");
});
