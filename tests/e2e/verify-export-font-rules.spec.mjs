// Fonts embedded in SVG exports from where pages and CSS tools put their
// @font-face rules: @layer, @media and @supports blocks and @import sheets.
//
// The font files load over HTTP from the test site, since a file:// page
// can't fetch them. DV_DIST=/path/to/diagview.umd.js tests another build.
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { DIST, SITE, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  await page.goto(`${SITE}/tests/e2e/fixtures/export-fonts-nested.html`);
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-diagview-no-auto-init", ""),
  );
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    DiagView.init({ animateOpen: false, rememberZoom: false });
  });
  await page.evaluate(() => document.fonts.ready);
});

test.afterAll(async () => {
  await page.context().close();
});

const labelWidths = () =>
  [...document.querySelectorAll("svg text")].map((t) => t.getComputedTextLength());

async function exportSvg(id) {
  const download = page.waitForEvent("download", { timeout: 15000 });
  await page.evaluate((id) => DiagView.default.exportToSVG(document.getElementById(id)), id);
  return readFile(await (await download).path(), "utf8");
}

/** Open the exported SVG on its own and read its font families and label widths */
async function renderExport(markup) {
  // Draw the export at the page's scale, as the headless shell rounds glyph
  // advances to device pixels
  const scale = await page.evaluate(() => document.querySelector("svg").getScreenCTM().a);
  const view = await page.context().newPage();
  await view.setContent(`<!doctype html><body style="margin:0">${markup}</body>`);
  await view.evaluate((k) => {
    const svg = document.querySelector("svg");
    const box = svg.viewBox.baseVal;
    svg.style.width = `${box.width * k}px`;
    svg.style.height = `${box.height * k}px`;
  }, scale);
  await view.evaluate(() => document.fonts.ready);
  const families = await view.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => [...s.cssRules])
      .filter((r) => r instanceof CSSFontFaceRule)
      .map((r) => r.style.getPropertyValue("font-family").replace(/"/g, "")),
  );
  const widths = await view.evaluate(labelWidths);
  await view.close();
  return { families, widths };
}

test("embeds fonts from @layer, @media, @supports and @import, not from @media print", async () => {
  const pageWidths = await page.evaluate(labelWidths);
  // The page font and the serif fallback of the print label differ in width
  expect(Math.abs(pageWidths[0] - pageWidths[5])).toBeGreaterThan(2);

  const { families, widths } = await renderExport(await exportSvg("nested"));
  expect(families).toEqual(["DV Import", "DV Top", "DV Layer", "DV Media", "DV Supports"]);
  expect(widths).toHaveLength(pageWidths.length);
  widths.forEach((w, i) => expect(Math.abs(w - pageWidths[i]), `label ${i}`).toBeLessThan(0.5));
});
