// PNG export of large diagrams with <foreignObject> labels, and the search
// highlight on Mermaid-shaped and hand-drawn SVGs.
//
// Runs offline: the page is file://, the large diagram is generated in the
// page and no Mermaid is loaded. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const RING_LIGHT = "rgb(37, 99, 235)";
const RING_DARK = "rgb(251, 191, 36)";

/** @type {import("@playwright/test").Page} */
let page;
const logs = [];

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(String(e.message)));
  await page.goto(fixtureFile("export-search.html"));
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    DiagView.default.configure({ animateOpen: false, rememberZoom: false });
    DiagView.default.init();
  });
  await page.waitForTimeout(300);
  // Effective opacity multiplies every ancestor's computed opacity up to the
  // document, since that is what the user sees
  await page.evaluate(() => {
    window.__eff = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement)
        o *= parseFloat(getComputedStyle(n).opacity);
      return Math.round(o * 1000) / 1000;
    };
    window.__clone = () => document.getElementById("diagview-modal-viewport").querySelector("svg");
  });
});

test.afterAll(async () => {
  await page.context().close();
});

async function closeIfOpen() {
  const open = await page.evaluate(() => {
    if (!DiagView.default.state?.isModalOpen) return false;
    DiagView.default.closeModal?.();
    return true;
  });
  if (open) await page.waitForTimeout(400);
}

const errorToasts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".diagview-toast-error")].map((t) => t.textContent.trim()),
  );
const clearToasts = () =>
  page.evaluate(() => document.querySelectorAll(".diagview-toast").forEach((t) => t.remove()));

async function exportPNG(id) {
  await clearToasts();
  const logStart = logs.length;
  const download = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page.evaluate((id) => {
    // Not awaited: the export resolves after the download has fired
    DiagView.default
      .exportToPNG(document.getElementById(id))
      .catch((e) => console.error(String(e)));
  }, id);
  const dl = await download;
  await page.waitForTimeout(300);
  return {
    file: dl ? dl.suggestedFilename() : null,
    toasts: await errorToasts(),
    security: logs.slice(logStart).filter((l) => /SecurityError|[Tt]ainted/.test(l)),
  };
}

