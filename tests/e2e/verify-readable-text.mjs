/**
 * Verifies the Text Colours row in the fullscreen menu. Readable recolours
 * only the labels that are hard to read against what sits behind them, keeps
 * the hue, follows canvas changes, survives a reopen, restores exactly on
 * Original and never leaks into exports.
 *
 *   node tests/e2e/verify-readable-text.mjs                  # local dist/
 *   DV_DIST=/path/to/diagview.umd.js node tests/e2e/verify-readable-text.mjs
 *
 * Run after `npm run build`. Fully offline: the page is file:// and every
 * diagram is static markup shaped like Mermaid, Graphviz, PlantUML and
 * draw.io output, so no Mermaid is loaded.
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = "file://" + path.join(here, "fixtures", "readable-text.html");
const dist = process.env.DV_DIST || path.join(here, "..", "..", "dist", "diagview.umd.js");
console.log("build:", dist);

// Swatch order in the menu: 0 custom picker, 1 White, 2 Dark Slate, 3 Navy, 4 Charcoal
const WHITE = 1;
const CHARCOAL = 4;
const CHARCOAL_RGB = "rgb(30, 41, 59)";
const WHITE_RGB = "rgb(255, 255, 255)";
const MIN_RATIO = 4.5;

// What sits behind each label and whether Readable should recolour it on the
// Charcoal canvas. bg is "canvas", a CSS colour laid over the canvas, or null
// when the paint is a gradient and contrast cannot be measured.
const DIAGRAMS = [
  {
    key: "seq",
    title: "Mermaid sequence",
    labels: [
      { id: "sq-api", bg: "#eaeaea", change: false },
      { id: "sq-browser", bg: "#eaeaea", change: false },
      { id: "sq-api-b", bg: "#eaeaea", change: false },
      { id: "sq-browser-b", bg: "#eaeaea", change: false },
      { id: "sq-msg1", bg: "canvas", change: true },
      { id: "sq-msg2", bg: "canvas", change: true },
      { id: "sq-title", bg: "canvas", change: true },
    ],
  },
  {
    key: "flow",
    title: "Mermaid flowchart",
    labels: [
      { id: "fl-build", bg: "#ececff", change: false },
      { id: "fl-test", bg: "#ececff", change: false },
      { id: "fl-edge", bg: "rgba(232, 232, 232, 0.8)", change: false },
    ],
  },
  {
    key: "gv",
    title: "Graphviz",
    labels: [
      { id: "gv-client", bg: "canvas", change: true },
      { id: "gv-server", bg: "lightblue", change: false },
      { id: "gv-edge", bg: "canvas", change: true },
    ],
  },
  {
    key: "puml",
    title: "PlantUML",
    labels: [
      { id: "pu-alice", bg: "#e2e2f0", change: false },
      { id: "pu-bob", bg: "#e2e2f0", change: false },
      { id: "pu-msg", bg: "canvas", change: true },
    ],
  },
  {
    key: "drawio",
    title: "draw.io",
    labels: [
      { id: "dio-queue", bg: "#dae8fc", change: false },
      { id: "dio-worker", bg: "#d5e8d4", change: false },
      { id: "dio-title", bg: "canvas", change: true },
      { id: "dio-edge", bg: "canvas", change: true },
      // The <text> fallbacks inside <switch> are never drawn
      { id: "dio-queue-fb", bg: null, change: false },
      { id: "dio-worker-fb", bg: null, change: false },
      { id: "dio-title-fb", bg: null, change: false },
      { id: "dio-edge-fb", bg: null, change: false },
    ],
  },
  {
    key: "hand",
    title: "hand-drawn",
    labels: [
      { id: "h-white", bg: "#1d4ed8", change: false },
      { id: "h-class", bg: "canvas", change: true },
      { id: "h-grad", bg: null, change: false },
      { id: "h-t1", bg: "canvas", change: true },
      { id: "h-t2", bg: "canvas", change: true },
      { id: "h-t3", bg: "canvas", change: false },
      { id: "h-overgrad", bg: null, change: false },
    ],
  },
];

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
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e.message)));

await page.goto(pageUrl);
await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
await page.addScriptTag({ path: dist });
await page.evaluate(() => {
  DiagView.default.configure({ animateOpen: false, rememberZoom: false });
  DiagView.default.init();
});
await page.waitForTimeout(300);

// Colour and contrast helpers in the page. Colours are resolved by painting
// one canvas pixel, so named colours, hex and rgba() all work.
await page.evaluate(() => {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = (c) => {
    if (!c || c === "none" || c === "transparent" || c.startsWith("url(")) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] === 0 ? null : [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hsl = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return { h, s, l };
  };
  const hex = (c) => (c ? "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : "none");

  const clone = () => document.querySelector("#diagview-modal-viewport svg");
  const find = (root, id) => root.querySelector(`[id="${id}"]`) || root.querySelector(`[id$="${id}"]`);
  const isHtml = (el) => !!el.closest("foreignObject") && el.namespaceURI === "http://www.w3.org/1999/xhtml";
  const paint = (el) => (isHtml(el) ? getComputedStyle(el).color : getComputedStyle(el).fill);
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // Every element that can carry a text colour, in document order
  const labels = (svg) => [
    ...svg.querySelectorAll("text, tspan"),
    ...[...svg.querySelectorAll("foreignObject *")].filter(ownText),
  ];
  const canvas = () => rgba(getComputedStyle(document.getElementById("diagview-modal")).backgroundColor);
  const bgFor = (spec, cv) => (spec === "canvas" ? cv : spec ? over(rgba(spec), cv) : null);
  const describe = (el) =>
    el.id || `<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 24)}"`;

  window.__dv = { rgba, over, ratio, hsl, hex, clone, find, paint, ownText, labels, canvas, bgFor, describe };
});

// The attribute that marks a recoloured label
const MARK = "data-dv-text-orig";

// Run each section on its own so one failure does not abort the rest.
async function section(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name, false, "threw: " + String(e.message).split("\n")[0].slice(0, 160));
  }
  await closeModal();
}

async function openModal(key) {
  await page.evaluate((key) => DiagView.default.openFullscreen(document.querySelector(`#${key} svg`).parentElement), key);
  await page.waitForFunction(() => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening);
  await page.waitForTimeout(400);
}
async function closeModal() {
  const open = await page.evaluate(() => {
    if (!DiagView.default.state?.isModalOpen) return false;
    DiagView.default.closeModal?.();
    return true;
  });
  // A reopen right after a close is ignored, so wait it out
  if (open) await page.waitForTimeout(900);
}
async function openMenu() {
  if (await page.locator(".diagview-menu.active").count()) return;
  await page.locator(".diagview-fab-btn").click({ timeout: 3000 });
  await page.waitForSelector(".diagview-menu.active", { timeout: 3000 });
  await page.waitForTimeout(150);
}
async function clickSwatch(index) {
  await openMenu();
  const swatches = page.locator(".diagview-menu.active .dv-swatch-btn");
  if ((await swatches.count()) <= index) throw new Error(`no canvas swatch number ${index} in the open menu`);
  await swatches.nth(index).click({ timeout: 3000 });
  await page.waitForTimeout(300);
}
async function clickTextMode(mode) {
  await openMenu();
  const btn = page.locator(`.diagview-menu.active .dv-text-mode-btn[data-text-mode="${mode}"]`);
  if (!(await btn.count())) throw new Error(`no .dv-text-mode-btn[data-text-mode="${mode}"] in the open menu`);
  await btn.click({ timeout: 3000 });
  await page.waitForTimeout(300);
}
const modeButtons = () =>
  page.evaluate(() => {
    const get = (m) => {
      const b = document.querySelector(`.diagview-menu .dv-text-mode-btn[data-text-mode="${m}"]`);
      return b ? { active: b.classList.contains("active"), pressed: b.getAttribute("aria-pressed") } : null;
    };
    const group = document.querySelector(".diagview-menu .dv-text-modes");
    return {
      original: get("original"),
      readable: get("readable"),
      label: group?.previousElementSibling?.textContent.trim() ?? null,
      flag: DiagView.default.state.readableText,
    };
  });
const fmtButtons = (b) =>
  `Original ${b.original ? `active=${b.original.active} aria-pressed=${b.original.pressed}` : "missing"}, ` +
  `Readable ${b.readable ? `active=${b.readable.active} aria-pressed=${b.readable.pressed}` : "missing"}, ` +
  `state.readableText=${b.flag}`;
const isMode = (b, mode) => {
  const on = mode === "readable";
  return (
    b.original && b.readable &&
    b.readable.active === on && b.readable.pressed === String(on) &&
    b.original.active === !on && b.original.pressed === String(!on) &&
    b.flag === on
  );
};

// Every label's colour and inline style in the modal clone, in document order
const snapshot = () =>
  page.evaluate(() =>
    window.__dv.labels(window.__dv.clone()).map((el) => ({
      who: window.__dv.describe(el),
      paint: window.__dv.paint(el),
      css: el.getAttribute("style") || "",
    })),
  );
function diffSnapshots(before, after, { css = true } = {}) {
  if (before.length !== after.length) return [`label count ${before.length} -> ${after.length}`];
  const out = [];
  before.forEach((b, i) => {
    const a = after[i];
    if (b.paint !== a.paint) out.push(`${b.who} colour ${b.paint} -> ${a.paint}`);
    else if (css && b.css !== a.css) out.push(`${b.who} style "${b.css}" -> "${a.css}"`);
  });
  return out;
}

// Per label: marked or not, current colour, background and contrast
const measure = (labels, mark) =>
  page.evaluate(
    ({ labels, mark }) => {
      const { clone, find, paint, rgba, over, ratio, hsl, hex, canvas, bgFor, describe, ownText } = window.__dv;
      const svg = clone();
      const cv = canvas();
      const rows = labels.map((l) => {
        const el = find(svg, l.id);
        if (!el) return { ...l, found: false };
        const fg = rgba(paint(el));
        const bg = bgFor(l.bg, cv);
        return {
          ...l,
          found: true,
          changed: el.hasAttribute(mark),
          paint: paint(el),
          fgHex: hex(fg),
          bgHex: hex(bg),
          hsl: fg ? hsl(fg) : null,
          ratio: fg && bg ? Math.round(ratio(over(fg, bg), bg) * 100) / 100 : null,
        };
      });
      const known = new Set(labels.map((l) => find(svg, l.id)).filter(Boolean));
      // Marked elements outside the table. A <text> that only wraps tspans
      // draws no glyphs of its own, so marking it has no visible effect.
      const extra = [...svg.querySelectorAll(`[${mark}]`)]
        .filter((el) => !known.has(el))
        .map((el) => ({ who: describe(el), wrapper: el.tagName.toLowerCase() === "text" && !ownText(el) }));
      return { rows, extra, canvas: hex(cv) };
    },
    { labels, mark },
  );

// Colours in the untouched source diagram, the author's own
const sourceColours = (key, ids) =>
  page.evaluate(
    ({ key, ids }) => {
      const svg = document.querySelector(`#${key} svg`);
      return Object.fromEntries(ids.map((id) => [id, window.__dv.paint(svg.querySelector(`[id="${id}"]`))]));
    },
    { key, ids },
  );

// The modal clone prefixes ids, so url(#g1) in the source is url(#<prefix>g1) there
const samePaint = (src, got) => {
  if (src === got) return true;
  const a = /url\("?#([^")]+)"?\)/.exec(src || "");
  const b = /url\("?#([^")]+)"?\)/.exec(got || "");
  return !!(a && b && b[1].endsWith(a[1]));
};

const readableOn = () => page.evaluate(() => DiagView.default.state.readableText === true);

const canvasNow = () =>
  page.evaluate(() => getComputedStyle(document.getElementById("diagview-modal")).backgroundColor);

// ── Default state ────────────────────────────────────────────────────────────
await section("menu starts in Original", async () => {
  await openModal("seq");
  await openMenu();
  const b = await modeButtons();
  check(
    "menu has a Text Colours row that starts in Original",
    b.label === "Text Colours" && isMode(b, "original"),
    `label "${b.label}", ${fmtButtons(b)}`,
  );
});

// ── Per diagram on Charcoal ──────────────────────────────────────────────────
let modeChecked = false;
for (const d of DIAGRAMS) {
  await section(`${d.title}: Readable on Charcoal`, async () => {
    await openModal(d.key);
    // A failed section can leave Readable on, start each diagram from Original
    if (await readableOn()) await clickTextMode("original");
    await clickSwatch(CHARCOAL);
    const cv = await canvasNow();
    if (cv !== CHARCOAL_RGB) throw new Error(`Charcoal swatch gave canvas ${cv}, expected ${CHARCOAL_RGB}`);

    // Original on a dark canvas leaves every label as the author drew it
    const ids = d.labels.map((l) => l.id);
    const src = await sourceColours(d.key, ids);
    const pre = await measure(d.labels, MARK);
    const touched = pre.rows.filter((r) => !r.found || r.changed || !samePaint(src[r.id], r.paint));
    check(
      `${d.title}: Original on Charcoal leaves every label alone`,
      !touched.length && !pre.extra.length,
      touched
        .map((r) => (r.found ? `${r.id} ${src[r.id]} -> ${r.paint}${r.changed ? " (marked)" : ""}` : `${r.id} not found`))
        .concat(pre.extra.map((e) => `${e.who} marked`))
        .join("; "),
    );

    const before = await snapshot();
    await clickTextMode("readable");
    if (!modeChecked) {
      const b = await modeButtons();
      check("clicking Readable marks it active and pressed", isMode(b, "readable"), fmtButtons(b));
    }

    const m = await measure(d.labels, MARK);
    const wrong = m.rows.filter((r) => !r.found || r.changed !== r.change);
    const extra = m.extra.filter((e) => !e.wrapper);
    const wrappers = m.extra.filter((e) => e.wrapper);
    check(
      `${d.title}: Readable changes exactly the expected labels`,
      !wrong.length && !extra.length,
      [
        ...wrong.map((r) =>
          r.found
            ? `${r.id} expected ${r.change ? "changed" : "unchanged"}, got ${r.changed ? "changed" : "unchanged"} (${r.fgHex} on ${r.bgHex}, ${r.ratio ?? "n/a"}:1)`
            : `${r.id} not found in the modal`,
        ),
        ...extra.map((e) => `unexpected change on ${e.who}`),
        ...wrappers.map((e) => `ignored wrapper ${e.who}`),
      ].join("; "),
    );

    const low = m.rows.filter((r) => r.found && r.changed && (r.ratio === null || r.ratio < MIN_RATIO));
    const changedRows = m.rows.filter((r) => r.found && r.changed);
    const expectsChange = d.labels.some((l) => l.change);
    check(
      `${d.title}: every changed label reaches ${MIN_RATIO}:1`,
      (changedRows.length || !expectsChange) && !low.length,
      low.length
        ? low.map((r) => `${r.id} ${r.fgHex} on ${r.bgHex} = ${r.ratio ?? "n/a"}:1`).join("; ")
        : changedRows.map((r) => `${r.id} ${r.ratio}:1`).join(", ") || "nothing changed",
    );

    if (d.key === "hand") {
      const red = m.rows.find((r) => r.id === "h-t2");
      const dh = red?.hsl ? Math.min(Math.abs(red.hsl.h - 0), 360 - Math.abs(red.hsl.h - 0)) : null;
      check(
        "red text keeps its hue on a dark canvas",
        red?.changed && dh !== null && dh <= 10 && red.hsl.s >= 0.4 && red.ratio >= MIN_RATIO,
        red?.hsl
          ? `#dc2626 -> ${red.fgHex}, hue ${red.hsl.h.toFixed(1)} (off by ${dh.toFixed(1)}), ` +
              `saturation ${(red.hsl.s * 100).toFixed(0)}%, lightness ${(red.hsl.l * 100).toFixed(0)}%, ${red.ratio}:1 on ${red.bgHex}`
          : "red tspan not found",
      );
    }

    await clickTextMode("original");
    if (!modeChecked) {
      const b = await modeButtons();
      check("clicking Original marks it active and pressed", isMode(b, "original"), fmtButtons(b));
      modeChecked = true;
    }
    const after = await snapshot();
    const left = await page.evaluate((mark) => window.__dv.clone().querySelectorAll(`[${mark}]`).length, MARK);
    const diff = diffSnapshots(before, after);
    check(
      `${d.title}: Original restores every colour and inline style`,
      !left && !diff.length,
      [left ? `${left} labels still marked` : "", ...diff].filter(Boolean).join("; "),
    );
  });
}

// ── Canvas switch while Readable is on ───────────────────────────────────────
await section("White canvas re-applies", async () => {
  const unreadable = [];
  const notRestored = [];
  const yellow = {};
  for (const d of DIAGRAMS) {
    await openModal(d.key);
    await clickSwatch(CHARCOAL);
    await clickTextMode("readable");
    await clickSwatch(WHITE);
    const cv = await canvasNow();
    if (cv !== WHITE_RGB) throw new Error(`White swatch gave canvas ${cv}, expected ${WHITE_RGB}`);
    const labels = d.labels.filter((l) => l.bg);
    const m = await measure(labels, MARK);
    const src = await sourceColours(d.key, labels.map((l) => l.id));
    // Author colour against the same background on White
    const fineOnWhite = await page.evaluate(
      ({ labels, src }) => {
        const { rgba, over, ratio, canvas, bgFor } = window.__dv;
        const cv = canvas();
        return Object.fromEntries(
          labels.map((l) => {
            const bg = bgFor(l.bg, cv);
            const fg = rgba(src[l.id]);
            return [l.id, !!fg && ratio(over(fg, bg), bg) >= 4.5];
          }),
        );
      },
      { labels, src },
    );
    for (const r of m.rows) {
      if (!r.found) {
        unreadable.push(`${r.id} not found`);
        continue;
      }
      if (r.ratio < MIN_RATIO) unreadable.push(`${r.id} ${r.fgHex} on ${r.bgHex} = ${r.ratio}:1`);
      if (fineOnWhite[r.id] && (r.changed || !samePaint(src[r.id], r.paint)))
        notRestored.push(`${r.id} ${src[r.id]} -> ${r.paint}${r.changed ? " (marked)" : ""}`);
      if (r.id === "h-t3") Object.assign(yellow, r);
    }
    await clickTextMode("original");
    await closeModal();
  }
  check(
    "White canvas with Readable on: every label reaches 4.5:1",
    !unreadable.length,
    unreadable.join("; "),
  );
  check(
    "White canvas with Readable on: labels already fine on white keep the author colour",
    !notRestored.length,
    notRestored.join("; "),
  );
  const dh = yellow.hsl ? Math.min(Math.abs(yellow.hsl.h - 54), 360 - Math.abs(yellow.hsl.h - 54)) : null;
  check(
    "White canvas with Readable on: yellow text darkens and keeps its hue",
    yellow.changed && dh !== null && dh <= 10 && yellow.ratio >= MIN_RATIO,
    yellow.hsl
      ? `#fde047 -> ${yellow.fgHex}, hue ${yellow.hsl.h.toFixed(1)} (off by ${dh.toFixed(1)}), ${yellow.ratio}:1, marked=${yellow.changed}`
      : "yellow tspan not found",
  );
});

// ── Reopen with Readable still on ────────────────────────────────────────────
await section("reopening applies Readable again", async () => {
  const seq = DIAGRAMS.find((d) => d.key === "seq").labels.filter((l) => l.change);
  await openModal("seq");
  await clickSwatch(CHARCOAL);
  await clickTextMode("readable");
  const first = await measure(seq, MARK);
  await closeModal();
  await openModal("seq");
  const second = await measure(seq, MARK);
  await openMenu();
  const b = await modeButtons();
  const bad = second.rows.filter((r) => !r.found || !r.changed || r.ratio < MIN_RATIO);
  check(
    "reopening the modal with Readable on recolours again",
    first.rows.every((r) => r.changed) && !bad.length && isMode(b, "readable"),
    [
      ...bad.map((r) => (r.found ? `${r.id} marked=${r.changed}, ${r.fgHex} on ${r.bgHex} = ${r.ratio}:1` : `${r.id} not found`)),
      fmtButtons(b),
    ].join("; "),
  );
});

// ── Exports keep the author's colours ────────────────────────────────────────
async function downloadSvgFromMenu() {
  await openMenu();
  const download = page.waitForEvent("download", { timeout: 15000 });
  await page.locator(".diagview-menu.active [data-action=svg]").click({ timeout: 3000 });
  const dl = await download;
  return readFile(await dl.path(), "utf8");
}
// The fill one element ends up with in an exported SVG. The export inlines
// computed styles, so an inline style fill wins over the fill attribute.
const exportedFill = (text, id) =>
  page.evaluate(
    ({ text, id }) => {
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const el = doc.querySelector(`[id="${id}"]`) || doc.querySelector(`[id$="${id}"]`);
      if (!el) return null;
      const inline = el.style?.getPropertyValue("fill") || "";
      const raw = inline || el.getAttribute("fill") || "";
      return { raw, hex: window.__dv.hex(window.__dv.rgba(raw)) };
    },
    { text, id },
  );
const hexOf = (c) => page.evaluate((c) => window.__dv.hex(window.__dv.rgba(c)), c);

async function exportCheck(key, id, name) {
  await openModal(key);
  await clickSwatch(CHARCOAL);
  if (!(await readableOn())) await clickTextMode("readable");
  const author = await hexOf((await sourceColours(key, [id]))[id]);
  const live = (await measure([{ id, bg: "canvas", change: true }], MARK)).rows[0];
  const svg = await downloadSvgFromMenu();
  if (!svg) throw new Error("the SVG export did not download");
  const got = await exportedFill(svg, id);
  const marks = (svg.match(/data-dv-text-orig/g) || []).length;
  check(
    name,
    live.changed && live.fgHex !== author && marks === 0 && got && got.hex === author,
    `author ${author}, modal ${live.fgHex} (marked=${live.changed}), export ${got ? `${got.hex} from "${got.raw}"` : "has no such element"}, ` +
      `${marks} ${MARK} attributes`,
  );
  return live;
}

await section("SVG export keeps the author's colours", async () => {
  await exportCheck("puml", "pu-msg", "PlantUML SVG export: message text keeps its own #000000 fill");
  const still = await measure([{ id: "pu-msg", bg: "canvas", change: true }], MARK);
  check(
    "the modal keeps the recolour after the export",
    still.rows[0].changed && still.rows[0].ratio >= MIN_RATIO,
    `pu-msg ${still.rows[0].fgHex}, ${still.rows[0].ratio}:1, marked=${still.rows[0].changed}`,
  );
  await closeModal();
  await exportCheck("seq", "sq-msg1", "Mermaid SVG export: class-styled message text keeps its own #333333 fill");
});

await section("PNG export with Readable on", async () => {
  const download = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page.evaluate(() => {
    // Not awaited: the export resolves after the download has fired.
    DiagView.default.exportToPNG(document.querySelector("#puml")).catch((e) => console.error(String(e)));
  });
  const dl = await download;
  check("PNG export still downloads with Readable on", !!dl, `download=${dl ? dl.suggestedFilename() : null}`);
});

// Leave the page in Original
await section("back to Original", async () => {
  await openModal("seq");
  await clickTextMode("original");
});

// ── Old pass and errors ──────────────────────────────────────────────────────
// normalizeSvgTextContrast was never on the public API, so look for it in the build
const oldPass = ((await readFile(dist, "utf8")).match(/normalizeSvgTextContrast/g) || []).length;
check("old normalizeSvgTextContrast is gone from the build", !oldPass, oldPass ? `${oldPass} mentions left` : "");
check("no console errors or page errors", !errors.length, errors.slice(0, 3).map((e) => e.slice(0, 120)).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} readable text checks passed`);
process.exit(failed ? 1 : 0);
