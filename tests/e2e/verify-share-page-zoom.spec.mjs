// On a page shown zoomed out (a phone without a viewport meta tag), a share
// link restores the view on the shared point, the minimap indicator covers
// the visible part of the diagram, rotateKeepsView keeps the view and search
// outlines the shape behind a matched label. WebKit reports getScreenCTM()
// in zoomed pixels there, while getBoundingClientRect() stays in layout
// pixels.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

// repro.html has no viewport meta tag, so a 390px phone lays it out 980px
// wide and zooms out to fit
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

// Diagram point at the viewport centre, measured only with
// getBoundingClientRect. Cell centres are known diagram points (A1 at
// 100,100, J1 at 1900,100, A6 at 100,1100), so they give the diagram to
// client mapping at any rotation.
const centerByRects = (p) =>
  p.evaluate(() => {
    const viewport = document.getElementById("diagview-modal-viewport");
    const rects = viewport.querySelectorAll("svg rect");
    const mid = (i) => {
      const r = rects[i].getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const [ax, ay] = mid(0);
    const [bx, by] = mid(9);
    const [cx, cy] = mid(50);
    const a = (bx - ax) / 1800;
    const b = (by - ay) / 1800;
    const c = (cx - ax) / 1000;
    const d = (cy - ay) / 1000;
    const vr = viewport.getBoundingClientRect();
    const X = vr.left + vr.width / 2 - ax;
    const Y = vr.top + vr.height / 2 - ay;
    const det = a * d - b * c;
    return { x: 100 + (d * X - c * Y) / det, y: 100 + (a * Y - b * X) / det };
  });

async function openZoomed(browser, turns) {
  const page = await newPage(browser, PHONE);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  for (let i = 0; i < turns; i++) {
    await page.keyboard.press("r");
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => {
    const pz = DiagView.default.state.activePanzoom;
    pz.zoom(3, { animate: false });
    pz.pan(-150, -80, { animate: false });
  });
  await page.waitForTimeout(500);
  return page;
}

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

for (const turns of [0, 1]) {
  test(`share link restores the centre at ${turns * 90} degrees`, async ({ browser }) => {
    const page = await openZoomed(browser, turns);
    const shared = await centerByRects(page);
    await page.evaluate(() => document.getElementById("dv-share").click());
    await page.waitForTimeout(500);
    const q = new URL(await page.evaluate(() => window.__copied)).searchParams;

    const page2 = await newPage(browser, PHONE);
    await page2.goto(REPRO + "?" + q.toString());
    await page2.waitForTimeout(2500);
    const restored = await centerByRects(page2);
    const detail = `shared (${shared.x.toFixed(1)}, ${shared.y.toFixed(1)}) restored (${restored.x.toFixed(1)}, ${restored.y.toFixed(1)})`;
    expect(Math.abs(restored.x - shared.x), detail).toBeLessThan(2);
    expect(Math.abs(restored.y - shared.y), detail).toBeLessThan(2);
  });
}

test("minimap indicator covers the visible part", async ({ browser }) => {
  const page = await openZoomed(browser, 0);
  const r = await page.evaluate(() => {
    const viewport = document.getElementById("diagview-modal-viewport");
    const rects = viewport.querySelectorAll("svg rect");
    const mid = (i) => {
      const b = rects[i].getBoundingClientRect();
      return [b.left + b.width / 2, b.top + b.height / 2];
    };
    const [ax, ay] = mid(0);
    const [bx] = mid(9);
    const [, cy] = mid(50);
    const vr = viewport.getBoundingClientRect();
    // Visible rect in diagram units, then where it lands on the thumbnail.
    // The bottom edge is left out, the indicator clamps it to the diagram.
    const left = 100 + ((vr.left - ax) * 1800) / (bx - ax);
    const right = 100 + ((vr.right - ax) * 1800) / (bx - ax);
    const top = 100 + ((vr.top - ay) * 1000) / (cy - ay);
    const mm = DiagView.default.state.minimapSvg;
    const vb = mm.viewBox.baseVal;
    const m = mm.getBoundingClientRect();
    const toX = (x) => m.left + ((x - vb.x) / vb.width) * m.width;
    const ind = document.querySelector("#diagview-minimap .dv-mm-v").getBoundingClientRect();
    return {
      want: {
        left: toX(left),
        top: m.top + ((top - vb.y) / vb.height) * m.height,
        width: toX(right) - toX(left),
      },
      got: { left: ind.left, top: ind.top, width: ind.width },
    };
  });
  const detail = JSON.stringify(r);
  for (const k of ["left", "top", "width"]) {
    expect(Math.abs(r.got[k] - r.want[k]), detail).toBeLessThan(2);
  }
});

// Diagram units per client pixel along the diagram's x axis, from A1 and J1
const unitsPerPixel = (p) =>
  p.evaluate(() => {
    const rects = document.querySelectorAll("#diagview-modal-viewport svg rect");
    const mid = (i) => {
      const r = rects[i].getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const [ax, ay] = mid(0);
    const [bx, by] = mid(9);
    return 1800 / Math.hypot(bx - ax, by - ay);
  });

for (const turns of [0, 1]) {
  test(`rotateKeepsView keeps the view from ${turns * 90} degrees`, async ({ browser }) => {
    const page = await openZoomed(browser, turns);
    await page.evaluate(() => DiagView.default.configure({ rotateKeepsView: true }));
    const before = await centerByRects(page);
    const sizeBefore = await unitsPerPixel(page);
    await page.keyboard.press("r");
    await page.waitForTimeout(700);
    const after = await centerByRects(page);
    const sizeAfter = await unitsPerPixel(page);
    const detail = `before (${before.x.toFixed(1)}, ${before.y.toFixed(1)}) after (${after.x.toFixed(1)}, ${after.y.toFixed(1)})`;
    expect(Math.abs(after.x - before.x), detail).toBeLessThan(2);
    expect(Math.abs(after.y - before.y), detail).toBeLessThan(2);
    expect(Math.abs(sizeAfter / sizeBefore - 1), `${sizeBefore} -> ${sizeAfter}`).toBeLessThan(
      0.01,
    );
  });
}

test("search outlines a large shape behind the matched text", async ({ browser }) => {
  const page = await newPage(browser, PHONE);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  // A labelled box over a quarter of the diagram, under the backdrop size
  await page.evaluate(() => {
    document.querySelector("#diag svg").innerHTML =
      '<rect id="wide" x="0" y="0" width="1000" height="600" fill="#9cf"/>' +
      '<text x="500" y="310" font-size="40">Wide</text>' +
      '<rect x="1600" y="1000" width="400" height="200" fill="#fc9"/>';
    DiagView.default.openFullscreen(document.getElementById("diag"));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const input = document.getElementById("diagview-search");
    input.value = "Wide";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const marked = await page.evaluate(() =>
    document
      .querySelector("#diagview-modal-viewport svg [id$='wide']")
      .classList.contains("dv-search-match"),
  );
  expect(marked).toBe(true);
});
