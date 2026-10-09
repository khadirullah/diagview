// The header title comes from the same places as the export file name:
// data-title, then the SVG's own <title> (Mermaid accTitle), then a title
// drawn on the diagram (Mermaid "title"). Only with none of them does it
// read "DIAGRAM". Checked on real Mermaid 11 and 12 output, Graphviz shape
// tooltips, a node label and a picture in an HTML label, a figure caption,
// markup in a title and a title too long for two lines.
//
// Mermaid comes from jsdelivr, so this suite needs network access. The page
// is file://, and DV_DIST=/path/to/diagview.umd.js tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const MERMAID = ["m-title", "m-acc", "m-plain", "m-pie", "m-data"];
const OTHERS = ["gv", "gv-shapes", "fig", "markup", "long", "deep"];

/** Open the fixture, render it with this Mermaid and set DiagView up */
async function load(browser, version) {
  const page = await newPage(browser);
  await page.goto(fixtureFile("header-title.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({
    url: `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.min.js`,
  });
  await page.evaluate(async () => {
    mermaid.initialize({ startOnLoad: false });
    await mermaid.run({ querySelector: ".mermaid" });
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    window.__names = [];
    DiagView.init({
      diagramSelector: ".diagram, .mermaid",
      layout: "header",
      animateOpen: false,
      onExport: (format, name) => window.__names.push(name),
    });
  });
  for (const id of [...MERMAID, ...OTHERS]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
  return page;
}

/** Header text of each diagram, as the page shows it */
const labels = (page, ids) =>
  page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          document.getElementById(id).closest(".diagview-wrapper").querySelector(".diagview-label")
            .textContent,
        ]),
      ),
    ids,
  );

/** Export file name of each diagram, without the timestamp */
const fileNames = (page, ids) =>
  page.evaluate(async (ids) => {
    const out = {};
    for (const id of ids) {
      window.__names.length = 0;
      await DiagView.exportDiagram(document.getElementById(id), "copy-svg", { silent: true });
      out[id] = window.__names[0]?.replace(/_\d{4}-\d\d-\d\d_\d{6}$/, "");
    }
    return out;
  }, ids);

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

for (const version of [11, 12]) {
  test.describe(`Mermaid ${version}`, () => {
    /** @type {import("@playwright/test").Page} */
    let page;

    test.beforeAll(async ({ browser }) => {
      page = await load(browser, version);
    });

    test("the header shows the chart title, accTitle before it and data-title first", async () => {
      const shown = await labels(page, ["m-title", "m-acc", "m-pie", "m-data"]);
      expect(shown).toEqual({
        "m-title": "ORDER FLOW",
        "m-acc": "CHECKOUT STEPS",
        "m-pie": "PETS",
        "m-data": "PAYMENTS",
      });
    });

    test("a diagram with no title reads DIAGRAM, not its diagram type", async () => {
      const type = await page.evaluate(() =>
        document.querySelector("#m-plain svg").getAttribute("aria-roledescription"),
      );
      expect(type).toBe("sequence");
      expect(await labels(page, ["m-plain"])).toEqual({ "m-plain": "DIAGRAM" });
    });

    test("export files take the name the header shows", async () => {
      const shown = await labels(page, MERMAID);
      const names = await fileNames(page, MERMAID);
      for (const id of MERMAID) {
        const expected =
          shown[id] === "DIAGRAM" ? "diagram_export" : shown[id].toLowerCase().replace(/ /g, "_");
        expect(names[id], id).toBe(expected);
      }
    });
  });
}

test.describe("other diagrams", () => {
  /** @type {import("@playwright/test").Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await load(browser, 12);
  });

  test("an SVG <title> names it, Graphviz shape tooltips do not", async () => {
    expect(await labels(page, ["gv", "gv-shapes"])).toEqual({
      gv: "BUILD PIPELINE",
      "gv-shapes": "DIAGRAM",
    });
  });

  test("a node label or a picture inside an HTML label does not name it", async () => {
    expect(await labels(page, ["deep"])).toEqual({ deep: "DIAGRAM" });
  });

  test("a figure caption stays under the diagram and does not name it", async () => {
    expect(await labels(page, ["fig"])).toEqual({ fig: "DIAGRAM" });
    expect(await page.locator("#fig figcaption").isVisible()).toBe(true);
  });

  test("markup in a title shows as text on one line", async () => {
    const label = await page.evaluate(() => {
      const el = document
        .getElementById("markup")
        .closest(".diagview-wrapper")
        .querySelector(".diagview-label");
      return { text: el.textContent, children: el.children.length, hit: window.__hit ?? null };
    });
    expect(label).toEqual({
      text: 'LOGIN <IMG SRC=X ONERROR="WINDOW.__HIT=1"> FLOW',
      children: 0,
      hit: null,
    });
  });

  test("a title cut after two lines shows whole on hover, a short one gets no tooltip", async () => {
    const tips = await page.evaluate(() =>
      ["long", "gv"].map((id) => {
        const label = document
          .getElementById(id)
          .closest(".diagview-wrapper")
          .querySelector(".diagview-label");
        label.dispatchEvent(new PointerEvent("pointerenter"));
        return { title: label.getAttribute("title"), style: label.getAttribute("style") };
      }),
    );
    expect(tips[0].title).toMatch(/^Customer order processing, .* we support today$/);
    expect(tips[1].title).toBeNull();
    expect(tips.map((t) => t.style)).toEqual([null, null]);
  });

  test("a title too long for two lines ends in an ellipsis", async () => {
    const box = await page.evaluate(() => {
      const el = document
        .getElementById("long")
        .closest(".diagview-wrapper")
        .querySelector(".diagview-label");
      const cs = getComputedStyle(el);
      const lines = Math.round(el.clientHeight / parseFloat(cs.lineHeight));
      // The whole title, measured in place with the clamp off, so it wraps
      // at the label's own width. Firefox and Safari clamp a block too.
      el.style.cssText = "display:block;-webkit-line-clamp:none;line-clamp:none";
      const wholeHeight = el.clientHeight;
      el.removeAttribute("style");
      return { lines, cut: wholeHeight > el.clientHeight + 1, clamp: cs.webkitLineClamp };
    });
    expect(box).toEqual({ lines: 2, cut: true, clamp: "2" });
  });
});
