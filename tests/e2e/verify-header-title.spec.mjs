// The header title comes from the same places as the export file name:
// data-title, then the SVG's own <title> (Mermaid accTitle), then a title
// drawn on the diagram (Mermaid "title"). Only with none of them does it
// read "DIAGRAM". Checked on real Mermaid 11 and 12 output, Graphviz shape
// tooltips, a node label and a picture in an HTML label, a figure caption,
// markup in a title and a title too long for two lines. Screen readers get
// the same title as the SVG's name, unless it already has one.
//
// Mermaid comes from jsdelivr, so this suite needs network access. The page
// is file://, and DV_DIST=/path/to/diagview.umd.js tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const MERMAID = ["m-title", "m-acc", "m-plain", "m-pie", "m-data"];
const OTHERS = ["gv", "gv-shapes", "fig", "markup", "long", "deep"];
// A .diagram wrapper around one .mermaid
const WRAPPED = "m-wrap";

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
    // An animation, which strict mode removes and permissive mode keeps
    const svg = document.querySelector("#m-wrap svg");
    const animate = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    animate.setAttribute("attributeName", "opacity");
    animate.setAttribute("values", "1;0.5;1");
    animate.setAttribute("dur", "2s");
    svg.querySelector("g").appendChild(animate);
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
  for (const id of [...MERMAID, ...OTHERS, WRAPPED]) {
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

    test("screen readers name the drawing after the title, and Mermaid's own name stays", async () => {
      const svgs = await page.evaluate((ids) => {
        const attrs = (id) => {
          const svg = document.querySelector(`#${id} svg`);
          return [svg.getAttribute("role"), svg.getAttribute("aria-label")];
        };
        return Object.fromEntries(ids.map((id) => [id, attrs(id)]));
      }, MERMAID);
      const role = "graphics-document document";
      expect(svgs).toEqual({
        "m-title": [role, "Order flow"],
        "m-acc": [role, null],
        "m-plain": [role, null],
        "m-pie": [role, "Pets"],
        "m-data": [role, null],
      });
      await expect(page.locator("#m-title svg")).toHaveAccessibleName("Order flow");
      await expect(page.locator("#m-acc svg")).toHaveAccessibleName("Checkout steps");
      await expect(page.locator("#m-data svg")).toHaveAccessibleName("Checkout steps");
      await expect(page.locator("#m-pie svg")).toHaveAccessibleName("Pets");
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

    test("a wrapper's title and settings come first, and its diagram fills in the rest", async () => {
      expect(await labels(page, [WRAPPED])).toEqual({ [WRAPPED]: "WRAPPED" });
      const exported = await page.evaluate(async (id) => {
        const el = document.getElementById(id);
        let href = "";
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          href = this.href;
        };
        try {
          await DiagView.exportToSVG(el, { silent: true });
        } finally {
          HTMLAnchorElement.prototype.click = click;
        }
        const text = href.startsWith("data:")
          ? decodeURIComponent(href.split(",")[1])
          : await (await fetch(href)).text();
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const marks = [...doc.querySelectorAll("text")].filter((t) => /MARK$/.test(t.textContent));
        await DiagView.openFullscreen(el);
        const viewerAnimates = document.querySelectorAll("#diagview-modal-viewport svg animate");
        const result = {
          marks: [...new Set(marks.map((t) => t.textContent))],
          rotated: marks.some((t) => t.hasAttribute("transform")),
          fileAnimates: doc.querySelectorAll("animate").length,
          viewerAnimates: viewerAnimates.length,
        };
        DiagView.closeModal();
        return result;
      }, WRAPPED);
      // The text and the permissive mode come from the wrapper, the corner
      // style from the diagram, as the wrapper does not set one
      expect(exported).toEqual({
        marks: ["WRAPMARK"],
        rotated: false,
        fileAnimates: 1,
        viewerAnimates: 1,
      });
      await page.waitForFunction(() => !DiagView.state.isModalOpen);
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

  test("an SVG <title> stays its name, and the viewer's copy keeps a label DiagView added", async () => {
    expect(await page.locator("#gv svg").getAttribute("aria-label")).toBeNull();
    await expect(page.locator("#gv > svg")).toHaveAccessibleName("Build pipeline");
    await page.evaluate(() => DiagView.openFullscreen(document.getElementById("m-pie")));
    const copy = page.locator("#diagview-modal-viewport svg").first();
    await expect(copy).toHaveAccessibleName("Pets");
    await page.keyboard.press("Escape");
    await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
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
