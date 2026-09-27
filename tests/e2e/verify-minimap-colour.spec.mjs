// The minimap image bakes in the viewer text colour for parts drawn in
// currentColor. Changing the canvas from the menu, or the page theme in
// Auto mode, must redraw it in the new colour. Diagrams without
// currentColor keep the image they opened with. The page eases colour
// changes, so the viewer colour is only final once its transitions end.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const PAGE = `${SITE}/tests/e2e/fixtures/minimap-colour.html`;
// Swatch order in the menu: 0 custom picker, 1 White, 2 Dark Slate, 3 Navy, 4 Charcoal
const WHITE = 1;
const CHARCOAL = 4;

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(PAGE);
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

async function open(id) {
  await page.evaluate(async (id) => {
    const dv = DiagView.default;
    if (dv.state.isModalOpen) dv.closeModal();
    await new Promise((r) => setTimeout(r, 900));
    dv.openFullscreen(document.getElementById(id));
  }, id);
  await page.waitForTimeout(800);
  await page.evaluate(() => DiagView.default.state.activePanzoom.zoom(4, { animate: false }));
  await page.waitForTimeout(500); // throttled updateMinimap
  await expect(page.locator("#diagview-minimap.show")).toHaveCount(1);
}

async function openMenu() {
  if (await page.locator(".diagview-menu.active").count()) return;
  await page.locator(".diagview-fab-btn").click({ timeout: 3000 });
  await page.waitForSelector(".diagview-menu.active", { timeout: 3000 });
  await page.waitForTimeout(150);
}

async function pick(locator) {
  await openMenu();
  await locator.click({ timeout: 3000 });
  await page.waitForTimeout(300);
}
const pickMode = (mode) =>
  pick(page.locator(`.diagview-menu.active .dv-theme-btn[data-canvas="${mode}"]`));
const pickSwatch = (i) => pick(page.locator(".diagview-menu.active .dv-swatch-btn").nth(i));

/** Viewer text colour, the colour the minimap image gives currentColor, and the image element */
const read = () =>
  page.evaluate(() => {
    const img = DiagView.default.state.minimapSvg?.querySelector("image");
    const href = decodeURIComponent(img?.getAttribute("href") || "");
    const baked = href.match(/:root\{color:([^!]+)!important\}/);
    const shown = document.querySelector("#diagview-modal-viewport svg");
    window.__mmImg = window.__mmImg || img;
    // The colour the viewer is heading for, read without a transition
    const probe = document.createElement("i");
    probe.style.cssText = "transition:none;color:var(--dv-text-color)";
    document.body.appendChild(probe);
    const target = getComputedStyle(probe).color;
    probe.remove();
    return {
      target,
      text: getComputedStyle(shown).color,
      baked: baked ? baked[1] : null,
      href,
      sameImage: window.__mmImg === img,
      shown: document.getElementById("diagview-minimap").classList.contains("show"),
    };
  });

/** Wait for the viewer colour to settle and the minimap to catch up */
async function settled() {
  await expect
    .poll(
      async () => {
        const r = await read();
        return r.text === r.target && r.baked === r.text;
      },
      { timeout: 5000 },
    )
    .toBe(true);
  return read();
}

test("currentColor diagram: minimap follows dark, then a light swatch", async () => {
  await open("cc");
  await page.evaluate(() => (window.__mmImg = null));
  const start = await read();
  expect(start.baked).toBe(start.text);

  await pickMode("dark");
  const dark = await settled();
  expect(dark.text).not.toBe(start.text);

  await pickSwatch(CHARCOAL);
  const charcoal = await settled();
  expect(charcoal.text).toBe(dark.text);

  await pickSwatch(WHITE);
  const white = await settled();
  expect(white.text).not.toBe(charcoal.text);

  // Same thumbnail, still shown, only its source changed
  expect(white.sameImage).toBe(true);
  expect(white.shown).toBe(true);
});

test("currentColor diagram: the indicator and click-to-navigate still work", async () => {
  const before = await page.evaluate(() => DiagView.default.state.activePanzoom.getPan());
  const box = await page.locator("#diagview-minimap").boundingBox();
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => DiagView.default.state.activePanzoom.getPan());
  expect(after.x).not.toBeCloseTo(before.x, 0);
  const ind = await page.locator("#diagview-minimap .dv-mm-v").boundingBox();
  expect(ind.width).toBeGreaterThan(0);
  expect(ind.x).toBeGreaterThanOrEqual(box.x - 1);
  expect(ind.x + ind.width).toBeLessThanOrEqual(box.x + box.width + 1);
});

test("currentColor diagram: Auto mode follows a page theme change", async () => {
  await pickMode("auto");
  const light = await settled();
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.style.cssText = "background:#0f172a;color:#e2e8f0";
  });
  await expect.poll(async () => (await read()).text, { timeout: 5000 }).not.toBe(light.text);
  await settled();
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-theme");
    document.body.style.cssText = "";
  });
  await page.waitForTimeout(800);
});

test("diagram without currentColor keeps its minimap image", async () => {
  await pickMode("light");
  await open("plain");
  await page.evaluate(() => (window.__mmImg = null));
  const start = await read();
  expect(start.baked).toBeNull();

  await pickMode("dark");
  await expect
    .poll(async () => {
      const r = await read();
      return r.text === r.target && r.text !== start.text;
    })
    .toBe(true);
  await page.waitForTimeout(500);
  expect((await read()).href).toBe(start.href);
  await pickSwatch(CHARCOAL);
  await pickSwatch(WHITE);
  const end = await read();
  expect(end.sameImage).toBe(true);
  expect(end.href).toBe(start.href);
});
