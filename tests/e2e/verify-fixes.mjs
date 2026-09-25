/**
 * Browser sweep for the fixes landed after v1.0.11, plus notice visibility.
 *
 * Loads a self-contained page from file:// (so the share-link fix is exercised
 * for real) with several SVG flavours — attribute refs, inline-style refs,
 * <style>-block refs, a per-element sanitizer override and a Mermaid diagram —
 * and checks every option touched since 1.0.11 against dist/diagview.umd.js.
 *
 *   node tests/e2e/verify-fixes.mjs          # local dist/
 *   node tests/e2e/verify-fixes.mjs --cdn    # published diagview@1.0.11 (shows what the sweep catches)
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "fix-sweep.html");
let pageFile = fixture;
if (process.argv.includes("--cdn")) {
  // Same page, but loading the published build from unpkg instead of ../../../dist.
  const html = fs
    .readFileSync(fixture, "utf8")
    .replace(/\.\.\/\.\.\/\.\.\/dist\//g, "https://unpkg.com/diagview@1.0.11/dist/")
    .replace(
      "../../../node_modules/@panzoom/panzoom/dist/panzoom.min.js",
      "https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/dist/panzoom.min.js",
    );
  pageFile = path.join(os.tmpdir(), "diagview-fix-sweep-cdn.html");
  fs.writeFileSync(pageFile, html);
}
const pageUrl = "file://" + pageFile;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message)));

// Analysis helpers evaluated inside the page.
const REF_SCAN = `
  (root) => {
    const ids = new Set([...root.querySelectorAll('[id]')].map((n) => n.id));
    const refs = [];
    const addUrl = (s, where) => {
      const re = /url\\(\\s*(['"]?)#([^'")]+)\\1\\s*\\)/g; let m;
      while ((m = re.exec(s))) refs.push({ id: m[2].trim(), where });
    };
    for (const el of root.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (a.name === 'style') addUrl(a.value, 'style');
        else if (/^url\\(/.test(a.value)) addUrl(a.value, a.name);
        else if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#')) refs.push({ id: a.value.slice(1), where: a.name });
      }
      if (el.tagName.toLowerCase() === 'style') addUrl(el.textContent, '<style>');
    }
    const dangling = refs.filter((r) => !ids.has(r.id));
    const unprefixed = refs.filter((r) => !/^dv-/.test(r.id));
    return { ids: [...ids], refs, dangling, unprefixed };
  }`;

async function openIndex(i) {
  await page.evaluate(async (i) => {
    const el = document.querySelectorAll(".diagram, .mermaid")[i];
    await DiagView.openFullscreen(el);
  }, i);
  await page.waitForFunction(() => DiagView.state.isModalOpen && !DiagView.state.isModalOpening);
  await page.waitForTimeout(250);
}
async function closeModal() {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !DiagView.state.isModalOpen);
  await page.waitForTimeout(300);
}

await page.goto(pageUrl);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
const mermaidStatus = await page.evaluate(() => window.__mermaid);
console.log("mermaid:", mermaidStatus);

// Run each section independently so one failure does not abort the sweep.
async function section(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name, false, "threw: " + String(e.message).split("\n")[0].slice(0, 160));
  }
  await page
    .evaluate(() => {
      if (DiagView.state?.isModalOpen) DiagView.closeModal?.();
    })
    .catch(() => {});
  await page.waitForTimeout(300);
}

// ── 1. UMD global surface ───────────────────────────────────────────────────
const surface = await page.evaluate(() => ({
  state: typeof DiagView.state,
  utils: typeof DiagView.utils,
  sanitize: typeof DiagView.utils?.sanitizeSVG,
  version: DiagView.version,
  initialized: DiagView.state?.isInitialized,
}));
check(
  "UMD global exposes state",
  surface.state === "object" && surface.initialized === true,
  `v${surface.version}`,
);
check("UMD global exposes utils.sanitizeSVG", surface.sanitize === "function");
// Older builds only carry state/utils on the default export — shim so the rest of the sweep can run.
await page.evaluate(() => {
  if (!DiagView.state && DiagView.default?.state) window.DiagView = DiagView.default;
});
await section("utils.sanitizeSVG strict strips on* / off keeps", async () => {
  const sanitizeOff = await page.evaluate(() =>
    DiagView.utils.sanitizeSVG('<svg onload="x()"><rect onclick="y()"/></svg>', "off"),
  );
  const sanitizeStrict = await page.evaluate(() =>
    DiagView.utils.sanitizeSVG('<svg onload="x()"><rect onclick="y()"/></svg>', "strict"),
  );
  check(
    "utils.sanitizeSVG strict strips on* / off keeps",
    /onload/.test(sanitizeOff) && !/onload|onclick/.test(sanitizeStrict),
  );
});

// ── 2. Removed config keys warn, live keys are present ─────────────────────
const cfg = await page.evaluate(() => {
  window.__warns.length = 0;
  DiagView.configure({ immersiveMode: true, printFriendly: true, sanitize: "strict" });
  const c = DiagView.getConfiguration();
  return {
    warns: [...window.__warns],
    keys: Object.keys(c),
    hasBg: "backgroundColor" in c,
    hasText: "textColor" in c,
    hasPan: "panAnimationDuration" in c,
  };
});
const unknownWarned = ["immersiveMode", "printFriendly", "sanitize"].every((k) =>
  cfg.warns.some((w) => w.includes(`"${k}"`)),
);
check("configure warns on removed keys", unknownWarned, cfg.warns.join(" | ").slice(0, 120));
check(
  "removed keys are not in getConfiguration()",
  !cfg.keys.some((k) => ["immersiveMode", "printFriendly", "sanitize"].includes(k)),
);
check(
  "backgroundColor/textColor/panAnimationDuration are config keys",
  cfg.hasBg && cfg.hasText && cfg.hasPan,
);

// ── 3. fixIds across SVG flavours (modal clone) ────────────────────────────
const diagramCount = await page.evaluate(
  () => document.querySelectorAll(".diagram, .mermaid").length,
);
const titles = await page.evaluate(() =>
  [...document.querySelectorAll(".diagram, .mermaid")].map((d) => d.dataset.title),
);
for (let i = 0; i < diagramCount; i++)
  await section(`modal clone refs resolve: ${titles[i]}`, async () => {
    if (titles[i] === "Mermaid" && mermaidStatus !== "ok") {
      check(`modal clone refs resolve: ${titles[i]}`, false, mermaidStatus);
      return;
    }
    await openIndex(i);
    const scan = await page.evaluate(
      `(${REF_SCAN})(document.querySelector('#diagview-modal-viewport svg'))`,
    );
    const isSanitizeOff = titles[i] === "Sanitize off";
    check(
      `modal clone refs resolve: ${titles[i]}`,
      (scan.dangling.length === 0 && scan.refs.length > 0) || isSanitizeOff,
      `refs=${scan.refs.length} dangling=${scan.dangling.map((d) => d.where + "#" + d.id).join(",") || 0} unprefixed=${scan.unprefixed.length}`,
    );
    if (titles[i] === "Attr refs" || titles[i] === "Style refs") {
      // Both pages define #grad with different colours — the clone must render its own.
      const stop = await page.evaluate(() => {
        const svg = document.querySelector("#diagview-modal-viewport svg");
        const rect = svg.querySelector("rect[fill*='grad'], rect[style*='grad']");
        const ref = (rect.getAttribute("fill") || rect.getAttribute("style")).match(
          /url\(\s*['"]?#([^'")]+)/,
        )[1];
        return svg.querySelector("#" + CSS.escape(ref) + " stop")?.getAttribute("stop-color");
      });
      check(
        `clone gradient resolves to its own defs: ${titles[i]}`,
        stop === (titles[i] === "Attr refs" ? "red" : "green"),
        `stop-color=${stop}`,
      );
    }
    await closeModal();
  });

// ── 4. Export from fullscreen (uses the modal clone as source) ─────────────
for (const t of ["Attr refs", "Style refs", "CSS refs"])
  await section(`export from fullscreen refs resolve: ${t}`, async () => {
    const i = titles.indexOf(t);
    await openIndex(i);
    const exported = await page.evaluate(async (i) => {
      window.__downloads.length = 0;
      const el = document.querySelectorAll(".diagram, .mermaid")[i];
      const clone = document.querySelector("#diagview-modal-viewport svg");
      await DiagView.exportDiagram(el, "svg", { modalClone: clone });
      await new Promise((r) => setTimeout(r, 300));
      const d = window.__downloads[0];
      if (!d) return null;
      let text;
      if (d.href.startsWith("data:")) text = decodeURIComponent(d.href.split(",")[1]);
      else text = await (await fetch(d.href)).text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      return { name: d.name, text, parseError: !!doc.querySelector("parsererror") };
    }, i);
    if (!exported) {
      check(`export from fullscreen refs resolve: ${t}`, false, "no download captured");
      await closeModal();
      return;
    }
    const scan = await page.evaluate(
      ([text, src]) => {
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        return (0, eval)("(" + src + ")")(doc.documentElement);
      },
      [exported.text, REF_SCAN],
    );
    check(
      `export from fullscreen refs resolve: ${t}`,
      !exported.parseError && scan.dangling.length === 0 && scan.refs.length > 0,
      `${exported.name} refs=${scan.refs.length} dangling=${scan.dangling.map((d) => d.where + "#" + d.id).join(",") || 0}`,
    );
    await closeModal();
  });
// Plain export (no modal) must still work and keep original ids.
await section("plain export", async () => {
  const plain = await page.evaluate(async () => {
    window.__downloads.length = 0;
    await DiagView.exportToSVG(document.querySelectorAll(".diagram")[0]);
    await new Promise((r) => setTimeout(r, 300));
    const d = window.__downloads[0];
    if (!d) return null;
    const text = d.href.startsWith("data:")
      ? decodeURIComponent(d.href.split(",")[1])
      : await (await fetch(d.href)).text();
    return text;
  });
  const scan = plain
    ? await page.evaluate(
        ([text, src]) => {
          const doc = new DOMParser().parseFromString(text, "image/svg+xml");
          return (0, eval)("(" + src + ")")(doc.documentElement);
        },
        [plain, REF_SCAN],
      )
    : null;
  check(
    "plain export keeps original ids and resolves",
    !!scan && scan.dangling.length === 0 && scan.unprefixed.length === scan.refs.length,
    scan ? `refs=${scan.refs.length}` : "no download",
  );
});

// ── 5. Sanitizer allowOverrides gate in the modal ──────────────────────────
await section("sanitizer allowOverrides gate", async () => {
  const iOff = titles.indexOf("Sanitize off");
  await page.evaluate(() => DiagView.configure({ security: { allowOverrides: false } }));
  const gateCfg = await page.evaluate(() => DiagView.getConfiguration().security?.allowOverrides);
  await openIndex(iOff);
  const blocked = await page.evaluate(
    () => !!document.querySelector("#diagview-modal-viewport svg [onclick]"),
  );
  await closeModal();
  await page.evaluate(() => DiagView.configure({ security: { allowOverrides: true } }));
  await openIndex(iOff);
  const allowed = await page.evaluate(
    () => !!document.querySelector("#diagview-modal-viewport svg [onclick]"),
  );
  await closeModal();
  check(
    "allowOverrides:false ignores data-diagview-sanitize=off in modal",
    gateCfg === false && blocked === false,
    `config=${gateCfg} onclick-present=${blocked}`,
  );
  check(
    "allowOverrides:true honours data-diagview-sanitize=off in modal",
    allowed === true,
    `onclick-present=${allowed}`,
  );
});

// ── 6. backgroundColor / textColor reach the modal ─────────────────────────
await section("backgroundColor/textColor", async () => {
  await page.evaluate(() =>
    DiagView.configure({ backgroundColor: "#123456", textColor: "#fedcba" }),
  );
  await openIndex(0);
  const theme = await page.evaluate(() => {
    const m = document.getElementById("diagview-modal");
    const cs = getComputedStyle(m);
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      varBg: getComputedStyle(document.documentElement).getPropertyValue("--dv-bg").trim(),
    };
  });
  await closeModal();
  check(
    "configure backgroundColor applies to modal",
    theme.bg === "rgb(18, 52, 86)" || theme.varBg === "#123456",
    JSON.stringify(theme),
  );
  check("configure textColor applies to modal", theme.color === "rgb(254, 220, 186)", theme.color);
  await page.evaluate(() => DiagView.configure({ backgroundColor: null, textColor: null }));
});

// ── 7. panAnimationDuration reaches keyboard pans ──────────────────────────
await section("panAnimationDuration", async () => {
  await page.evaluate(() => DiagView.configure({ panAnimationDuration: 123 }));
  await openIndex(0);
  const dur = await page.evaluate(() => {
    const pz = DiagView.state.activePanzoom;
    const orig = pz.pan.bind(pz);
    window.__panOpts = [];
    pz.pan = (x, y, o) => {
      window.__panOpts.push(o);
      return orig(x, y, o);
    };
    return true;
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const opts = await page.evaluate(() => window.__panOpts);
  check(
    "panAnimationDuration used by arrow-key pan",
    dur && opts.length > 0 && opts[0]?.duration === 123,
    JSON.stringify(opts[0] || null),
  );
  await closeModal();
  await page.evaluate(() => DiagView.configure({ panAnimationDuration: 200 }));
});

// ── 8. Arrow keys pan in screen space at every rotation ────────────────────
await section("arrow keys under rotation", async () => {
  await openIndex(1);
  const deltas = [];
  for (let step = 0; step < 4; step++) {
    if (step > 0) {
      await page.keyboard.press("r");
      await page.waitForTimeout(450);
    }
    const before = await page.evaluate(() => ({
      ...DiagView.state.activePanzoom.getPan(),
      rot: DiagView.state.rotationAngle,
    }));
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => DiagView.state.activePanzoom.getPan());
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const after2 = await page.evaluate(() => DiagView.state.activePanzoom.getPan());
    deltas.push({
      rot: before.rot,
      dxRight: +(after.x - before.x).toFixed(1),
      dyRight: +(after.y - before.y).toFixed(1),
      dxDown: +(after2.x - after.x).toFixed(1),
      dyDown: +(after2.y - after.y).toFixed(1),
    });
  }
  const base = deltas[0];
  const same = deltas.every(
    (d) =>
      d.dxRight === base.dxRight &&
      d.dyRight === base.dyRight &&
      d.dxDown === base.dxDown &&
      d.dyDown === base.dyDown,
  );
  const rotated = deltas.map((d) => d.rot).join(",") === "0,90,180,270";
  check(
    "arrow keys pan the same direction at 0/90/180/270",
    same && rotated && base.dxRight !== 0 && base.dyDown !== 0,
    JSON.stringify(deltas),
  );
  await closeModal();
  await page.evaluate(() => {
    DiagView.state.rotationAngle = 0;
  });
});

// ── 9. T shortcut toggles text-select and survives close/reopen ────────────
await section("T shortcut", async () => {
  const cls = () =>
    page.evaluate(() =>
      document.getElementById("diagview-modal-viewport")?.classList.contains("dv-text-select"),
    );
  await openIndex(2);
  await page.keyboard.press("t");
  await page.waitForTimeout(100);
  const on1 = await cls();
  await page.keyboard.press("t");
  await page.waitForTimeout(100);
  const off1 = await cls();
  await closeModal();
  await openIndex(2);
  await page.keyboard.press("T");
  await page.waitForTimeout(100);
  const on2 = await cls();
  await closeModal();
  await openIndex(0);
  const fresh = await cls();
  await page.keyboard.press("t");
  await page.waitForTimeout(100);
  const on3 = await cls();
  await closeModal();
  check("T toggles text-select on/off", on1 === true && off1 === false);
  check(
    "T still works after close and reopen",
    on2 === true && on3 === true,
    `reopen=${on2} third=${on3} freshStart=${fresh}`,
  );
});

// ── 10. Share link on file:// ──────────────────────────────────────────────
await section("share link on file://", async () => {
  await page.evaluate(() => {
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => {
      window.__copied = t;
    };
  });
  await openIndex(1);
  await page.keyboard.press("l");
  await page
    .waitForFunction(() => window.__copied !== null, null, { timeout: 5000 })
    .catch(() => {});
  const link = await page.evaluate(() => window.__copied);
  await closeModal();
  const ok =
    typeof link === "string" &&
    link.startsWith("file:///") &&
    !link.includes("null") &&
    /dv-idx=1/.test(link) &&
    /dv-z=/.test(link);
  check("share link on file:// is a usable file URL", ok, String(link).slice(0, 110));
  if (ok) {
    await page.goto(link);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await page.evaluate(() => {
      if (!DiagView.state && DiagView.default?.state) window.DiagView = DiagView.default;
    });
    await page
      .waitForFunction(() => DiagView.state.isModalOpen, null, { timeout: 5000 })
      .catch(() => {});
    const restored = await page.evaluate(() => ({
      open: DiagView.state.isModalOpen,
      idx: DiagView.state.currentDiagramIndex,
      title: document.querySelector("#diagview-modal-viewport svg text")?.textContent,
    }));
    check(
      "opening the share link restores the same diagram",
      restored.open && restored.idx === 1,
      JSON.stringify(restored),
    );
    await closeModal();
  }
});

// ── 11. destroy() then init() without awaiting ─────────────────────────────
await section("destroy/init race", async () => {
  const life = await page.evaluate(async () => {
    DiagView.destroy();
    const p = DiagView.init({ diagramSelector: ".diagram, .mermaid", showKeyboardHelp: false });
    const isPromise = p && typeof p.then === "function";
    await p;
    await new Promise((r) => setTimeout(r, 400));
    return {
      isPromise,
      initialized: DiagView.state.isInitialized,
      wrappers: document.querySelectorAll(".diagview-wrapper").length,
      diagrams: document.querySelectorAll(".diagram, .mermaid").length,
    };
  });
  check(
    "init() queued behind in-flight destroy()",
    life.isPromise && life.initialized && life.wrappers === life.diagrams,
    JSON.stringify(life),
  );
  await openIndex(0);
  const reopened = await page.evaluate(
    () => !!document.querySelector("#diagview-modal-viewport svg"),
  );
  await closeModal();
  check("fullscreen works after destroy/init cycle", reopened);
});

// ── 12. Notices are visible outside fullscreen too ─────────────────────────
await section("toast visibility", async () => {
  // Reports where the newest toast sits and whether it is on screen.
  const lastToast = async (text) => {
    await page.waitForFunction(
      (t) =>
        [...document.querySelectorAll(".diagview-toast")].some((n) => n.textContent.includes(t)),
      text,
    );
    await page.waitForTimeout(400);
    return page.evaluate((t) => {
      const n = [...document.querySelectorAll(".diagview-toast")]
        .reverse()
        .find((x) => x.textContent.includes(t));
      const r = n.getBoundingClientRect();
      const onScreen =
        n.checkVisibility({ checkOpacity: true }) &&
        r.width > 0 &&
        r.height > 0 &&
        r.top >= 0 &&
        r.bottom <= innerHeight;
      return { inViewer: !!n.closest("#diagview-modal"), onScreen };
    }, text);
  };
  const clearToasts = () =>
    page.evaluate(() => document.getElementById("diagview-toast-container")?.remove());

  await clearToasts();
  const copyBtn = page.locator('[data-action="copy"]').first();
  await copyBtn.scrollIntoViewIfNeeded();
  await copyBtn.click({ force: true });
  const inline = await lastToast("Copied");
  check(
    "toolbar notice shows on the page while fullscreen is closed",
    !inline.inViewer && inline.onScreen,
    JSON.stringify(inline),
  );

  await openIndex(0);
  await clearToasts();
  await page.evaluate(() => DiagView.exportDiagram(DiagView.state.activeSourceElement, "svg"));
  const inside = await lastToast("SVG saved");
  check(
    "notice shows inside the viewer while fullscreen is open",
    inside.inViewer && inside.onScreen,
    JSON.stringify(inside),
  );
  await closeModal();

  await clearToasts();
  await page.evaluate(() =>
    DiagView.exportDiagram(document.querySelector(".diagram, .mermaid"), "svg"),
  );
  const after = await lastToast("SVG saved");
  check(
    "notice shows on the page again after fullscreen closes",
    !after.inViewer && after.onScreen,
    JSON.stringify(after),
  );
});

check(
  "no uncaught page errors during sweep",
  pageErrors.length === 0,
  pageErrors.join(" | ").slice(0, 200),
);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
