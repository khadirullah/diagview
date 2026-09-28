// Double click and the resize reset follow zoomAnimationDuration, like the
// reset button and the 0 key. 0 turns the glide off.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

async function openZoomed(duration) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async (d) => {
    const dv = DiagView.default;
    if (dv.state.isModalOpen) await dv.closeModal();
    dv.configure(d === null ? {} : { zoomAnimationDuration: d });
    await dv.openFullscreen(document.getElementById("diag"));
  }, duration);
  await page.waitForTimeout(500);
  await page.evaluate(() => DiagView.default.state.activePanzoom.zoom(3, { animate: false }));
  await page.waitForTimeout(100);
}

/** The Panzoom element's transition time and its scale right now */
const pose = () =>
  page.evaluate(() => {
    // Panzoom moves the diagram's SVG itself, inside the rotation wrapper
    const el = [...document.querySelectorAll("#diagview-modal-viewport svg")].find(
      (svg) => svg.style.transform,
    );
    return {
      duration: getComputedStyle(el).transitionDuration,
      scale: new DOMMatrix(getComputedStyle(el).transform).a,
    };
  });

for (const [duration, ms] of [
  // The default first, while no zoomAnimationDuration is set
  [null, "0.2s"],
  [0, "0s"],
  [700, "0.7s"],
]) {
  test(`double click resets over ${ms} with zoomAnimationDuration ${duration}`, async () => {
    await openZoomed(duration);
    const box = await page.locator("#diagview-modal-viewport").boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(80);
    const now = await pose();
    expect(now.duration).toBe(ms);
    if (duration === 0) expect(now.scale).toBeLessThan(3);
    if (duration === 700) expect(now.scale).toBeGreaterThan(1.2);
  });

  test(`the resize reset glides for ${ms} with zoomAnimationDuration ${duration}`, async () => {
    await openZoomed(duration);
    await page.setViewportSize({ width: 700, height: 800 });
    await page.waitForTimeout(450);
    expect((await pose()).duration).toBe(ms);
  });
}
