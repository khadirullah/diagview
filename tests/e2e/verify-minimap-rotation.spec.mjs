// Minimap click navigation and viewport indicator while the diagram is
// rotated with R (90, 180, 270, then back to 0).
import { test, expect } from "@playwright/test";
import { REPRO, newPage, centerInSVG } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
});

test.afterAll(async () => {
  await page.context().close();
});

for (const angle of [90, 180, 270, 0]) {
  test(`rot ${angle}: minimap click centers target`, async () => {
    // R rotates +90 and resets zoom; wait out the 0.4 s rotator transition
    await page.keyboard.press("r");
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => DiagView.default.state.rotationAngle)).toBe(angle);

    // Zoom back in so the minimap shows, nudge pan so the view is off-centre
    await page.evaluate(() => {
      const pz = DiagView.default.state.activePanzoom;
      pz.zoom(4, { animate: false });
      pz.pan(-80, -50, { animate: false });
    });
    await page.waitForTimeout(400); // throttled updateMinimap

    const visible = await page.evaluate(() =>
      document.getElementById("diagview-minimap")?.classList.contains("show"),
    );
    expect(visible, `rot ${angle}: minimap visible`).toBe(true);

    // Aim at cell C2 centre (500, 300). Mouse events carry whole pixels and
    // one minimap pixel is about 20 units here, so click a whole pixel and
    // expect the diagram point under that pixel. Aiming at (500, 300) with a
    // fractional position left up to 20 units of rounding in the result.
    const aim = { x: 500, y: 300 };
    const { click, T } = await page.evaluate((t) => {
      const mmSvg = DiagView.default.state.minimapSvg;
      const ctm = mmSvg.getScreenCTM();
      const pt = mmSvg.createSVGPoint();
      pt.x = t.x;
      pt.y = t.y;
      const sp = pt.matrixTransform(ctm);
      pt.x = Math.round(sp.x);
      pt.y = Math.round(sp.y);
      const hit = pt.matrixTransform(ctm.inverse());
      return { click: { x: pt.x, y: pt.y }, T: { x: hit.x, y: hit.y } };
    }, aim);
    await page.mouse.click(click.x, click.y);
    await page.waitForTimeout(800); // pan animates

    const landed = await centerInSVG(page);
    const detail = `aimed (${aim.x},${aim.y}), clicked (${T.x.toFixed(1)},${T.y.toFixed(1)}), landed (${landed.x.toFixed(1)},${landed.y.toFixed(1)})`;
    expect(Math.abs(landed.x - T.x), detail).toBeLessThan(15);
    expect(Math.abs(landed.y - T.y), detail).toBeLessThan(15);
  });

  test(`rot ${angle}: indicator centered on visible area`, async () => {
    // The indicator centre must sit where the viewport centre's viewBox
    // point falls inside the minimap snapshot
    await page.waitForTimeout(300); // let the throttled indicator update settle
    const ind = await page.evaluate(() => {
      const c = window.__centerInSVG();
      const mmSvg = DiagView.default.state.minimapSvg;
      const pt = mmSvg.createSVGPoint();
      pt.x = c.x;
      pt.y = c.y;
      const expected = pt.matrixTransform(mmSvg.getScreenCTM());
      const r = document.querySelector("#diagview-minimap .dv-mm-v").getBoundingClientRect();
      return {
        ex: expected.x,
        ey: expected.y,
        ix: r.left + r.width / 2,
        iy: r.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    });
    const err = Math.hypot(ind.ex - ind.ix, ind.ey - ind.iy);
    const detail = `offset ${err.toFixed(1)}px, indicator ${ind.w.toFixed(0)}x${ind.h.toFixed(0)}px`;
    expect(err, detail).toBeLessThan(15);
    expect(ind.w, detail).toBeGreaterThan(2);
    expect(ind.h, detail).toBeGreaterThan(2);
  });
}
