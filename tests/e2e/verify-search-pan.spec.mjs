// Search brings a match into view. Zoomed in on one corner of the grid in
// repro.html, a typed query whose matches are all off screen pans the
// nearest one to the middle at the same zoom, Enter and Shift+Enter step
// through the matches in reading order, and a match already in view leaves
// the view alone. Also while rotated, on a Mermaid 12 HTML label and on a
// phone.
import { test, expect } from "@playwright/test";
import { REPRO, DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** Helpers the checks read the page with */
function install() {
  window.__clone = () => document.getElementById("diagview-modal-viewport").querySelector("svg");
  window.__pz = () => DiagView.default.state.activePanzoom;
  // Zoom to scale and put the diagram point (x, y) in the middle of the view
  window.__aim = async (x, y, scale) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    const pz = window.__pz();
    pz.zoom(scale, { animate: false });
    await frame();
    const svg = window.__clone();
    const root = svg.querySelector(".dv-rot-g") || svg;
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const at = pt.matrixTransform(root.getScreenCTM());
    const v = document.getElementById("diagview-modal-viewport").getBoundingClientRect();
    const s = pz.getScale();
    pz.pan((v.left + v.width / 2 - at.x) / s, (v.top + v.height / 2 - at.y) / s, {
      animate: false,
      relative: true,
    });
    await frame();
  };
  // Where a label is on screen and how far its middle is from the view's
  window.__where = (selector, text) => {
    const v = document.getElementById("diagview-modal-viewport").getBoundingClientRect();
    const el = [...window.__clone().querySelectorAll(selector)].find(
      (e) => e.textContent.trim() === text,
    );
    const r = el.getBoundingClientRect();
    return {
      inView: r.left >= v.left && r.top >= v.top && r.right <= v.right && r.bottom <= v.bottom,
      dx: Math.round(r.left + r.width / 2 - (v.left + v.width / 2)),
      dy: Math.round(r.top + r.height / 2 - (v.top + v.height / 2)),
      scale: Math.round(window.__pz().getScale() * 100) / 100,
      current: el.closest(".dv-search-current") !== null,
    };
  };
  window.__pan = () => {
    const p = window.__pz().getPan();
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  };
  window.__status = () => document.getElementById("diagview-search-status").textContent;
}

async function type(page, q) {
  await page.locator("#diagview-search").fill(q);
  // Throttle, search frame and the 200ms pan
  await page.waitForTimeout(700);
}

async function press(page, key) {
  await page.locator("#diagview-search").press(key);
  await page.waitForTimeout(500);
}

const near = { inView: true, dx: expect.any(Number), dy: expect.any(Number) };
const centred = (w) => Math.abs(w.dx) <= 2 && Math.abs(w.dy) <= 2;

