/**
 * React 18 StrictMode integration check.
 *
 * Drives demo/framework-react.html (a real React dev-build tree with StrictMode
 * on) in headless Chrome and verifies:
 *   - StrictMode's destroy→init double effect leaves DiagView initialized
 *   - no uncaught DOM errors on mount / unmount / remount / replace
 *   - fullscreen opens from the floating toolbar and from a layout:"off" diagram
 *   - the documented anti-pattern (diagram element as component root) really
 *     does throw NotFoundError on unmount, proving the rule is load-bearing
 *
 * By default the demo's unpkg request for diagview is intercepted and served
 * from ../../dist/diagview.umd.js so the LOCAL build is what gets tested.
 * Pass --cdn to skip the interception and test the published version instead
 * (useful to show the StrictMode failure on releases before the init() fix).
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.join(here, "..", "..", "demo", "framework-react.html");
const localDist = path.join(here, "..", "..", "dist", "diagview.umd.js");
const useCdn = process.argv.includes("--cdn");

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

if (!useCdn && !fs.existsSync(localDist)) {
  console.error("dist/diagview.umd.js not found — run `npm run build` first (or pass --cdn)");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

if (!useCdn) {
  await page.route(/unpkg\.com\/diagview@[^/]+\/dist\/diagview\.umd\.js/, (route) =>
    route.fulfill({ path: localDist, contentType: "application/javascript" }),
  );
}

await page.goto(pageUrl);
await page.waitForTimeout(1200); // React mount + StrictMode double effect + observer debounce
// Diagrams initialise lazily (IntersectionObserver, 200px margin), so bring the
// viewer card into view like a reader would before checking for its wrapper.
await page.evaluate(() => document.getElementById("viewer-card")?.scrollIntoView());
await page.waitForTimeout(600);

const snapshot = () =>
  page.evaluate(() => {
    const dv = window.DiagView;
    const st = (dv.default && dv.default.state) || dv.state || {};
    return {
      version: dv.version,
      initCalls: window.__dv.initCalls,
      destroyCalls: window.__dv.destroyCalls,
      errors: window.__dv.errors.slice(),
      caught: window.__dv.caught.slice(),
      initialized: !!st.isInitialized,
      modalOpen: !!st.isModalOpen,
      wrappers: document.querySelectorAll(".diagview-wrapper").length,
      hosts: document.querySelectorAll(".diagram-host").length,
      boundaries: document.querySelectorAll(".rx-boundary").length,
      diagrams: document.querySelectorAll(".diagram").length,
      floatingTitle:
        document.querySelector("#viewer-card .diagram-host .diagram > svg")?.getAttribute("aria-label") || null,
      headerTitle:
        document.querySelector("#header-card .diagram-host .diagram > svg")?.getAttribute("aria-label") || null,
      toolbarButtons: document.querySelectorAll(".diagview-wrapper button").length,
    };
  });

let s = await snapshot();
console.log(`diagview ${s.version} (${useCdn ? "published CDN build" : "local dist build"})`);

// 1. StrictMode really double-ran the effect
check(
  "StrictMode ran the effect twice (init, destroy, init)",
  s.initCalls === 2 && s.destroyCalls === 1,
  `init=${s.initCalls} destroy=${s.destroyCalls}`,
);

// 2. The library survived it
check(
  "DiagView is initialized after the StrictMode cycle",
  s.initialized,
  `isInitialized=${s.initialized}`,
);
check(
  "floating + header diagrams got their wrappers",
  s.wrappers === 2 && s.toolbarButtons > 0,
  `wrappers=${s.wrappers} buttons=${s.toolbarButtons}`,
);
check(
  "no uncaught errors on mount",
  s.errors.length === 0 && pageErrors.length === 0,
  [...s.errors, ...pageErrors].join(" | ").slice(0, 200),
);

// 3. Fullscreen from the floating toolbar
const clickedFs = await page.evaluate(() => {
  const btns = [...document.querySelectorAll(".diagview-wrapper button")];
  const fs = btns.find((b) => /full/i.test(b.title + " " + (b.getAttribute("aria-label") || "")));
  if (!fs) return false;
  fs.click();
  return true;
});
await page.waitForTimeout(700);
s = await snapshot();
check(
  "toolbar fullscreen button opens the modal",
  clickedFs && s.modalOpen,
  `clicked=${clickedFs} open=${s.modalOpen}`,
);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
s = await snapshot();
check("Escape closes the modal", !s.modalOpen);

// 4. Unmount the React component (safe pattern: React removes .diagram-host)
await page.click("#btn-toggle");
await page.waitForTimeout(500);
s = await snapshot();
check(
  "unmount removes host + wrapper without DOM errors",
  s.hosts === 0 && s.wrappers === 0 && s.errors.length === 0 && pageErrors.length === 0,
  `hosts=${s.hosts} wrappers=${s.wrappers} errors=${[...s.errors, ...pageErrors].join(" | ").slice(0, 200)}`,
);
// The demo ties init()/destroy() to the component (as the docs example does),
// so unmount must have run destroy() and left nothing behind.
check(
  "unmount ran destroy() and tore DiagView down cleanly",
  !s.initialized && s.destroyCalls === 2 && s.wrappers === 0,
  `initialized=${s.initialized} destroyCalls=${s.destroyCalls}`,
);

// 5. Remount: observer picks the new element up
await page.click("#btn-toggle");
await page.waitForTimeout(600);
s = await snapshot();
check(
  "remount re-inits DiagView and both diagrams (wrappers back)",
  s.initialized && s.hosts === 2 && s.wrappers === 2 && s.errors.length === 0,
  `initialized=${s.initialized} hosts=${s.hosts} wrappers=${s.wrappers}`,
);

// 6. Replace diagram via keyed host
const before = s.floatingTitle;
await page.click("#btn-replace");
await page.waitForTimeout(600);
s = await snapshot();
check(
  "replace swaps both diagrams (keyed hosts) without errors",
  s.floatingTitle &&
    s.floatingTitle !== before &&
    s.headerTitle === s.floatingTitle &&
    s.wrappers === 2 &&
    s.errors.length === 0 &&
    pageErrors.length === 0,
  `${before} → ${s.floatingTitle} (header: ${s.headerTitle})`,
);

// 6b. Detach (destroy) while everything stays mounted: diagrams remain, toolbars go
await page.click("#btn-detach");
await page.waitForTimeout(700);
s = await snapshot();
const detachedDiagrams = await page.evaluate(
  () => document.querySelectorAll("#viewer-card .diagram, #header-card .diagram").length,
);
check(
  "Detach runs destroy() only: diagrams stay in place, wrappers gone, no errors",
  !s.initialized && s.wrappers === 0 && s.hosts === 2 && detachedDiagrams === 2 && s.errors.length === 0,
  `initialized=${s.initialized} wrappers=${s.wrappers} hosts=${s.hosts} diagrams=${detachedDiagrams}`,
);
await page.click("#btn-detach"); // Attach again
await page.waitForTimeout(800);
s = await snapshot();
check(
  "Attach runs init() and re-enhances the same diagrams",
  s.initialized && s.wrappers === 2 && s.hosts === 2 && s.errors.length === 0,
  `initialized=${s.initialized} wrappers=${s.wrappers}`,
);

// 7. layout:"off" diagram as component root: click-to-open
await page.click("#stealth-diagram");
await page.waitForTimeout(700);
s = await snapshot();
check('layout:"off" diagram (component root) opens fullscreen on click', s.modalOpen);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

// 8. Prove the rule: unsafe pattern throws on unmount, in both re-parenting layouts
await page.check("#chk-unsafe");
await page.waitForTimeout(600); // remount with the unsafe key
const errorsBefore = pageErrors.length + (await snapshot()).errors.length;
await page.click("#btn-toggle"); // unmount → React removes .diagram from its old parent
await page.waitForTimeout(600);
s = await snapshot();
const allErrors = [...s.caught, ...pageErrors].join(" | ");
const threw = /NotFoundError|not a child of this node|removeChild/i.test(allErrors);
check(
  "anti-pattern (diagram as root) throws NotFoundError on unmount",
  threw && s.caught.length > 0,
  allErrors.slice(0, 160) || "no error captured",
);
check(
  "expected crash is NOT reported as an unexpected error at the top",
  s.errors.length === errorsBefore,
  `unexpected=${s.errors.length}`,
);

// 9. The crash stays inside the floating + header cards
const contained = await page.evaluate(() => ({
  boundaries: document.querySelectorAll(".rx-boundary").length,
  inFloating: !!document.querySelector("#viewer-card .rx-boundary"),
  inHeader: !!document.querySelector("#header-card .rx-boundary"),
  stealth: !!document.getElementById("stealth-diagram"),
  toolbar: !!document.getElementById("btn-toggle"),
  deadDiagramsInCards: document.querySelectorAll("#viewer-card .diagram, #header-card .diagram").length,
  topBoxShown: document.getElementById("rx-error").classList.contains("show"),
}));
check(
  "crash stays in the two re-parenting cards: off diagram + buttons survive, dead diagrams gone, no top box",
  contained.boundaries === 2 &&
    contained.inFloating &&
    contained.inHeader &&
    contained.stealth &&
    contained.toolbar &&
    contained.deadDiagramsInCards === 0 &&
    !contained.topBoxShown,
  JSON.stringify(contained),
);

// 10. Mount with the box still ticked: anti-pattern mounts again, DiagView re-inits,
//     and the off-layout diagram works again
await page.click("#btn-toggle");
await page.waitForTimeout(900);
s = await snapshot();
check(
  "Mount with the box still ticked re-arms the anti-pattern and re-inits DiagView",
  s.boundaries === 0 && s.initialized && s.wrappers === 2 && s.hosts === 0,
  `boundaries=${s.boundaries} initialized=${s.initialized} wrappers=${s.wrappers} hosts=${s.hosts}`,
);
await page.click("#stealth-diagram");
await page.waitForTimeout(700);
s = await snapshot();
check("off-layout diagram opens fullscreen again after that remount", s.modalOpen);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.click("#btn-toggle"); // unmount again → second crash, still contained
await page.waitForTimeout(600);
s = await snapshot();
check(
  "second unsafe unmount is contained the same way",
  s.boundaries === 2 && s.errors.length === errorsBefore,
  `boundaries=${s.boundaries} unexpected=${s.errors.length}`,
);
const errorsAfterCrash = pageErrors.length + s.errors.length;

// 11. Untick + Mount restores the safe pattern
await page.uncheck("#chk-unsafe");
await page.waitForTimeout(300);
const boundaryCleared = (await snapshot()).boundaries === 0;
await page.click("#btn-toggle"); // Mount viewers
await page.waitForTimeout(800);
s = await snapshot();
const unsafeChecked = await page.isChecked("#chk-unsafe");
check(
  "untick + Mount restores the safe viewers without new errors",
  boundaryCleared &&
    !unsafeChecked &&
    s.initialized &&
    s.hosts === 2 &&
    s.wrappers === 2 &&
    pageErrors.length + s.errors.length === errorsAfterCrash,
  `boundaryCleared=${boundaryCleared} unsafe=${unsafeChecked} initialized=${s.initialized} hosts=${s.hosts} wrappers=${s.wrappers} newErrors=${pageErrors.length + s.errors.length - errorsAfterCrash}`,
);
await page.click("#stealth-diagram");
await page.waitForTimeout(700);
s = await snapshot();
check("off-layout diagram still opens fullscreen after the recovery", s.modalOpen);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
