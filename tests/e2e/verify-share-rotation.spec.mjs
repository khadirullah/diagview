// A share link taken on a rotated and zoomed diagram restores the rotation
// (diagram and minimap), the zoom and the centred point for the recipient.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;
let q;
let st;

// Viewport centre in the SVG's rotated user space, the space dv-cx/dv-cy
// are captured in (share.js uses the SVG root's CTM)
const rootCenter = (p) =>
  p.evaluate(() => {
    const viewport = document.getElementById("diagview-modal-viewport");
    const s = viewport.querySelector("svg");
    const vr = viewport.getBoundingClientRect();
    const pt = s.createSVGPoint();
    pt.x = vr.left + vr.width / 2;
    pt.y = vr.top + vr.height / 2;
    const c = pt.matrixTransform(s.getScreenCTM().inverse());
    return { x: c.x, y: c.y };
  });

let sharerCenter;

test.beforeAll(async ({ browser }) => {
  // Sharer: rotate 90, zoom in, pan off-centre
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  await page.keyboard.press("r"); // rotate 90 (resets zoom)
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const pz = DiagView.default.state.activePanzoom;
    pz.zoom(3, { animate: false });
    pz.pan(-120, -60, { animate: false });
  });
  await page.waitForTimeout(400);
  sharerCenter = await rootCenter(page);
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("share link includes dv-r=90", async () => {
  await page.evaluate(() => document.getElementById("dv-share").click());
  await page.waitForTimeout(500);
  const link = await page.evaluate(() => window.__copied);
  q = new URL(link).searchParams;
  expect(q.get("dv-r"), `params: ${q.toString()}`).toBe("90");
});

test.describe("recipient", () => {
  /** @type {import("@playwright/test").Page} */
  let page2;

  test("diagram DOM is rotated 90°", async ({ browser }) => {
    page2 = await newPage(browser);
    await page2.goto(REPRO + "?" + q.toString());
    await page2.waitForTimeout(2200);
    st = await page2.evaluate(() => {
      const svg = document.getElementById("diagview-modal-viewport")?.querySelector("svg");
      const rotG = svg?.querySelector(":scope > g.dv-rot-g");
      return {
        angle: DiagView.default.state.rotationAngle,
        rotTransform: rotG?.getAttribute("transform") || null,
        scale: DiagView.default.state.activePanzoom?.getScale(),
        mmTransform: DiagView.default.state.minimapSvg?.style.transform || "(no minimap)",
      };
    });
    expect(st.rotTransform?.startsWith("rotate(90"), `rot-g transform: ${st.rotTransform}`).toBe(
      true,
    );
  });

  test("state angle is 90", async () => {
    expect(st.angle).toBe(90);
  });

  test("zoom restored", async () => {
    expect(Math.abs(st.scale - Number(q.get("dv-z"))), `scale ${st.scale}`).toBeLessThan(0.01);
  });

  test("minimap rotation matches diagram", async () => {
    expect(["rotate(90deg)", "(no minimap)"], `minimap transform: ${st.mmTransform}`).toContain(
      st.mmTransform,
    );
  });

  test("view centered on shared point", async () => {
    const restored = await rootCenter(page2);
    const detail = `encoded (${q.get("dv-cx")}, ${q.get("dv-cy")}) restored (${restored.x.toFixed(1)}, ${restored.y.toFixed(1)}); sharer was (${sharerCenter.x.toFixed(1)}, ${sharerCenter.y.toFixed(1)})`;
    expect(Math.abs(restored.x - Number(q.get("dv-cx"))), detail).toBeLessThan(2);
    expect(Math.abs(restored.y - Number(q.get("dv-cy"))), detail).toBeLessThan(2);
  });
});

test("unrotated share still exact", async ({ browser }) => {
  const page3 = await newPage(browser);
  await page3.goto(REPRO);
  await page3.waitForTimeout(300);
  await page3.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page3.waitForTimeout(800);
  await page3.evaluate(() => {
    const pz = DiagView.default.state.activePanzoom;
    pz.zoom(3, { animate: false });
    pz.pan(-150, -80, { animate: false });
  });
  await page3.waitForTimeout(300);
  await page3.evaluate(() => document.getElementById("dv-share").click());
  await page3.waitForTimeout(500);
  const q2 = new URL(await page3.evaluate(() => window.__copied)).searchParams;
  const page4 = await newPage(browser);
  await page4.goto(REPRO + "?" + q2.toString());
  await page4.waitForTimeout(2000);
  const r2 = await rootCenter(page4);
  const detail = `encoded (${q2.get("dv-cx")}, ${q2.get("dv-cy")}) restored (${r2.x.toFixed(1)}, ${r2.y.toFixed(1)})`;
  expect(Math.abs(r2.x - Number(q2.get("dv-cx"))), detail).toBeLessThan(2);
  expect(Math.abs(r2.y - Number(q2.get("dv-cy"))), detail).toBeLessThan(2);
});
