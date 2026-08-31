import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.join(here, "repro.html");
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});

// ============ DESKTOP ============
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pageUrl);
await page.waitForTimeout(300);
await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page.waitForTimeout(700);

// -- Drag pan 1:1 --
await page.evaluate(() => {
  const pz = DiagView.default.state.activePanzoom;
  pz.zoom(3, { animate: false });
});
await page.waitForTimeout(200);
const c0 = await page.evaluate(() => window.__centerInSVG());
const unitsPerPx = await page.evaluate(() => {
  const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
  return 1 / svg.getScreenCTM().a; // SVG units per screen px
});
await page.mouse.move(640, 400);
await page.mouse.down();
await page.mouse.move(740, 460, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const c1 = await page.evaluate(() => window.__centerInSVG());
const expDX = -100 * unitsPerPx, expDY = -60 * unitsPerPx;
const dragErrX = Math.abs(c1.x - c0.x - expDX);
const dragErrY = Math.abs(c1.y - c0.y - expDY);
check("desktop drag pans 1:1 with cursor", dragErrX < 2 && dragErrY < 2,
  `moved (${(c1.x - c0.x).toFixed(1)}, ${(c1.y - c0.y).toFixed(1)}) svg-units, expected (${expDX.toFixed(1)}, ${expDY.toFixed(1)})`);

// -- Wheel zoom works and panning still works after --
const s0 = await page.evaluate(() => DiagView.default.state.activePanzoom.getScale());
await page.mouse.move(640, 400);
await page.mouse.wheel(0, -240);
await page.waitForTimeout(300);
const s1 = await page.evaluate(() => DiagView.default.state.activePanzoom.getScale());
check("wheel zoom increases scale", s1 > s0, `scale ${s0.toFixed(2)} -> ${s1.toFixed(2)}`);

// -- Share link at high zoom --
await page.evaluate(() => document.getElementById("dv-share").click());
await page.waitForTimeout(400);
const link = await page.evaluate(() => window.__copied);
const q = new URL(link).searchParams;
const sharerCenter = await page.evaluate(() => window.__centerInSVG());

const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page2.goto(pageUrl + "?" + q.toString());
await page2.waitForTimeout(1800);
const restored = await page2.evaluate(() => window.__centerInSVG());
check("share restore centers on shared point", restored &&
  Math.abs(restored.x - Number(q.get("dv-cx"))) < 2 && Math.abs(restored.y - Number(q.get("dv-cy"))) < 2,
  `encoded (${q.get("dv-cx")}, ${q.get("dv-cy")}) restored (${restored?.x.toFixed(1)}, ${restored?.y.toFixed(1)}) at scale ${restored?.scale} (sharer was at (${sharerCenter.x.toFixed(1)}, ${sharerCenter.y.toFixed(1)}))`);

// -- Minimap click --
const T = { x: 1500, y: 900 }; // cell H5 area
const clickPos = await page2.evaluate((t) => {
  const mmSvg = DiagView.default.state.minimapSvg;
  if (!mmSvg) return null;
  const pt = mmSvg.createSVGPoint();
  pt.x = t.x; pt.y = t.y;
  const sp = pt.matrixTransform(mmSvg.getScreenCTM());
  return { x: sp.x, y: sp.y };
}, T);
if (clickPos) {
  await page2.mouse.click(clickPos.x, clickPos.y);
  await page2.waitForTimeout(800);
  const landed = await page2.evaluate(() => window.__centerInSVG());
  check("minimap click centers clicked point", Math.abs(landed.x - T.x) < 2 && Math.abs(landed.y - T.y) < 2,
    `target (${T.x}, ${T.y}) landed (${landed.x.toFixed(1)}, ${landed.y.toFixed(1)})`);
} else {
  check("minimap click centers clicked point", false, "minimap not visible");
}

// -- Second-session focus trap --
await page2.keyboard.press("Escape");
await page2.waitForTimeout(500);
await page2.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page2.waitForTimeout(600);
for (let i = 0; i < 25; i++) await page2.keyboard.press("Tab");
const trapped = await page2.evaluate(() => {
  const modal = document.getElementById("diagview-modal");
  return modal.contains(document.activeElement) || document.activeElement === modal;
});
check("focus trapped in modal on 2nd session", trapped);

// -- rememberZoom position survives reopen --
const page3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page3.goto(pageUrl);
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
// panzoomend triggers save; force a save by dispatching
await page3.evaluate(() => {
  const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
  svg.dispatchEvent(new CustomEvent("panzoomend", { detail: {} }));
});
const memCenter = await page3.evaluate(() => window.__centerInSVG());
await page3.keyboard.press("Escape");
await page3.waitForTimeout(500);
await page3.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page3.waitForTimeout(900);
const memRestored = await page3.evaluate(() => window.__centerInSVG());
check("rememberZoom restores position on reopen",
  Math.abs(memRestored.x - memCenter.x) < 5 && Math.abs(memRestored.y - memCenter.y) < 5 && Math.abs(memRestored.scale - 2.5) < 0.01,
  `saved (${memCenter.x.toFixed(1)}, ${memCenter.y.toFixed(1)}) @2.5x, restored (${memRestored.x.toFixed(1)}, ${memRestored.y.toFixed(1)}) @${memRestored.scale}x`);

// ============ MOBILE (touch) ============
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
});
await mob.goto(pageUrl);
await mob.waitForTimeout(300);
await mob.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await mob.waitForTimeout(700);
const mobOpen = await mob.evaluate(() => DiagView.default.state.isModalOpen);
check("mobile: modal opens", mobOpen);

await mob.evaluate(() => DiagView.default.state.activePanzoom.zoom(2.5, { animate: false }));
await mob.waitForTimeout(200);
const m0 = await mob.evaluate(() => window.__centerInSVG());
// single-finger touch drag via CDP
const cdp = await mob.context().newCDPSession(mob);
const touch = async (type, x, y) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
await touch("touchStart", 195, 420);
for (let i = 1; i <= 6; i++) await touch("touchMove", 195 + i * 10, 420 + i * 8);
await touch("touchEnd", 255, 468);
await mob.waitForTimeout(400);
const m1 = await mob.evaluate(() => window.__centerInSVG());
const mobMoved = Math.abs(m1.x - m0.x) > 5 && Math.abs(m1.y - m0.y) > 3;
const mobUnitsPerPx = await mob.evaluate(() => {
  const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
  return 1 / svg.getScreenCTM().a;
});
const mExpDX = -60 * mobUnitsPerPx, mExpDY = -48 * mobUnitsPerPx;
check("mobile: touch drag pans the diagram 1:1", mobMoved && Math.abs(m1.x - m0.x - mExpDX) < 4 && Math.abs(m1.y - m0.y - mExpDY) < 4,
  `moved (${(m1.x - m0.x).toFixed(1)}, ${(m1.y - m0.y).toFixed(1)}) svg-units, expected (${mExpDX.toFixed(1)}, ${mExpDY.toFixed(1)})`);

// mobile share restore
const mq = new URL(link).searchParams;
const mob2 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mob2.goto(pageUrl + "?" + mq.toString());
await mob2.waitForTimeout(1800);
const mobRestored = await mob2.evaluate(() => window.__centerInSVG());
check("mobile: share restore centers on shared point",
  mobRestored && Math.abs(mobRestored.x - Number(mq.get("dv-cx"))) < 2 && Math.abs(mobRestored.y - Number(mq.get("dv-cy"))) < 2,
  `encoded (${mq.get("dv-cx")}, ${mq.get("dv-cy")}) restored (${mobRestored?.x.toFixed(1)}, ${mobRestored?.y.toFixed(1)})`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
