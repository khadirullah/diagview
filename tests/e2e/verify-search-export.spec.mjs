// Exports made from the fullscreen menu during a search, with
// exportSearchHighlight on (the default) and off.
//
// Runs offline on the export-search fixture. DV_DIST=/path/to/diagview.umd.js
// tests another build.
import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const RING_LIGHT = "rgb(37, 99, 235)";

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  await page.goto(fixtureFile("export-search.html"));
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-diagview-no-auto-init", ""),
  );
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    DiagView.init({ animateOpen: false, rememberZoom: false });
    window.__clone = () => document.getElementById("diagview-modal-viewport").querySelector("svg");
    window.__eff = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement)
        o *= parseFloat(getComputedStyle(n).opacity);
      return Math.round(o * 1000) / 1000;
    };
  });
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

async function openModal(id) {
  if (await page.evaluate(() => DiagView.default.state.isModalOpen)) {
    await page.evaluate(() => DiagView.default.closeModal());
    await page.waitForTimeout(400);
  }
  await page.evaluate(
    (id) => DiagView.default.openFullscreen(document.querySelector(`#${id} svg`).parentElement),
    id,
  );
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".dv-theme-btn")].find((b) =>
      b.textContent.trim().endsWith("Light"),
    );
    btn?.click();
  });
  await page.waitForTimeout(400);
}

async function search(q) {
  await page.evaluate((q) => {
    const input = document.getElementById("diagview-search");
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await page.waitForTimeout(400);
}

const setOption = (on) =>
  page.evaluate((on) => DiagView.default.configure({ exportSearchHighlight: on }), on);

/** Click an export button in the fullscreen menu and return the file */
async function exportFromMenu(action) {
  const download = page.waitForEvent("download", { timeout: 30000 });
  await page.evaluate((action) => {
    document.querySelector(`.dv-exp [data-action="${action}"]`).click();
  }, action);
  const file = await fs.readFile(await (await download).path());
  await page.waitForTimeout(300);
  return file;
}

/** What the viewer shows for the search right now */
const onScreen = (hit, miss) =>
  page.evaluate(
    ([hit, miss]) => {
      const svg = window.__clone();
      return {
        searching: svg.classList.contains("dv-searching"),
        matches: DiagView.default.state.searchMatches.length,
        marked: svg.querySelector(hit).classList.contains("dv-search-match"),
        missDimmed: window.__eff(svg.querySelector(miss)) <= 0.2,
      };
    },
    [hit, miss],
  );

/** Decode a PNG file in the page and keep its pixels under name */
const decode = (name, png) =>
  page.evaluate(
    async ([name, b64]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      (window.__png ||= {})[name] = ctx.getImageData(0, 0, c.width, c.height);
      return c.width;
    },
    [name, png.toString("base64")],
  );

/** Mean difference per channel between two decoded PNGs, -1 when the sizes differ */
const meanDiff = (a, b) =>
  page.evaluate(
    ([a, b]) => {
      const x = window.__png[a];
      const y = window.__png[b];
      if (x.width !== y.width || x.height !== y.height) return -1;
      let sum = 0;
      for (let i = 0; i < x.data.length; i++) sum += Math.abs(x.data[i] - y.data[i]);
      return sum / x.data.length;
    },
    [a, b],
  );

test.describe("SVG export during a search", () => {
  const HIT = '[data-id="Orders"]';
  const MISS = '[data-id="Billing"] foreignObject span';
  let before;

  test("on by default: the file keeps the dimming, ring and search classes", async () => {
    await openModal("mermaid");
    await search("Orders");
    before = await onScreen(HIT, MISS);
    expect(before).toEqual({ searching: true, matches: 1, marked: true, missDimmed: true });

    const svg = (await exportFromMenu("svg")).toString();
    expect(svg).toContain("dv-searching");
    expect(svg).toContain("dv-search-match");
    expect(svg).toMatch(/opacity:\s*0\.15/);
    expect(svg).toContain(RING_LIGHT);
    expect(await onScreen(HIT, MISS)).toEqual(before);
  });

  test("off: the file matches an export with no search, the viewer keeps the search", async () => {
    await setOption(false);
    const svg = (await exportFromMenu("svg")).toString();
    expect(svg).not.toContain("dv-search");
    expect(svg).not.toMatch(/opacity:\s*0\.15/);
    expect(svg).not.toContain(RING_LIGHT);
    expect(await onScreen(HIT, MISS)).toEqual(before);

    await search("");
    const plain = (await exportFromMenu("svg")).toString();
    // Search adds its class with classList, which drops repeated class names
    // like Mermaid's "default default". Browsers treat both the same.
    const dedupe = (s) =>
      s.replace(/class="([^"]*)"/g, (_, c) => `class="${[...new Set(c.split(" "))].join(" ")}"`);
    expect(dedupe(svg)).toBe(dedupe(plain));
    await setOption(true);
  });
});

test.describe("PNG export during a search", () => {
  const HIT = "[id$='p-web']";
  const MISS = "[id$='p-api']";

  test("a PNG with no search to compare with", async () => {
    await page.evaluate(() => DiagView.default.configure({ highResScale: 1 }));
    await openModal("plain");
    expect(await decode("plain", await exportFromMenu("png"))).toBeGreaterThan(0);
  });

  test("on: the PNG shows the dimming", async () => {
    await search("Frontend");
    const before = await onScreen(HIT, MISS);
    expect(before).toEqual({ searching: true, matches: 1, marked: true, missDimmed: true });
    await decode("on", await exportFromMenu("png"));
    expect(await meanDiff("on", "plain")).toBeGreaterThan(5);
    expect(await onScreen(HIT, MISS)).toEqual(before);
  });

  test("off: the PNG looks like the one with no search, the viewer keeps the search", async () => {
    const before = await onScreen(HIT, MISS);
    await setOption(false);
    await decode("off", await exportFromMenu("png"));
    const diff = await meanDiff("off", "plain");
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThan(0.5);
    expect(await onScreen(HIT, MISS)).toEqual(before);
    await setOption(true);
  });
});
