// Core geometry checks: drag and wheel on desktop, share restore, minimap
// click, focus trap, rememberZoom, and touch on a phone-sized page.
import { test, expect } from "@playwright/test";
import { REPRO, newPage, centerInSVG } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const openDiagram = (page) =>
  page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));

/** @type {import("@playwright/test").Page} */
let page;
/** @type {import("@playwright/test").Page} */
let page2;
let link;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  await openDiagram(page);
  await page.waitForTimeout(700);
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test.describe("desktop", () => {
  test("drag pans 1:1 with cursor", async () => {
    await page.evaluate(() => DiagView.default.state.activePanzoom.zoom(3, { animate: false }));
    await page.waitForTimeout(200);
    const c0 = await centerInSVG(page);
    const unitsPerPx = await page.evaluate(() => {
      const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
      return 1 / svg.getScreenCTM().a; // SVG units per screen px
    });
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(740, 460, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const c1 = await centerInSVG(page);
    const expDX = -100 * unitsPerPx;
    const expDY = -60 * unitsPerPx;
    const detail = `moved (${(c1.x - c0.x).toFixed(1)}, ${(c1.y - c0.y).toFixed(1)}) svg-units, expected (${expDX.toFixed(1)}, ${expDY.toFixed(1)})`;
    expect(Math.abs(c1.x - c0.x - expDX), detail).toBeLessThan(2);
    expect(Math.abs(c1.y - c0.y - expDY), detail).toBeLessThan(2);
  });

  test("wheel zoom increases scale", async () => {
    const s0 = await page.evaluate(() => DiagView.default.state.activePanzoom.getScale());
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => DiagView.default.state.activePanzoom.getScale());
    expect(s1, `scale ${s0.toFixed(2)} -> ${s1.toFixed(2)}`).toBeGreaterThan(s0);
  });

  test("share restore centers on shared point", async ({ browser }) => {
    await page.evaluate(() => document.getElementById("dv-share").click());
    await page.waitForTimeout(400);
    link = await page.evaluate(() => window.__copied);
    const q = new URL(link).searchParams;
    const sharer = await centerInSVG(page);

    page2 = await newPage(browser);
    await page2.goto(REPRO + "?" + q.toString());
    await page2.waitForTimeout(1800);
    const restored = await centerInSVG(page2);
    const detail = `encoded (${q.get("dv-cx")}, ${q.get("dv-cy")}) restored (${restored?.x.toFixed(1)}, ${restored?.y.toFixed(1)}) at scale ${restored?.scale} (sharer was at (${sharer.x.toFixed(1)}, ${sharer.y.toFixed(1)}))`;
    expect(restored, detail).toBeTruthy();
    expect(Math.abs(restored.x - Number(q.get("dv-cx"))), detail).toBeLessThan(2);
    expect(Math.abs(restored.y - Number(q.get("dv-cy"))), detail).toBeLessThan(2);
  });

  test("minimap click centers clicked point", async () => {
    const T = { x: 1500, y: 900 }; // cell H5 area
    const clickPos = await page2.evaluate((t) => {
      const mmSvg = DiagView.default.state.minimapSvg;
      if (!mmSvg) return null;
      const pt = mmSvg.createSVGPoint();
      pt.x = t.x;
      pt.y = t.y;
      const sp = pt.matrixTransform(mmSvg.getScreenCTM());
      return { x: sp.x, y: sp.y };
    }, T);
    expect(clickPos, "minimap not visible").toBeTruthy();
    await page2.mouse.click(clickPos.x, clickPos.y);
    await page2.waitForTimeout(800);
    const landed = await centerInSVG(page2);
    const detail = `target (${T.x}, ${T.y}) landed (${landed.x.toFixed(1)}, ${landed.y.toFixed(1)})`;
    // One minimap px is about 13 units: MouseEvent coords are integer-quantized
    expect(Math.abs(landed.x - T.x), detail).toBeLessThan(15);
    expect(Math.abs(landed.y - T.y), detail).toBeLessThan(15);
  });

  test("focus trapped in modal on 2nd session", async () => {
    await page2.keyboard.press("Escape");
    await page2.waitForTimeout(500);
    await openDiagram(page2);
    await page2.waitForTimeout(600);
    for (let i = 0; i < 25; i++) await page2.keyboard.press("Tab");
    const trapped = await page2.evaluate(() => {
      const modal = document.getElementById("diagview-modal");
      return modal.contains(document.activeElement) || document.activeElement === modal;
    });
    expect(trapped).toBe(true);
  });

  test("rememberZoom restores position on reopen", async ({ browser }) => {
    const page3 = await newPage(browser);
    await page3.goto(REPRO);
    await page3.waitForTimeout(300);
    await page3.evaluate(() => {
      DiagView.default.configure({ rememberZoom: true });
      DiagView.default.openFullscreen(document.getElementById("diag"));
    });
    await page3.waitForTimeout(700);
    await page3.evaluate(() => {
      const pz = DiagView.default.state.activePanzoom;
      pz.zoom(2.5, { animate: false });
      pz.pan(-120, -70, { animate: false });
    });
    await page3.waitForTimeout(200);
    // panzoomend triggers the save, so dispatch one
    await page3.evaluate(() => {
      const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
      svg.dispatchEvent(new CustomEvent("panzoomend", { detail: {} }));
    });
    const saved = await centerInSVG(page3);
    await page3.keyboard.press("Escape");
    await page3.waitForTimeout(500);
    await openDiagram(page3);
    await page3.waitForTimeout(900);
    const restored = await centerInSVG(page3);
    const detail = `saved (${saved.x.toFixed(1)}, ${saved.y.toFixed(1)}) @2.5x, restored (${restored.x.toFixed(1)}, ${restored.y.toFixed(1)}) @${restored.scale}x`;
    expect(Math.abs(restored.x - saved.x), detail).toBeLessThan(5);
    expect(Math.abs(restored.y - saved.y), detail).toBeLessThan(5);
    expect(Math.abs(restored.scale - 2.5), detail).toBeLessThan(0.01);
  });
});

