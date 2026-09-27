// An onerror handler on a diagram image runs once when the page loads. The
// fullscreen copy and the export copy must not run it again in strict and
// permissive mode, which remove the handler before the copy loads anything.
// In "off" mode the copy keeps the handler, so it may run again. Strict and
// permissive also log one warning naming the removed handler.
//
// Runs offline: the page is file:// and the image is missing on purpose.
// DV_DIST=/path/to/diagview.umd.js tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

async function load(browser, mode) {
  const page = await newPage(browser, { acceptDownloads: true });
  page.warnings = [];
  page.on("console", (m) => m.type() === "warning" && page.warnings.push(m.text()));
  await page.goto(fixtureFile("image-handler.html"));
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.addScriptTag({ path: DIST });
  await page.evaluate((mode) => {
    DiagView.default.configure({ animateOpen: false, security: { mode } });
    DiagView.default.init();
  }, mode);
  await page.waitForTimeout(300);
  return page;
}

const runs = (page) => page.evaluate(() => window.runs);

/** Open fullscreen, close it, then export a PNG, counting runs after each step */
async function openAndExport(page) {
  const counts = { load: await runs(page) };
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(500);
  counts.open = await runs(page);
  await page.evaluate(() => DiagView.default.closeModal());
  await page.waitForTimeout(400);
  await page.evaluate(() =>
    DiagView.default.exportDiagram(document.getElementById("diag"), "png", { silent: true }),
  );
  await page.waitForTimeout(500);
  counts.export = await runs(page);
  return counts;
}

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

for (const mode of ["strict", "permissive"]) {
  test(`${mode}: fullscreen and export do not run the image handler again`, async ({ browser }) => {
    const page = await load(browser, mode);
    const counts = await openAndExport(page);
    expect(counts.load).toBe(1);
    expect(counts).toEqual({ load: 1, open: 1, export: 1 });
    // The browser adds the diagram element, passed as a second argument, to the text
    const removed = page.warnings.filter((w) => w.includes("Removed code"));
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain(
      `DiagView: Removed code from this diagram in ${mode} mode: 1 event handler (onerror). Use security.mode "off" only for diagrams you trust.`,
    );
  });
}

test("off: the fullscreen copy keeps the handler", async ({ browser }) => {
  const page = await load(browser, "off");
  const counts = await openAndExport(page);
  expect(counts.load).toBe(1);
  expect(counts.open).toBeGreaterThan(1);
  expect(page.warnings.filter((w) => w.includes("Removed code"))).toEqual([]);
});
