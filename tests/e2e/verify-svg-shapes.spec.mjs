// An SVG drawn only with an <ellipse>, an <image>, a <use> of a page sprite
// or a <foreignObject> is a diagram like any other. It gets its card and
// toolbar, opens in the viewer and exports as SVG and PNG. An empty SVG, a
// zero-sized viewBox and an error message with no shapes, as <text> or as
// HTML, still show the error box.
//
// Runs offline on a file:// fixture. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** Diagram element id and the element it is drawn with */
const DRAWN = [
  ["ellipse", "ellipse"],
  ["image", "image"],
  ["use", "use"],
  ["fo", "foreignObject"],
  ["bare", "ellipse"],
];
const ERRORS = ["empty", "zero", "fragment", "html-fragment"];

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  await page.goto(fixtureFile("svg-shapes.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram", animateOpen: false }));
  for (const id of [...DRAWN.map(([id]) => id), ...ERRORS]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

/** What DiagView shows for a diagram element */
const look = (id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    const svg = el.localName === "svg" ? el : el.querySelector("svg");
    return {
      error: el.dataset.diagviewError === "1",
      errorBox: !!(
        el.querySelector(".diagview-error") || el.nextElementSibling?.matches(".diagview-error")
      ),
      toolbar: !!el.closest(".diagview-wrapper")?.querySelector('[data-action="fullscreen"]'),
      svgShown: getComputedStyle(svg).display !== "none",
    };
  }, id);

test("an svg drawn with one kind of element gets a card and a toolbar", async () => {
  for (const [id] of DRAWN) {
    expect(await look(id), id).toEqual({
      error: false,
      errorBox: false,
      toolbar: true,
      svgShown: true,
    });
  }
});

test("it opens in the viewer with its drawing", async () => {
  for (const [id, tag] of DRAWN) {
    await page.evaluate((id) => DiagView.openFullscreen(document.getElementById(id)), id);
    await page.waitForFunction(
      () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
    );
    const drawn = await page.evaluate(
      (tag) => document.querySelectorAll(`#diagview-modal .diagview-rotator > svg ${tag}`).length,
      tag,
    );
    expect(drawn, id).toBe(1);
    await page.evaluate(() => DiagView.closeModal());
    await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  }
});

test("it exports as SVG with its drawing and as PNG", async () => {
  for (const [id, tag] of DRAWN) {
    const svgFile = page.waitForEvent("download", { timeout: 30000 });
    const svgDone = await page.evaluate(
      (id) => DiagView.exportDiagram(document.getElementById(id), "svg", { silent: true }),
      id,
    );
    const saved = fs.readFileSync(await (await svgFile).path(), "utf8");
    expect(svgDone, id).toBe(true);
    expect(saved, id).toContain(`<${tag} `);

    const pngFile = page.waitForEvent("download", { timeout: 30000 });
    const pngDone = await page.evaluate(
      (id) => DiagView.exportDiagram(document.getElementById(id), "png", { silent: true }),
      id,
    );
    expect(pngDone, id).toBe(true);
    expect((await pngFile).suggestedFilename(), id).toMatch(/\.png$/);
  }
});

test("an empty svg, a zero-sized viewBox and an error message still get the error box", async () => {
  for (const id of ERRORS) {
    expect(await look(id), id).toEqual({
      error: true,
      errorBox: true,
      toolbar: false,
      svgShown: false,
    });
  }
});
