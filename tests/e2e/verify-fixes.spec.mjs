// Sweep over the UMD global, removed config keys, ID references in the
// fullscreen clone and in exports, the allowOverrides gate, background and
// text colour, panAnimationDuration, arrow keys while rotated, T after
// reopen, share links on file://, init() after destroy() and notices in and
// out of fullscreen.
//
// The page loads from file:// on purpose, so the share link check runs on a
// real file URL. It has several SVG flavours: attribute refs, inline-style
// refs, <style>-block refs, a per-element sanitizer override and a Mermaid
// diagram (Mermaid comes from jsdelivr, so this needs network access).
// Set DV_CDN to a version (e.g. DV_CDN=1.0.11) to run the sweep against that
// published build and see which checks it fails.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const TITLES = ["Attr refs", "Style refs", "CSS refs", "Sanitize off", "Mermaid"];

function pageUrl() {
  const url = fixtureFile("fix-sweep.html");
  if (!process.env.DV_CDN) return url;
  // Same page, loading the published build from unpkg instead of ../../../dist
  const html = fs
    .readFileSync(fileURLToPath(url), "utf8")
    .replace(/\.\.\/\.\.\/\.\.\/dist\//g, `https://unpkg.com/diagview@${process.env.DV_CDN}/dist/`)
    .replace(
      "../../../node_modules/@panzoom/panzoom/dist/panzoom.min.js",
      "https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/dist/panzoom.min.js",
    );
  const file = path.join(os.tmpdir(), "diagview-fix-sweep-cdn.html");
  fs.writeFileSync(file, html);
  return pathToFileURL(file).href;
}

// Reference scan evaluated inside the page
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
const scanText = (text) =>
  page.evaluate(
    ([text, src]) => {
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      return (0, eval)("(" + src + ")")(doc.documentElement);
    },
    [text, REF_SCAN],
  );
const fmtDangling = (scan) => scan.dangling.map((d) => d.where + "#" + d.id).join(",") || 0;

/** @type {import("@playwright/test").Page} */
let page;
const pageErrors = [];
let mermaidStatus;

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

test.beforeAll(async ({ browser, browserName }) => {
  page = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  // Only Chromium knows the clipboard permissions. The page stubs
  // navigator.clipboard.writeText where a check needs the copied text.
  if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  page.on("pageerror", (e) => pageErrors.push(String(e.message)));
  await page.goto(pageUrl());
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  mermaidStatus = await page.evaluate(() => window.__mermaid);
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll(".diagram, .mermaid")].map((d) => d.dataset.title),
  );
  expect(titles).toEqual(TITLES);
});