test.describe("desktop grid", () => {
  /** @type {import("@playwright/test").Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await newPage(browser);
    await page.goto(REPRO);
    await page.evaluate(install);
    await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
    await page.waitForTimeout(800);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("a typed match off screen at zoom 4 pans to the middle, zoom kept", async () => {
    // A1 is the top left cell, J6 the bottom right one
    await page.evaluate(() => window.__aim(100, 100, 4));
    expect(await page.evaluate(() => window.__where("text", "J6").inView)).toBe(false);
    await type(page, "j6");
    const w = await page.evaluate(() => window.__where("text", "J6"));
    expect(w, JSON.stringify(w)).toMatchObject({ ...near, scale: 4, current: true });
    expect(centred(w), JSON.stringify(w)).toBe(true);
  });

  test("a typed query with a match in view leaves the view alone", async () => {
    await page.evaluate(() => window.__aim(100, 100, 4));
    const before = await page.evaluate(() => window.__pan());
    await type(page, "a1");
    expect(await page.evaluate(() => window.__status())).toBe("1 match found");
    expect(await page.evaluate(() => window.__pan())).toEqual(before);
  });

  test("Enter steps through a row left to right, panning only to a match out of view", async () => {
    // Row 1 holds A1 to J1. At zoom 4 the view shows about two cells.
    await page.evaluate(() => window.__aim(200, 100, 4));
    await type(page, "1");
    expect(await page.evaluate(() => window.__status())).toBe("10 matches found");
    const pan = await page.evaluate(() => window.__pan());

    // The first Enter picks the first match in view and does not move
    await press(page, "Enter");
    expect(await page.evaluate(() => window.__status())).toBe("Match 1 of 10");
    expect(await page.evaluate(() => window.__where("text", "A1"))).toMatchObject({
      inView: true,
      current: true,
    });
    expect(await page.evaluate(() => window.__pan())).toEqual(pan);

    const seen = [];
    for (let i = 2; i <= 10; i++) {
      await press(page, "Enter");
      const label = `${String.fromCharCode(64 + i)}1`;
      const w = await page.evaluate((l) => window.__where("text", l), label);
      seen.push({ label, status: await page.evaluate(() => window.__status()), ...w });
    }
    for (const s of seen) {
      expect(s, JSON.stringify(s)).toMatchObject({
        status: `Match ${s.label.charCodeAt(0) - 64} of 10`,
        inView: true,
        current: true,
        scale: 4,
      });
    }
    // C1 was cut off at the edge, so the view moved and C1 is in the middle
    expect(centred(seen[1]), JSON.stringify(seen[1])).toBe(true);

    // Enter after the last wraps to the first, Shift+Enter goes back
    await press(page, "Enter");
    expect(await page.evaluate(() => window.__status())).toBe("Match 1 of 10");
    await press(page, "Shift+Enter");
    expect(await page.evaluate(() => window.__status())).toBe("Match 10 of 10");
    expect(await page.evaluate(() => window.__where("text", "J1"))).toMatchObject({
      inView: true,
      current: true,
    });
  });

  test("the current match has a thicker outline on its box", async () => {
    const widths = await page.evaluate(() => {
      const box = (l) => {
        const t = [...window.__clone().querySelectorAll("text")].find((e) => e.textContent === l);
        return getComputedStyle(t.previousElementSibling).strokeWidth;
      };
      return { current: box("J1"), other: box("I1") };
    });
    expect(widths).toEqual({ current: "6px", other: "3px" });
  });

  test("rotated 90 degrees, a typed match off screen pans to the middle", async () => {
    await type(page, "");
    await page.locator("#diagview-search").blur();
    await page.keyboard.press("r");
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => DiagView.default.state.rotationAngle)).toBe(90);
    await page.evaluate(() => window.__aim(100, 100, 4));
    expect(await page.evaluate(() => window.__where("text", "J6").inView)).toBe(false);
    await type(page, "j6");
    const w = await page.evaluate(() => window.__where("text", "J6"));
    expect(w, JSON.stringify(w)).toMatchObject({ ...near, scale: 4 });
    expect(centred(w), JSON.stringify(w)).toBe(true);
  });
});

test("Mermaid 12 HTML label off screen at zoom 4 pans to the middle", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto(fixtureFile("search-lines.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(install);
  await page.evaluate(() => {
    DiagView.init({ animateOpen: false, rememberZoom: false });
    DiagView.default.openFullscreen(document.getElementById("m12-flow-box"));
  });
  await page.waitForTimeout(800);
  // The left end of the flowchart, where Firewall UFW is
  await page.evaluate(() => {
    const vb = window.__clone().viewBox.baseVal;
    return window.__aim(vb.x + 40, vb.y + vb.height / 2, 4);
  });
  expect(await page.evaluate(() => window.__where("p", "Database").inView)).toBe(false);
  await type(page, "database");
  const w = await page.evaluate(() => window.__where("p", "Database"));
  expect(w, JSON.stringify(w)).toMatchObject({ ...near, scale: 4 });
  expect(centred(w), JSON.stringify(w)).toBe(true);
  await page.context().close();
});

test("with reduced motion the pan to a match is instant", async ({ browser }) => {
  const page = await newPage(browser, { reducedMotion: "reduce" });
  await page.goto(REPRO);
  await page.evaluate(install);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__aim(100, 100, 4));
  await type(page, "j6");
  const r = await page.evaluate(() => ({
    ...window.__where("text", "J6"),
    duration: parseFloat(getComputedStyle(window.__clone()).transitionDuration),
  }));
  expect(r, JSON.stringify(r)).toMatchObject({ ...near, scale: 4 });
  expect(centred(r), JSON.stringify(r)).toBe(true);
  expect(r.duration, JSON.stringify(r)).toBeLessThan(0.001);
  await page.context().close();
});

test("phone: a typed match off screen pans to the middle of the view", async ({
  browser,
  browserName,
}) => {
  const page = await newPage(browser, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    // Firefox has no mobile emulation
    ...(browserName === "firefox" ? {} : { isMobile: true }),
    hasTouch: true,
  });
  await page.route("**/repro.html*", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      "<head>",
      '<head><meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    await route.fulfill({ response: res, body });
  });
  await page.goto(REPRO);
  await page.evaluate(install);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  await page.locator("#dv-search-icon-btn").tap();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__aim(100, 100, 4));
  expect(await page.evaluate(() => window.__where("text", "E4").inView)).toBe(false);
  await type(page, "e4");
  const w = await page.evaluate(() => window.__where("text", "E4"));
  expect(w, JSON.stringify(w)).toMatchObject({ ...near, scale: 4, current: true });
  expect(centred(w), JSON.stringify(w)).toBe(true);
  await page.context().close();
});
