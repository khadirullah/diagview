// Gesture-scoped will-change (sharp at rest, smooth mid-gesture), the
// two-stage Escape in search and a single onClose per close.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

const openDiagram = () =>
  page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
const svgWillChange = () =>
  page.evaluate(() => {
    const svg = document.getElementById("diagview-modal-viewport").querySelector("svg");
    return getComputedStyle(svg).willChange;
  });

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  // Count onClose calls
  await page.evaluate(() => {
    window.__closes = 0;
    DiagView.default.configure({ onClose: () => window.__closes++ });
  });
  await openDiagram();
  await page.waitForTimeout(700);
});

test.afterAll(async () => {
  await page.context().close();
});

test.describe("will-change lifecycle", () => {
  test("at rest: will-change is auto (sharp)", async () => {
    expect(await svgWillChange()).toBe("auto");
  });

  test("during drag: will-change is transform (smooth)", async () => {
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(700, 440, { steps: 4 });
    // Panzoom applies the pan and fires panzoomchange in the next animation
    // frame. WebKit can answer before that frame runs, so let two frames
    // pass while the button is still held.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const during = await svgWillChange();
    await page.mouse.up();
    expect(during).toBe("transform");
  });

  test("after gesture: will-change back to auto (re-raster, sharp)", async () => {
    await page.waitForTimeout(700); // longer than the 400 ms cooldown
    expect(await svgWillChange()).toBe("auto");
  });

  test("wheel zoom arms will-change", async () => {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(100);
    expect(await svgWillChange()).toBe("transform");
  });

  test("wheel cooldown releases it", async () => {
    await page.waitForTimeout(700);
    expect(await svgWillChange()).toBe("auto");
  });
});

test.describe("Escape in search", () => {
  test("Escape with query: clears search, modal stays open", async () => {
    await page.evaluate(() => document.getElementById("dv-search-icon-btn")?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("diagview-search").focus());
    await page.keyboard.type("deploy");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape"); // stage 1: clear the query
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({
      open: DiagView.default.state.isModalOpen,
      q: document.getElementById("diagview-search").value,
    }));
    expect(st).toEqual({ open: true, q: "" });
  });

  test("Escape with empty query: exits search, modal stays open", async () => {
    await page.keyboard.press("Escape"); // stage 2: leave search
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({
      open: DiagView.default.state.isModalOpen,
      searchOpen: document.querySelector(".diagview-topbar")?.classList.contains("search-open"),
      focused: document.activeElement === document.getElementById("diagview-search"),
    }));
    expect(st.open && !st.focused, JSON.stringify(st)).toBe(true);
  });

  test("Escape after search closed: closes modal", async () => {
    await page.keyboard.press("Escape"); // stage 3: close the viewer
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => DiagView.default.state.isModalOpen)).toBe(false);
  });
});

test.describe("close guard", () => {
  test("triple-Escape close: onClose fired exactly once", async () => {
    await page.evaluate(() => {
      window.__closes = 0;
    });
    await openDiagram();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__closes), "onClose calls").toBe(1);
  });

  test("modal reopens cleanly after guarded close", async () => {
    await openDiagram();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => DiagView.default.state.isModalOpen)).toBe(true);
  });
});