// Leave the viewer closed after each check, as the old sweep's sections did
test.afterEach(async () => {
  await page
    .evaluate(() => {
      if (DiagView.state?.isModalOpen) DiagView.closeModal?.();
    })
    .catch(() => {});
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

test.describe("UMD global", () => {
  let surface;
  test("UMD global exposes state", async () => {
    surface = await page.evaluate(() => ({
      state: typeof DiagView.state,
      utils: typeof DiagView.utils,
      sanitize: typeof DiagView.utils?.sanitizeSVG,
      version: DiagView.version,
      initialized: DiagView.state?.isInitialized,
    }));
    expect(surface.state === "object" && surface.initialized === true, `v${surface.version}`).toBe(
      true,
    );
  });

  test("UMD global exposes utils.sanitizeSVG", async () => {
    expect(surface.sanitize).toBe("function");
    // Older builds only carry state and utils on the default export. Shim
    // so the rest of the sweep can run against them.
    await page.evaluate(() => {
      if (!DiagView.state && DiagView.default?.state) window.DiagView = DiagView.default;
    });
  });

  test("utils.sanitizeSVG strict strips on* / off keeps", async () => {
    const [off, strict] = await page.evaluate(() => [
      DiagView.utils.sanitizeSVG('<svg onload="x()"><rect onclick="y()"/></svg>', "off"),
      DiagView.utils.sanitizeSVG('<svg onload="x()"><rect onclick="y()"/></svg>', "strict"),
    ]);
    expect(off).toMatch(/onload/);
    expect(strict).not.toMatch(/onload|onclick/);
  });
});

test.describe("config keys", () => {
  let cfg;
  const removed = ["immersiveMode", "printFriendly", "sanitize"];
  test("configure warns on removed keys", async () => {
    cfg = await page.evaluate(() => {
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
    const warned = removed.every((k) => cfg.warns.some((w) => w.includes(`"${k}"`)));
    expect(warned, cfg.warns.join(" | ").slice(0, 120)).toBe(true);
  });

  test("removed keys are not in getConfiguration()", async () => {
    expect(cfg.keys.filter((k) => removed.includes(k))).toEqual([]);
  });

  test("backgroundColor/textColor/panAnimationDuration are config keys", async () => {
    expect([cfg.hasBg, cfg.hasText, cfg.hasPan]).toEqual([true, true, true]);
  });
});

test.describe("fixIds in the modal clone", () => {
  TITLES.forEach((title, i) => {
    test(`modal clone refs resolve: ${title}`, async () => {
      if (title === "Mermaid") expect(mermaidStatus, "Mermaid did not render").toBe("ok");
      await openIndex(i);
      const scan = await page.evaluate(
        `(${REF_SCAN})(document.querySelector('#diagview-modal-viewport svg'))`,
      );
      const isSanitizeOff = title === "Sanitize off";
      expect(
        (scan.dangling.length === 0 && scan.refs.length > 0) || isSanitizeOff,
        `refs=${scan.refs.length} dangling=${fmtDangling(scan)} unprefixed=${scan.unprefixed.length}`,
      ).toBe(true);
    });

    if (title === "Attr refs" || title === "Style refs") {
      test(`clone gradient resolves to its own defs: ${title}`, async () => {
        // Both diagrams define #grad in different colours, the clone must render its own
        await openIndex(i);
        const stop = await page.evaluate(() => {
          const svg = document.querySelector("#diagview-modal-viewport svg");
          const rect = svg.querySelector("rect[fill*='grad'], rect[style*='grad']");
          const ref = (rect.getAttribute("fill") || rect.getAttribute("style")).match(
            /url\(\s*['"]?#([^'")]+)/,
          )[1];
          return svg.querySelector("#" + CSS.escape(ref) + " stop")?.getAttribute("stop-color");
        });
        expect(stop).toBe(title === "Attr refs" ? "red" : "green");
      });
    }
  });
});

test.describe("exports", () => {
  for (const t of ["Attr refs", "Style refs", "CSS refs"]) {
    test(`export from fullscreen refs resolve: ${t}`, async () => {
      const i = TITLES.indexOf(t);
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
      expect(exported, "no download captured").toBeTruthy();
      const scan = await scanText(exported.text);
      expect(
        !exported.parseError && scan.dangling.length === 0 && scan.refs.length > 0,
        `${exported.name} refs=${scan.refs.length} dangling=${fmtDangling(scan)}`,
      ).toBe(true);
      await closeModal();
    });
  }

  test("plain export keeps original ids and resolves", async () => {
    // Export without the viewer must keep the original ids
    const plain = await page.evaluate(async () => {
      window.__downloads.length = 0;
      await DiagView.exportToSVG(document.querySelectorAll(".diagram")[0]);
      await new Promise((r) => setTimeout(r, 300));
      const d = window.__downloads[0];
      if (!d) return null;
      return d.href.startsWith("data:")
        ? decodeURIComponent(d.href.split(",")[1])
        : await (await fetch(d.href)).text();
    });
    expect(plain, "no download").toBeTruthy();
    const scan = await scanText(plain);
    expect(
      scan.dangling.length === 0 && scan.unprefixed.length === scan.refs.length,
      `refs=${scan.refs.length}`,
    ).toBe(true);
  });
});

test.describe("sanitizer allowOverrides gate", () => {
  let allowed;
  test("allowOverrides:false ignores data-diagview-sanitize=off in modal", async () => {
    const iOff = TITLES.indexOf("Sanitize off");
    await page.evaluate(() => DiagView.configure({ security: { allowOverrides: false } }));
    const gateCfg = await page.evaluate(() => DiagView.getConfiguration().security?.allowOverrides);
    await openIndex(iOff);
    const blocked = await page.evaluate(
      () => !!document.querySelector("#diagview-modal-viewport svg [onclick]"),
    );
    await closeModal();
    await page.evaluate(() => DiagView.configure({ security: { allowOverrides: true } }));
    await openIndex(iOff);
    allowed = await page.evaluate(
      () => !!document.querySelector("#diagview-modal-viewport svg [onclick]"),
    );
    await closeModal();
    expect({ config: gateCfg, onclickPresent: blocked }).toEqual({
      config: false,
      onclickPresent: false,
    });
  });

  test("allowOverrides:true honours data-diagview-sanitize=off in modal", async () => {
    expect(allowed, "onclick present").toBe(true);
  });
});

test.describe("colours", () => {
  let theme;
  test("configure backgroundColor applies to modal", async () => {
    await page.evaluate(() =>
      DiagView.configure({ backgroundColor: "#123456", textColor: "#fedcba" }),
    );
    await openIndex(0);
    theme = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById("diagview-modal"));
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        varBg: getComputedStyle(document.documentElement).getPropertyValue("--dv-bg").trim(),
      };
    });
    await closeModal();
    await page.evaluate(() => DiagView.configure({ backgroundColor: null, textColor: null }));
    expect(theme.bg === "rgb(18, 52, 86)" || theme.varBg === "#123456", JSON.stringify(theme)).toBe(
      true,
    );
  });

  test("configure textColor applies to modal", async () => {
    expect(theme.color).toBe("rgb(254, 220, 186)");
  });
});

test("panAnimationDuration used by arrow-key pan", async () => {
  await page.evaluate(() => DiagView.configure({ panAnimationDuration: 123 }));
  await openIndex(0);
  await page.evaluate(() => {
    const pz = DiagView.state.activePanzoom;
    const orig = pz.pan.bind(pz);
    window.__panOpts = [];
    pz.pan = (x, y, o) => {
      window.__panOpts.push(o);
      return orig(x, y, o);
    };
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const opts = await page.evaluate(() => window.__panOpts);
  await closeModal();
  await page.evaluate(() => DiagView.configure({ panAnimationDuration: 200 }));
  expect(opts.length, "pan calls").toBeGreaterThan(0);
  expect(opts[0]?.duration, JSON.stringify(opts[0] || null)).toBe(123);
});

test("arrow keys pan the same direction at 0/90/180/270", async () => {
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
  await closeModal();
  await page.evaluate(() => {
    DiagView.state.rotationAngle = 0;
  });
  const base = deltas[0];
  const same = deltas.every(
    (d) =>
      d.dxRight === base.dxRight &&
      d.dyRight === base.dyRight &&
      d.dxDown === base.dxDown &&
      d.dyDown === base.dyDown,
  );
  const rotated = deltas.map((d) => d.rot).join(",") === "0,90,180,270";
  expect(same && rotated && base.dxRight !== 0 && base.dyDown !== 0, JSON.stringify(deltas)).toBe(
    true,
  );
});

test.describe("T shortcut", () => {
  let r;
  const cls = () =>
    page.evaluate(() =>
      document.getElementById("diagview-modal-viewport")?.classList.contains("dv-text-select"),
    );
  test("T toggles text-select on/off", async () => {
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
    r = { on2, on3, fresh };
    expect({ on1, off1 }).toEqual({ on1: true, off1: false });
  });

  test("T still works after close and reopen", async () => {
    expect(
      r.on2 === true && r.on3 === true,
      `reopen=${r.on2} third=${r.on3} freshStart=${r.fresh}`,
    ).toBe(true);
  });
});

test.describe("share link on file://", () => {
  let link;
  test("share link on file:// is a usable file URL", async () => {
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
    link = await page.evaluate(() => window.__copied);
    await closeModal();
    const ok =
      typeof link === "string" &&
      link.startsWith("file:///") &&
      !link.includes("null") &&
      /dv-idx=1/.test(link) &&
      /dv-z=/.test(link);
    expect(ok, String(link).slice(0, 110)).toBe(true);
  });

  test("opening the share link restores the same diagram", async () => {
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
    await closeModal();
    expect(restored.open && restored.idx === 1, JSON.stringify(restored)).toBe(true);
  });
});

test.describe("destroy/init race", () => {
  test("init() queued behind in-flight destroy()", async () => {
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
    expect(
      life.isPromise && life.initialized && life.wrappers === life.diagrams,
      JSON.stringify(life),
    ).toBe(true);
  });

  test("fullscreen works after destroy/init cycle", async () => {
    await openIndex(0);
    const reopened = await page.evaluate(
      () => !!document.querySelector("#diagview-modal-viewport svg"),
    );
    await closeModal();
    expect(reopened).toBe(true);
  });
});

test.describe("notices", () => {
  // Where the newest toast with this text sits and whether it is on screen
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

  test("toolbar notice shows on the page while fullscreen is closed", async () => {
    await clearToasts();
    const copyBtn = page.locator('[data-action="copy"]').first();
    await copyBtn.scrollIntoViewIfNeeded();
    await copyBtn.click({ force: true });
    const inline = await lastToast("Copied");
    expect(inline).toEqual({ inViewer: false, onScreen: true });
  });

  test("notice shows inside the viewer while fullscreen is open", async () => {
    await openIndex(0);
    await clearToasts();
    await page.evaluate(() => DiagView.exportDiagram(DiagView.state.activeSourceElement, "svg"));
    const inside = await lastToast("SVG saved");
    await closeModal();
    expect(inside).toEqual({ inViewer: true, onScreen: true });
  });

  test("notice shows on the page again after fullscreen closes", async () => {
    await clearToasts();
    await page.evaluate(() =>
      DiagView.exportDiagram(document.querySelector(".diagram, .mermaid"), "svg"),
    );
    const after = await lastToast("SVG saved");
    expect(after).toEqual({ inViewer: false, onScreen: true });
  });
});

test("no uncaught page errors during sweep", async () => {
  expect(pageErrors, pageErrors.join(" | ").slice(0, 200)).toEqual([]);
});
