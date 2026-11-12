// The files people load straight into a page, in a short pass each:
// dist/diagview.umd.min.js, which a <script> tag from unpkg or jsDelivr
// gets, and dist/esm/index.js through <script type="module">, which loads
// the lazy chunks next to it. The other suites run dist/diagview.umd.js.
//
// Each pass sets up two diagrams, opens the viewer, zooms, pans, rotates,
// searches, exports an SVG and a PNG, follows the page theme, closes and
// calls destroy(). The console stays free of errors and warnings, and the
// stylesheet the bundle injects holds the same rules as dist/diagview.css.
//
// Runs offline on the test server. DV_DIST does not change what this suite
// loads.
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { SITE, ROOT, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/bundles.html`;
const PNG_SIGNATURE = "89504e470d0a1a0a";

/** Ways to put DiagView and Panzoom on the page, as a user of each build does */
const BUILDS = {
  "minified UMD": async (page) => {
    await page.addScriptTag({ url: `${SITE}/node_modules/@panzoom/panzoom/dist/panzoom.min.js` });
    await page.addScriptTag({ url: `${SITE}/dist/diagview.umd.min.js` });
  },
  ESM: async (page) => {
    await page.addScriptTag({
      type: "module",
      content: `
        import Panzoom from "/node_modules/@panzoom/panzoom/dist/panzoom.es.js";
        import DiagView from "/dist/esm/index.js";
        window.Panzoom = Panzoom;
        window.DiagView = DiagView;
      `,
    });
    await page.waitForFunction(() => window.DiagView && window.Panzoom);
  },
};

for (const [build, load] of Object.entries(BUILDS)) {
  test.describe(build, () => {
    // Steps in order on one page. A failure in one build leaves the other
    // to run.
    test.describe.configure({ mode: "serial" });

    /** @type {import("@playwright/test").Page} */
    let page;
    const problems = [];
    let pageBefore;

    test.beforeAll(async ({ browser }) => {
      page = await newPage(browser, { acceptDownloads: true });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          problems.push(`${m.type()}: ${m.text()}`);
      });
      await page.goto(PAGE);
      await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
      pageBefore = await page.evaluate(() => document.body.innerHTML);
      await load(page);
    });

    test.afterAll(async () => {
      await page.context().close();
    });

    test("sets up both diagrams with its own stylesheet", async () => {
      await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram" }));
      await expect(page.locator(".diagram[data-diagview-init]")).toHaveCount(2);
      await expect(page.locator('.diagview-wrapper [data-action="fullscreen"]')).toHaveCount(2);

      // A minifier slip in the inlined CSS would drop or change rules
      const source = await fs.readFile(path.join(ROOT, "dist", "diagview.css"), "utf8");
      const sheets = await page.evaluate((source) => {
        // A value that holds a var() keeps its line breaks, which the
        // bundle folds into spaces
        const rules = (sheet) =>
          [...sheet.cssRules].map((rule) => rule.cssText.replace(/\s+/g, " "));
        const reference = new CSSStyleSheet();
        reference.replaceSync(source);
        return {
          injected: rules(document.getElementById("diagview-styles").sheet),
          reference: rules(reference),
        };
      }, source);
      expect(sheets.injected.length).toBeGreaterThan(100);
      expect(sheets.injected).toEqual(sheets.reference);
    });

    test("opens the viewer, zooms, pans, rotates and shows the minimap", async () => {
      const wrapper = page.locator(".diagview-wrapper:has(#orders)");
      await wrapper.hover();
      await wrapper.locator('[data-action="fullscreen"]').click();
      await page.waitForFunction(
        () => DiagView.state.isModalOpen && !DiagView.state.isModalOpening,
      );
      // Only DiagView's stylesheet puts the viewer this high
      await expect(page.locator("#diagview-modal")).toHaveCSS("z-index", "2147483647");

      const scale = () => page.evaluate(() => DiagView.state.activePanzoom.getScale());
      const fitted = await scale();
      for (let i = 0; i < 3; i++) await page.keyboard.press("+");
      await expect.poll(scale).toBeGreaterThan(fitted * 2);
      await expect(page.locator("#diagview-minimap.show")).toBeVisible();

      const pan = () => page.evaluate(() => DiagView.state.activePanzoom.getPan());
      const before = await pan();
      const box = await page.locator("#diagview-modal-viewport").boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 120, y - 80, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => (await pan()).x).not.toBe(before.x);

      await page.keyboard.press("r");
      await expect.poll(() => page.evaluate(() => DiagView.state.rotationAngle)).toBe(90);
    });

    test("search finds a label", async () => {
      await page.locator("#diagview-search").fill("Invoice");
      await expect(page.locator("#diagview-search-status")).toHaveText("1 match found");
      // The label and the box behind it
      await expect(page.locator("#diagview-modal-viewport text.dv-search-match")).toHaveText([
        "Invoice",
      ]);
      await expect(page.locator("#diagview-modal-viewport rect.dv-search-match")).toHaveCount(1);
      await page.locator("#diagview-search").fill("");
      await expect(page.locator("#diagview-modal-viewport .dv-search-match")).toHaveCount(0);
    });

    test("exports a real SVG and PNG from the menu", async () => {
      const save = async (action) => {
        if (!(await page.locator(".diagview-menu.active").count())) {
          await page.locator("#dv-toggle").click();
        }
        const download = page.waitForEvent("download");
        await page.locator(`.diagview-menu.active .dv-exp [data-action="${action}"]`).click();
        const file = await download;
        return { name: file.suggestedFilename(), bytes: await fs.readFile(await file.path()) };
      };

      const svg = await save("svg");
      expect(svg.name).toMatch(/^orders.*\.svg$/);
      const markup = svg.bytes.toString("utf8");
      expect(markup).toMatch(/^(<\?xml[^>]*>\s*)?<svg[\s>]/);
      expect(markup).toContain("Invoice");
      expect(markup.trimEnd()).toMatch(/<\/svg>$/);

      const png = await save("png");
      expect(png.name).toMatch(/^orders.*\.png$/);
      expect(png.bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
      // Width and height from the IHDR chunk
      expect(png.bytes.readUInt32BE(16)).toBeGreaterThan(100);
      expect(png.bytes.readUInt32BE(20)).toBeGreaterThan(30);
    });

    test("follows the page theme, closes, and destroy() puts the page back", async () => {
      const modal = page.locator("#diagview-modal");
      await expect(modal).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await expect(modal).toHaveCSS("background-color", "rgb(15, 23, 42)");
      await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

      if (await page.locator(".diagview-menu.active").count()) await page.keyboard.press("Escape");
      await expect(page.locator(".diagview-menu.active")).toHaveCount(0);
      await page.locator("#diagview-close").click();
      await page.waitForFunction(() => !DiagView.state.isModalOpen);

      await page.evaluate(() => DiagView.destroy());
      await expect(page.locator("#diagview-styles")).toHaveCount(0);
      expect(await page.evaluate(() => document.body.innerHTML)).toBe(pageBefore);
      expect(problems).toEqual([]);
    });

    if (build === "ESM") {
      test("every file of the ESM build links in the browser", async () => {
        const files = (await fs.readdir(path.join(ROOT, "dist", "esm"))).filter((f) =>
          f.endsWith(".js"),
        );
        expect(files.length).toBeGreaterThan(2);
        const failed = await page.evaluate(async (files) => {
          const results = await Promise.allSettled(files.map((f) => import(`/dist/esm/${f}`)));
          return results.flatMap((r, i) =>
            r.status === "rejected" ? [`${files[i]}: ${r.reason}`] : [],
          );
        }, files);
        expect(failed).toEqual([]);
      });
    }
  });
}
