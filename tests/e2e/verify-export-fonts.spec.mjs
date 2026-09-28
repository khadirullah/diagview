// Fonts embedded in SVG exports: only the @font-face rules the diagram's
// text uses, and the exported labels keep the width they have on the page.
//
// Runs offline: the page is file:// and its fonts are data: URLs.
// DV_DIST=/path/to/diagview.umd.js tests another build.
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  await page.goto(fixtureFile("export-fonts.html"));
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

/** Width of each label, SVG text in user units and HTML in CSS pixels */
const labelWidths = () => {
  const svg = document.querySelector("svg");
  return [
    ...[...svg.querySelectorAll("text")].map((t) => t.getComputedTextLength()),
    ...[...svg.querySelectorAll("foreignObject span")].map((s) => s.offsetWidth),
  ];
};

/** Labels within half a pixel of their width on the page, so none is cut off */
function expectSameWidths(widths, pageWidths) {
  expect(widths).toHaveLength(pageWidths.length);
  widths.forEach((w, i) => expect(Math.abs(w - pageWidths[i]), `label ${i}`).toBeLessThan(0.5));
}

async function exportSvg() {
  const download = page.waitForEvent("download", { timeout: 15000 });
  await page.evaluate(() => DiagView.default.exportToSVG(document.getElementById("fonts")));
  return readFile(await (await download).path(), "utf8");
}

/** Open the exported SVG on its own and read its fonts and label widths */
async function renderExport(markup) {
  const view = await page.context().newPage();
  await view.setContent(`<!doctype html><body style="margin:0">${markup}</body>`);
  await view.evaluate(() => document.fonts.ready);
  const faces = await view.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => [...s.cssRules])
      .filter((r) => r instanceof CSSFontFaceRule)
      .map((r) => {
        const d = (p) => r.style.getPropertyValue(p);
        const range = d("unicode-range") ? ` ${d("unicode-range")}` : "";
        return `${d("font-family").replace(/"/g, "")} ${d("font-weight")} ${d("font-style") || "normal"}${range}`;
      }),
  );
  const widths = await view.evaluate(labelWidths);
  await view.close();
  return { faces, widths };
}

test("a default export embeds only the faces the labels use", async () => {
  const pageWidths = await page.evaluate(labelWidths);
  const { faces, widths } = await renderExport(await exportSvg());
  // 600 falls back to the 700 face. Cyrillic, light, italic and the unused
  // family stay out.
  expect(faces.map((f) => f.replace(/ U\+.*/, ""))).toEqual([
    "DV Sans 400 normal",
    "DV Sans 700 normal",
    "DV Mono 400 normal",
  ]);
  expectSameWidths(widths, pageWidths);
});

test('exportFonts "all" embeds every face on the page', async () => {
  const pageWidths = await page.evaluate(labelWidths);
  await page.evaluate(() => DiagView.default.configure({ exportFonts: "all" }));
  const { faces, widths } = await renderExport(await exportSvg());
  expect(faces.map((f) => f.replace(/ U\+.*/, ""))).toEqual([
    "DV Sans 400 normal",
    "DV Sans 400 normal",
    "DV Sans 700 normal",
    "DV Sans 300 normal",
    "DV Sans 400 italic",
    "DV Mono 400 normal",
    "DV Unused 100 900 normal",
  ]);
  expectSameWidths(widths, pageWidths);
});

test('exportFonts "none" embeds no fonts, so the labels fall back', async () => {
  const pageWidths = await page.evaluate(labelWidths);
  await page.evaluate(() => DiagView.default.configure({ exportFonts: "none" }));
  const markup = await exportSvg();
  expect(markup).not.toContain("dv-font-embed");
  const { faces, widths } = await renderExport(markup);
  expect(faces).toEqual([]);
  // The fallback serif font has other widths, which is what the embedded
  // fonts prevent
  expect(widths.some((w, i) => Math.abs(w - pageWidths[i]) > 2)).toBe(true);
  await page.evaluate(() => DiagView.default.configure({ exportFonts: "used" }));
});