async function openModal(id) {
  await closeIfOpen();
  await page.evaluate(
    (id) => DiagView.default.openFullscreen(document.querySelector(`#${id} svg`).parentElement),
    id,
  );
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
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
async function canvasTheme(label) {
  const found = await page.evaluate((label) => {
    const btn = [...document.querySelectorAll(".dv-theme-btn")].find((b) =>
      b.textContent.trim().endsWith(label),
    );
    btn?.click();
    return !!btn;
  }, label);
  expect(found, `no ${label} canvas button`).toBe(true);
  await page.waitForTimeout(300);
}
const pulsing = () =>
  page.evaluate(
    () => document.getAnimations().filter((a) => a.animationName === "dv-pulse").length,
  );

test.describe("export", () => {
  test("large foreignObject diagram exports to PNG", async () => {
    const size = await page.evaluate(() => {
      const svg = document.querySelector("#big svg");
      return {
        bytes: new XMLSerializer().serializeToString(svg).length,
        labels: svg.querySelectorAll("foreignObject").length,
      };
    });
    const r = await exportPNG("big");
    const detail =
      `${(size.bytes / 1e6).toFixed(2)} MB, ${size.labels} labels, download=${r.file}` +
      (r.toasts.length ? `, toast="${r.toasts[0]}"` : "") +
      (r.security.length ? `, log="${r.security[0].slice(0, 100)}"` : "");
    expect(size.bytes, detail).toBeGreaterThan(1_000_000);
    expect(r.file, detail).toBeTruthy();
    expect(r.toasts, detail).toEqual([]);
    expect(r.security, detail).toEqual([]);
  });

  test("small diagram still exports to PNG", async () => {
    const r = await exportPNG("small");
    const detail = `download=${r.file}` + (r.toasts.length ? `, toast="${r.toasts[0]}"` : "");
    expect(r.file, detail).toBeTruthy();
    expect(r.toasts, detail).toEqual([]);
    expect(r.security, detail).toEqual([]);
  });
});

test.describe("Mermaid search", () => {
  let m;
  let running;
  test("Mermaid: label inside matched node is fully opaque", async () => {
    await openModal("mermaid");
    await canvasTheme("Light");
    await search("Orders");
    m = await page.evaluate(() => {
      const svg = window.__clone();
      const hit = svg.querySelector('[data-id="Orders"]');
      const miss = svg.querySelector('[data-id="Billing"]');
      return {
        searching: svg.classList.contains("dv-searching"),
        hitMarked: hit.classList.contains("dv-search-match"),
        hitLabel: window.__eff(hit.querySelector("foreignObject span")),
        missLabel: window.__eff(miss.querySelector("foreignObject span")),
        edge: window.__eff(svg.querySelector(".flowchart-link")),
        idScoped: window.__eff(svg.querySelector(".pieCircle")),
        stroke: getComputedStyle(hit.querySelector("rect.label-container")).stroke,
      };
    });
    running = await pulsing();
    expect(
      { searching: m.searching, marked: m.hitMarked, opacity: m.hitLabel },
      `marked=${m.hitMarked}, opacity ${m.hitLabel}`,
    ).toEqual({ searching: true, marked: true, opacity: 1 });
  });

  test("Mermaid: non-matching label and edge are dimmed", async () => {
    const detail = `label ${m.missLabel}, edge ${m.edge}`;
    expect(m.missLabel, detail).toBeLessThanOrEqual(0.2);
    expect(m.edge, detail).toBeLessThanOrEqual(0.2);
  });

  test("Mermaid: a shape with an id-scoped opacity rule is dimmed too", async () => {
    expect(m.idScoped).toBeLessThanOrEqual(0.2);
  });

  test("Mermaid: ring follows the canvas (Light then Dark, no re-typing)", async () => {
    await canvasTheme("Dark");
    const dark = await page.evaluate(
      () =>
        getComputedStyle(window.__clone().querySelector('[data-id="Orders"] rect.label-container'))
          .stroke,
    );
    expect({ light: m.stroke, dark }).toEqual({ light: RING_LIGHT, dark: RING_DARK });
  });

  test("no dv-pulse animation runs during a search", async () => {
    expect(running, "running dv-pulse animations").toBe(0);
  });
});

test.describe("plain SVG search", () => {
  let p;
  let running;
  test("plain SVG: box behind the matched text is outlined, others dimmed", async () => {
    await openModal("plain");
    await canvasTheme("Light");
    await search("Frontend");
    p = await page.evaluate(() => {
      const svg = window.__clone();
      const rect = svg.querySelector("#p-web, [id$='p-web']");
      const text = svg.querySelector("#p-web-t, [id$='p-web-t']");
      const others = [...svg.querySelectorAll("rect")]
        .filter((r) => r !== rect)
        .map((r) => window.__eff(r));
      return {
        marked: rect.classList.contains("dv-search-match"),
        stroke: getComputedStyle(rect).stroke,
        others,
        textFill: getComputedStyle(text).fill,
      };
    });
    running = await pulsing();
    const detail = `marked=${p.marked}, stroke ${p.stroke}, other rects ${p.others.join("/")}`;
    expect(p.marked, detail).toBe(true);
    expect(p.stroke, detail).toBe(RING_LIGHT);
    expect(p.others.length, detail).toBeGreaterThan(0);
    expect(
      p.others.every((o) => o <= 0.2),
      detail,
    ).toBe(true);
  });

  test("plain SVG: matched text keeps its white fill", async () => {
    expect(p.textFill).toBe("rgb(255, 255, 255)");
  });

  test("plain SVG: after a rotation the new match outlines its own box", async () => {
    // Rotate after the first search, then search a label not paired yet
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("r");
    await page.waitForTimeout(500);
    await search("Storage");
    const r = await page.evaluate(() => {
      const svg = window.__clone();
      return {
        db: svg.querySelector("#p-db, [id$='p-db']").classList.contains("dv-search-match"),
        rects: [...svg.querySelectorAll("rect.dv-search-match")].length,
      };
    });
    expect(r).toEqual({ db: true, rects: 1 });
  });

  test("clearing the search removes every mark", async () => {
    await search("");
    const c = await page.evaluate(() => {
      const svg = window.__clone();
      return {
        marks: svg.querySelectorAll(".dv-search-match").length,
        searching: svg.classList.contains("dv-searching"),
      };
    });
    expect(c).toEqual({ marks: 0, searching: false });
  });

  test("no dv-pulse animation runs during a plain SVG search", async () => {
    expect(running, "running dv-pulse animations").toBe(0);
  });
});
