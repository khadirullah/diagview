// Search for a phrase that runs across a line break in a label, on SVGs
// that Mermaid 12 and 11 rendered (HTML labels, plain SVG labels, a
// timeline and a sequence diagram) and on Graphviz-shaped markup.
//
// Runs offline: the page is file:// and holds the rendered SVGs, so no
// Mermaid is loaded. DV_DIST=/path/to/diagview.umd.js tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const RING_LIGHT = "rgb(37, 99, 235)";

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(fixtureFile("search-lines.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    DiagView.init({ animateOpen: false, rememberZoom: false });
    // Effective opacity, every ancestor's included, as the user sees it
    window.__eff = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement)
        o *= parseFloat(getComputedStyle(n).opacity);
      return Math.round(o * 1000) / 1000;
    };
    window.__clone = () => document.getElementById("diagview-modal-viewport").querySelector("svg");
    window.__status = () => document.getElementById("diagview-search-status").textContent;
  });
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

async function openModal(id) {
  await page.evaluate(() => {
    if (DiagView.default.state?.isModalOpen) DiagView.default.closeModal?.();
  });
  await page.waitForFunction(() => !DiagView.default.state.isModalOpen);
  await page.evaluate(
    (id) => DiagView.default.openFullscreen(document.getElementById(`${id}-box`)),
    id,
  );
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
  await page.waitForTimeout(400);
  // The light canvas, so the outline colour is known
  await page.evaluate(() =>
    [...document.querySelectorAll(".dv-theme-btn")]
      .find((b) => b.textContent.trim().endsWith("Light"))
      ?.click(),
  );
  await page.waitForTimeout(200);
}

async function search(q) {
  await page.evaluate((q) => {
    const input = document.getElementById("diagview-search");
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await page.waitForTimeout(400);
  return page.evaluate(() => window.__status());
}

/** Search, then read the status and how strong the given labels look */
async function find(q, labels) {
  const status = await search(q);
  const seen = await page.evaluate(
    (labels) =>
      labels.map((text) => {
        const els = [...window.__clone().querySelectorAll("p, span, tspan, text")].filter(
          (e) => e.textContent.trim() === text,
        );
        return els.length ? Math.max(...els.map(window.__eff)) : null;
      }),
    labels,
  );
  return { status, seen };
}

for (const [id, name] of [
  ["m12-flow", "Mermaid 12"],
  ["m11-flow", "Mermaid 11"],
]) {
  test.describe(`${name} flowchart with HTML labels`, () => {
    let before;
    test(`${name}: "firewall ufw" finds the node written as Firewall<br>UFW`, async () => {
      await openModal(id);
      before = await page.evaluate(() => window.__clone().outerHTML);
      const r = await find("firewall ufw", ["Database"]);
      const node = await page.evaluate(() => {
        const n = window.__clone().querySelector(".node.dv-search-match");
        return n && { id: n.id, label: window.__eff(n.querySelector("p")) };
      });
      expect({ status: r.status, node: node?.id.includes("-A-"), label: node?.label }).toEqual({
        status: "1 match found",
        node: true,
        label: 1,
      });
      expect(r.seen[0], "Database is dimmed").toBeLessThanOrEqual(0.2);
    });

    test(`${name}: one-line labels match as before and the joined lines do not`, async () => {
      expect(await search("database")).toBe("1 match found");
      expect(await search("web server")).toBe("1 match found");
      expect(await search("firewall")).toBe("1 match found");
      expect(await search("firewallufw")).toBe("No matches found");
    });

    test(`${name}: clearing the search restores the markup exactly`, async () => {
      await search("");
      const after = await page.evaluate(() => window.__clone().outerHTML);
      expect(after === before, "markup changed after clearing").toBe(true);
    });
  });
}

test.describe("Mermaid 12 plain SVG labels and timeline", () => {
  test("htmlLabels false: a phrase across the rows of a label matches", async () => {
    await openModal("m12-plain");
    const r = await find("firewall ufw", ["Firewall", "UFW"]);
    expect(r).toEqual({ status: "1 match found", seen: [1, 1] });
    expect(await search("firewallufw")).toBe("No matches found");
  });

  test("timeline: a phrase across a wrapped event matches and outlines its box", async () => {
    await openModal("m12-timeline");
    const status = await search("long event text");
    const t = await page.evaluate(() => {
      const svg = window.__clone();
      const box = svg.querySelector("path.node-bkg.dv-search-match");
      return { box: box && getComputedStyle(box).stroke };
    });
    expect({ status, box: t.box }).toEqual({ status: "1 match found", box: RING_LIGHT });
    expect(await search("eventtext")).toBe("No matches found");
  });
});

test.describe("lines drawn as separate texts", () => {
  test("Mermaid 12 sequence note: both lines match once and the note is outlined", async () => {
    await openModal("m12-seq");
    const r = await find("firewall ufw", ["Firewall", "UFW", "Alice"]);
    const note = await page.evaluate(() => {
      const rect = window.__clone().querySelector("rect.note");
      return {
        marked: rect.classList.contains("dv-search-match"),
        stroke: getComputedStyle(rect).stroke,
      };
    });
    expect({ status: r.status, lines: r.seen.slice(0, 2), note }).toEqual({
      status: "1 match found",
      lines: [1, 1],
      note: { marked: true, stroke: RING_LIGHT },
    });
    expect(r.seen[2], "Alice is dimmed").toBeLessThanOrEqual(0.2);
  });

  test("Mermaid 12 sequence message: a phrase across its two lines matches once", async () => {
    const r = await find("hello there", ["Hello", "there"]);
    expect(r).toEqual({ status: "1 match found", seen: [1, 1] });
  });

  test("Graphviz node and edge label: a phrase across the lines matches once", async () => {
    await openModal("gv");
    const node = await find("firewall ufw", ["Firewall", "UFW", "Web server"]);
    const edge = await find("allow 443", ["allow", "443", "Firewall"]);
    expect({ node: node.status, lines: node.seen.slice(0, 2) }).toEqual({
      node: "1 match found",
      lines: [1, 1],
    });
    expect(node.seen[2], "the other node is dimmed").toBeLessThanOrEqual(0.2);
    expect({ edge: edge.status, lines: edge.seen.slice(0, 2) }).toEqual({
      edge: "1 match found",
      lines: [1, 1],
    });
    expect(await search("web server")).toBe("1 match found");
  });
});
