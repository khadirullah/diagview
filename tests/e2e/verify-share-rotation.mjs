/**
 * Verifies that a share link captured on a ROTATED + zoomed diagram restores
 * the rotation on the recipient's page (diagram AND minimap), along with the
 * zoom and centered position. Run after `npm run build`.
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

// ---- Sharer: rotate 90°, zoom in, pan off-center, share ----
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pageUrl);
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

// Viewport center in the SVG's (rotated) user space — the same space dv-cx/cy
// are captured in (share.js uses the SVG root's CTM).
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

const sharerCenter = await rootCenter(page);
await page.evaluate(() => document.getElementById("dv-share").click());
await page.waitForTimeout(500);
const link = await page.evaluate(() => window.__copied);
const q = new URL(link).searchParams;
check("share link includes dv-r=90", q.get("dv-r") === "90", `params: ${q.toString()}`);

// ---- Recipient ----
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page2.goto(pageUrl + "?" + q.toString());
await page2.waitForTimeout(2200);

const st = await page2.evaluate(() => {
  const svg = document.getElementById("diagview-modal-viewport")?.querySelector("svg");
  const rotG = svg?.querySelector(":scope > g.dv-rot-g");
  return {
    angle: DiagView.default.state.rotationAngle,
    rotTransform: rotG?.getAttribute("transform") || null,
    scale: DiagView.default.state.activePanzoom?.getScale(),
    mmTransform: DiagView.default.state.minimapSvg?.style.transform || "(no minimap)",
  };
});
check("recipient: diagram DOM is rotated 90°", st.rotTransform?.startsWith("rotate(90"), `rot-g transform: ${st.rotTransform}`);
check("recipient: state angle is 90", st.angle === 90);
check("recipient: zoom restored", Math.abs(st.scale - Number(q.get("dv-z"))) < 0.01, `scale ${st.scale}`);
check(
  "recipient: minimap rotation matches diagram",
  st.mmTransform === "rotate(90deg)" || st.mmTransform === "(no minimap)",
  `minimap transform: ${st.mmTransform}`,
);

const restored = await rootCenter(page2);
const dx = Math.abs(restored.x - Number(q.get("dv-cx")));
const dy = Math.abs(restored.y - Number(q.get("dv-cy")));
check(
  "recipient: view centered on shared point",
  dx < 2 && dy < 2,
  `encoded (${q.get("dv-cx")}, ${q.get("dv-cy")}) restored (${restored.x.toFixed(1)}, ${restored.y.toFixed(1)}); sharer was (${sharerCenter.x.toFixed(1)}, ${sharerCenter.y.toFixed(1)})`,
);

// ---- Unrotated share must still be exact (regression) ----
const page3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page3.goto(pageUrl);
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
const link2 = await page3.evaluate(() => window.__copied);
const q2 = new URL(link2).searchParams;
const page4 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page4.goto(pageUrl + "?" + q2.toString());
await page4.waitForTimeout(2000);
const r2 = await rootCenter(page4);
check(
  "unrotated share still exact",
  Math.abs(r2.x - Number(q2.get("dv-cx"))) < 2 && Math.abs(r2.y - Number(q2.get("dv-cy"))) < 2,
  `encoded (${q2.get("dv-cx")}, ${q2.get("dv-cy")}) restored (${r2.x.toFixed(1)}, ${r2.y.toFixed(1)})`,
);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} share-rotation checks passed`);
process.exit(failed ? 1 : 0);
