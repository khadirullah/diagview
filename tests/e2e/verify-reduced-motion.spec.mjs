// With the system set to reduce motion, DiagView quiets its own buttons,
// menu and viewer, and leaves the diagram's own animations alone. An
// animated Mermaid edge keeps its slow crawl in a card and in the viewer,
// as it does with layout "off", instead of jumping between dash offsets
// from frame to frame.
//
// Runs offline on a file:// fixture. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { reducedMotion: "reduce" });
  await page.goto(fixtureFile("reduced-motion.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram" }));
  await page.waitForSelector("#card[data-diagview-init]");
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

/** The edge moves a little on every frame and never jumps */
function expectCrawl({ duration, values }) {
  const report = JSON.stringify({ duration, values });
  expect(duration, report).toBe("20s");
  expect(values[0], report).not.toBe(values[values.length - 1]);
  const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  expect(Math.max(...steps), report).toBeLessThan(3);
}

test("an animated edge in a card crawls as it does with layout off", async () => {
  expectCrawl(await page.evaluate(() => window.__dashes("#off path")));
  expectCrawl(await page.evaluate(() => window.__dashes(".diagview-wrapper #card path")));
});

test("the viewer's copy of the edge crawls too, and the viewer itself does not animate", async () => {
  await page.evaluate(() => DiagView.openFullscreen(document.getElementById("card")));
  await page.waitForFunction(() => DiagView.state.isModalOpen && !DiagView.state.isModalOpening);
  expectCrawl(await page.evaluate(() => window.__dashes("#diagview-modal-viewport path")));

  const durations = await page.evaluate(() =>
    [
      ".diagview-modal",
      ".diagview-modal-content",
      ".diagview-menu",
      ".diagview-close-btn",
      "#diagview-modal-viewport svg",
      ".diagview-wrapper .diagview-btn",
    ].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [selector, style.animationDuration, style.transitionDuration.split(",")[0]];
    }),
  );
  for (const [selector, animation, transition] of durations) {
    expect(parseFloat(animation), selector).toBeLessThan(0.001);
    expect(parseFloat(transition), selector).toBeLessThan(0.001);
  }
});