test.describe("mobile (touch)", () => {
  /** @type {import("@playwright/test").Page} */
  let mob;
  // Firefox has no mobile emulation in Playwright (isMobile throws), so it
  // gets a touch-enabled phone-sized window instead.
  const phone = (browserName) => ({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });

  test("modal opens", async ({ browser, browserName }) => {
    mob = await newPage(browser, {
      ...phone(browserName),
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    await mob.goto(REPRO);
    await mob.waitForTimeout(300);
    await openDiagram(mob);
    await mob.waitForTimeout(700);
    expect(await mob.evaluate(() => DiagView.default.state.isModalOpen)).toBe(true);
  });

  test("touch drag pans the diagram 1:1", async ({ browserName }) => {
    // A multi-step single-finger drag needs raw touch input, which Playwright
    // only offers through the Chrome DevTools Protocol.
    test.skip(browserName !== "chromium", "touch drag is sent through CDP, Chromium only");
    await mob.evaluate(() => DiagView.default.state.activePanzoom.zoom(2.5, { animate: false }));
    await mob.waitForTimeout(200);
    const m0 = await centerInSVG(mob);
    const cdp = await mob.context().newCDPSession(mob);
    const touch = (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", 195, 420);
    for (let i = 1; i <= 6; i++) await touch("touchMove", 195 + i * 10, 420 + i * 8);
    await touch("touchEnd", 255, 468);
    await mob.waitForTimeout(400);
    const m1 = await centerInSVG(mob);
    const unitsPerPx = await mob.evaluate(() => {
      const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
      return 1 / svg.getScreenCTM().a;
    });
    const expDX = -60 * unitsPerPx;
    const expDY = -48 * unitsPerPx;
    const detail = `moved (${(m1.x - m0.x).toFixed(1)}, ${(m1.y - m0.y).toFixed(1)}) svg-units, expected (${expDX.toFixed(1)}, ${expDY.toFixed(1)})`;
    expect(Math.abs(m1.x - m0.x), detail).toBeGreaterThan(5);
    expect(Math.abs(m1.y - m0.y), detail).toBeGreaterThan(3);
    expect(Math.abs(m1.x - m0.x - expDX), detail).toBeLessThan(4);
    expect(Math.abs(m1.y - m0.y - expDY), detail).toBeLessThan(4);
  });

  test("share restore centers on shared point", async ({ browser, browserName }) => {
    // Known library bug in WebKit: with a page scale other than 1 (a phone
    // page without a viewport meta tag, or a pinch-zoomed page) WebKit's
    // getScreenCTM() includes the page scale while getBoundingClientRect()
    // does not. share.js mixes the two, so the restored view is off centre.
    test.fail(browserName === "webkit", "WebKit getScreenCTM() includes the page scale");
    const q = new URL(link).searchParams;
    const mob2 = await newPage(browser, phone(browserName));
    await mob2.goto(REPRO + "?" + q.toString());
    await mob2.waitForTimeout(1800);
    const restored = await centerInSVG(mob2);
    const detail = `encoded (${q.get("dv-cx")}, ${q.get("dv-cy")}) restored (${restored?.x.toFixed(1)}, ${restored?.y.toFixed(1)})`;
    expect(restored, detail).toBeTruthy();
    expect(Math.abs(restored.x - Number(q.get("dv-cx"))), detail).toBeLessThan(2);
    expect(Math.abs(restored.y - Number(q.get("dv-cy"))), detail).toBeLessThan(2);
  });
});
