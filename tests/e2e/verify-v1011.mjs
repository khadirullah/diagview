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

// track onClose calls
await page.evaluate(() => {
  window.__closes = 0;
  DiagView.default.configure({ onClose: () => window.__closes++ });
});

await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page.waitForTimeout(700);

const svgWC = () => page.evaluate(() => {
  const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
  return getComputedStyle(svg).willChange;
});

// --- Sharpness: will-change lifecycle ---
check("at rest: will-change is auto (sharp)", (await svgWC()) === "auto", `got "${await svgWC()}"`);

await page.mouse.move(640, 400);
await page.mouse.down();
await page.mouse.move(700, 440, { steps: 4 });
const during = await svgWC();
await page.mouse.up();
check("during drag: will-change is transform (smooth)", during === "transform", `got "${during}"`);

await page.waitForTimeout(700); // > 400ms cooldown
check("after gesture: will-change back to auto (re-raster, sharp)", (await svgWC()) === "auto", `got "${await svgWC()}"`);

// wheel also arms it
await page.mouse.wheel(0, -120);
await page.waitForTimeout(100);
check("wheel zoom arms will-change", (await svgWC()) === "transform");
await page.waitForTimeout(700);
check("wheel cooldown releases it", (await svgWC()) === "auto");

// --- Two-stage Escape in search ---
await page.evaluate(() => document.getElementById("dv-search-icon-btn")?.click());
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById("diagview-search").focus());
await page.keyboard.type("deploy");
await page.waitForTimeout(400);
await page.keyboard.press("Escape"); // stage 1: clear query
await page.waitForTimeout(200);
const st1 = await page.evaluate(() => ({
  open: DiagView.default.state.isModalOpen,
  q: document.getElementById("diagview-search").value,
}));
check("Escape with query: clears search, modal stays open", st1.open && st1.q === "", JSON.stringify(st1));

await page.keyboard.press("Escape"); // stage 2: exit search mode
await page.waitForTimeout(200);
const st2 = await page.evaluate(() => ({
  open: DiagView.default.state.isModalOpen,
  searchOpen: document.querySelector(".diagview-topbar")?.classList.contains("search-open"),
  focused: document.activeElement === document.getElementById("diagview-search"),
}));
check("Escape with empty query: exits search, modal stays open", st2.open && !st2.focused, JSON.stringify(st2));

await page.keyboard.press("Escape"); // stage 3: close modal
await page.waitForTimeout(700);
check("Escape after search closed: closes modal", !(await page.evaluate(() => DiagView.default.state.isModalOpen)));

// --- closeModal re-entrancy: rapid double Escape fires onClose once ---
await page.evaluate(() => { window.__closes = 0; });
await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page.waitForTimeout(700);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
const closes = await page.evaluate(() => window.__closes);
check("triple-Escape close: onClose fired exactly once", closes === 1, `onClose calls: ${closes}`);

// --- Reopen still works after guarded close ---
await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
await page.waitForTimeout(700);
check("modal reopens cleanly after guarded close", await page.evaluate(() => DiagView.default.state.isModalOpen));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} v1.0.11 checks passed`);
process.exit(failed ? 1 : 0);
