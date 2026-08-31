/**
 * Verifies minimap click navigation and viewport-indicator placement while
 * the diagram is rotated (R key: 90/180/270/0). Run after `npm run build`.
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.join(here, "repro.html");
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pageUrl);
await page.waitForTimeout(300);
await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page.waitForTimeout(800);

for (const step of [90, 180, 270, 0]) {
  // R rotates +90 and resets zoom; wait out the 0.4s rotator transition
  await page.keyboard.press("r");
  await page.waitForTimeout(700);
  const angle = await page.evaluate(() => DiagView.default.state.rotationAngle);

  // Zoom back in so the minimap shows, nudge pan so the view is off-center
  await page.evaluate(() => {
    const pz = DiagView.default.state.activePanzoom;
    pz.zoom(4, { animate: false });
    pz.pan(-80, -50, { animate: false });
  });
  await page.waitForTimeout(400); // throttled updateMinimap

  const mmVisible = await page.evaluate(() =>
    document.getElementById("diagview-minimap")?.classList.contains("show"),
  );
  if (!mmVisible) {
    check(`rot ${angle}: minimap visible`, false);
    continue;
  }

  // --- Click test: target cell C2 center (500, 300) ---
  const T = { x: 500, y: 300 };
  const clickPos = await page.evaluate((t) => {
    const mmSvg = DiagView.default.state.minimapSvg;
    const pt = mmSvg.createSVGPoint();
    pt.x = t.x;
    pt.y = t.y;
    const sp = pt.matrixTransform(mmSvg.getScreenCTM());
    return { x: sp.x, y: sp.y };
  }, T);
  await page.mouse.click(clickPos.x, clickPos.y);
  await page.waitForTimeout(800); // pan animates

  const landed = await page.evaluate(() => window.__centerInSVG());
  const dx = Math.abs(landed.x - T.x);
  const dy = Math.abs(landed.y - T.y);
  check(
    `rot ${angle}: minimap click centers target`,
    dx < 15 && dy < 15,
    `target (${T.x},${T.y}) landed (${landed.x.toFixed(1)},${landed.y.toFixed(1)})`,
  );

  // --- Indicator test: its center must sit where the current viewport
  // center's viewBox point falls inside the minimap snapshot ---
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
  check(
    `rot ${angle}: indicator centered on visible area`,
    err < 15 && ind.w > 2 && ind.h > 2,
    `offset ${err.toFixed(1)}px, indicator ${ind.w.toFixed(0)}x${ind.h.toFixed(0)}px`,
  );
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} rotation checks passed`);
process.exit(failed ? 1 : 0);
