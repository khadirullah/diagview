/**
 * Verifies PNG export of large diagrams with <foreignObject> labels and the
 * search highlight on Mermaid-shaped and hand-drawn SVGs.
 *
 *   node tests/e2e/verify-export-search.mjs                  # local dist/
 *   DV_DIST=/path/to/diagview.umd.js node tests/e2e/verify-export-search.mjs
 *
 * Run after `npm run build`. Fully offline: the page is file://, the large
 * diagram is generated in the page and no Mermaid is loaded.
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.join(here, "fixtures", "export-search.html");
const dist = process.env.DV_DIST || path.join(here, "..", "..", "dist", "diagview.umd.js");
console.log("build:", dist);

const RING_LIGHT = "rgb(37, 99, 235)";
const RING_DARK = "rgb(251, 191, 36)";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await context.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.text()));
page.on("pageerror", (e) => logs.push(String(e.message)));

await page.goto(pageUrl);
await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
await page.addScriptTag({ path: dist });
await page.evaluate(() => {
  DiagView.default.configure({ animateOpen: false, rememberZoom: false });
  DiagView.default.init();
});
await page.waitForTimeout(300);

// Run each section on its own so one failure does not abort the rest.
async function section(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name, false, "threw: " + String(e.message).split("\n")[0].slice(0, 160));
  }
  await page
    .evaluate(() => {
      if (DiagView.default.state?.isModalOpen) DiagView.default.closeModal?.();
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

const errorToasts = () =>
  page.evaluate(() => [...document.querySelectorAll(".diagview-toast-error")].map((t) => t.textContent.trim()));
const clearToasts = () =>
  page.evaluate(() => document.querySelectorAll(".diagview-toast").forEach((t) => t.remove()));

async function exportPNG(id) {
  await clearToasts();
  const logStart = logs.length;
  const download = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page.evaluate((id) => {
    // Not awaited: the export resolves after the download has fired.
    DiagView.default.exportToPNG(document.getElementById(id)).catch((e) => console.error(String(e)));
  }, id);
  const dl = await download;
  await page.waitForTimeout(300);
  return {
    file: dl ? dl.suggestedFilename() : null,
    toasts: await errorToasts(),
    security: logs.slice(logStart).filter((l) => /SecurityError|[Tt]ainted/.test(l)),
  };
}

// ── Export ───────────────────────────────────────────────────────────────────
await section("large foreignObject diagram exports to PNG", async () => {
  const size = await page.evaluate(() => {
    const svg = document.querySelector("#big svg");
    return {
      bytes: new XMLSerializer().serializeToString(svg).length,
      labels: svg.querySelectorAll("foreignObject").length,
    };
  });
  const r = await exportPNG("big");
  check(
    "large foreignObject diagram exports to PNG",
    size.bytes > 1_000_000 && r.file && !r.toasts.length && !r.security.length,
    `${(size.bytes / 1e6).toFixed(2)} MB, ${size.labels} labels, download=${r.file}` +
      (r.toasts.length ? `, toast="${r.toasts[0]}"` : "") +
      (r.security.length ? `, log="${r.security[0].slice(0, 100)}"` : ""),
  );
});

await section("small diagram still exports to PNG", async () => {
  const r = await exportPNG("small");
  check(
    "small diagram still exports to PNG",
    r.file && !r.toasts.length && !r.security.length,
    `download=${r.file}` + (r.toasts.length ? `, toast="${r.toasts[0]}"` : ""),
  );
});

// ── Search ───────────────────────────────────────────────────────────────────
// Helpers defined in the page: effective opacity multiplies every ancestor's
// computed opacity up to the document, since that is what the user sees.
await page.evaluate(() => {
  window.__eff = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return Math.round(o * 1000) / 1000;
  };
  window.__clone = () => document.getElementById("diagview-modal-viewport").querySelector("svg");
});

async function openModal(id) {
  await page.evaluate((id) => DiagView.default.openFullscreen(document.querySelector(`#${id} svg`).parentElement), id);
  await page.waitForFunction(() => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening);
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
    const btn = [...document.querySelectorAll(".dv-theme-btn")].find((b) => b.textContent.trim().endsWith(label));
    btn?.click();
    return !!btn;
  }, label);
  if (!found) throw new Error(`no ${label} canvas button`);
  await page.waitForTimeout(300);
}
const pulsing = () =>
  page.evaluate(() => document.getAnimations().filter((a) => a.animationName === "dv-pulse").length);

await section("Mermaid search", async () => {
  await openModal("mermaid");
  await canvasTheme("Light");
  await search("Orders");
  const m = await page.evaluate(() => {
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
  check(
    "Mermaid: label inside matched node is fully opaque",
    m.searching && m.hitMarked && m.hitLabel === 1,
    `marked=${m.hitMarked}, opacity ${m.hitLabel}`,
  );
  check(
    "Mermaid: non-matching label and edge are dimmed",
    m.missLabel <= 0.2 && m.edge <= 0.2,
    `label ${m.missLabel}, edge ${m.edge}`,
  );
  check(
    "Mermaid: a shape with an id-scoped opacity rule is dimmed too",
    m.idScoped <= 0.2,
    `opacity ${m.idScoped}`,
  );
  const running = await pulsing();

  await canvasTheme("Dark");
  const dark = await page.evaluate(
    () => getComputedStyle(window.__clone().querySelector('[data-id="Orders"] rect.label-container')).stroke,
  );
  check(
    "Mermaid: ring follows the canvas (Light then Dark, no re-typing)",
    m.stroke === RING_LIGHT && dark === RING_DARK,
    `light ${m.stroke}, dark ${dark}`,
  );
  check("no dv-pulse animation runs during a search", running === 0, `${running} running`);
});

await section("plain SVG search", async () => {
  await openModal("plain");
  await canvasTheme("Light");
  await search("Frontend");
  const p = await page.evaluate(() => {
    const svg = window.__clone();
    const rect = svg.querySelector("#p-web, [id$='p-web']");
    const text = svg.querySelector("#p-web-t, [id$='p-web-t']");
    const others = [...svg.querySelectorAll("rect")].filter((r) => r !== rect).map((r) => window.__eff(r));
    return {
      marked: rect.classList.contains("dv-search-match"),
      stroke: getComputedStyle(rect).stroke,
      others,
      textFill: getComputedStyle(text).fill,
    };
  });
  check(
    "plain SVG: box behind the matched text is outlined, others dimmed",
    p.marked && p.stroke === RING_LIGHT && p.others.length && p.others.every((o) => o <= 0.2),
    `marked=${p.marked}, stroke ${p.stroke}, other rects ${p.others.join("/")}`,
  );
  check("plain SVG: matched text keeps its white fill", p.textFill === "rgb(255, 255, 255)", p.textFill);

  const running = await pulsing();

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
  check(
    "plain SVG: after a rotation the new match outlines its own box",
    r.db && r.rects === 1,
    `storage box marked=${r.db}, marked rects ${r.rects}`,
  );

  await search("");
  const c = await page.evaluate(() => {
    const svg = window.__clone();
    return {
      marks: svg.querySelectorAll(".dv-search-match").length,
      searching: svg.classList.contains("dv-searching"),
    };
  });
  check(
    "clearing the search removes every mark",
    c.marks === 0 && !c.searching,
    `${c.marks} marks left, dv-searching=${c.searching}`,
  );
  check("no dv-pulse animation runs during a plain SVG search", running === 0, `${running} running`);
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} export and search checks passed`);
process.exit(failed ? 1 : 0);
