// The first-time theme hint sits above the menu button, right edges in
// line, and stays on screen. Its two sentences take one line each, also on
// a 320px wide phone. On a phone page without a viewport meta tag
// the page is laid out 980px wide and zoomed out, and the hint and the
// button are counter-scaled to stay at their design size.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

// A fresh context has no stored "hint shown" flag, so the hint shows on open
async function openWithHint(browser, options, meta) {
  const page = await newPage(browser, options);
  if (meta) {
    await page.route("**/repro.html?meta", async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(
        "<head>",
        '<head><meta name="viewport" content="width=device-width, initial-scale=1">',
      );
      await route.fulfill({ response: res, body });
    });
  }
  await page.goto(REPRO + (meta ? "?meta" : ""));
  await page.waitForTimeout(300);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
  return page;
}

const measure = (page) =>
  page.evaluate(() => {
    // Lines of text, told apart by the bottom edge of each text box
    const textLines = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el.lastChild);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.bottom))).size;
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const hint = document.querySelector(".diagview-toast-menu-hint");
    const fab = document.getElementById("dv-toggle");
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      zoom: Number(
        getComputedStyle(document.getElementById("diagview-modal")).getPropertyValue(
          "--dv-zoom-comp",
        ) || 1,
      ),
      hint: hint && rect(hint),
      fab: rect(fab),
      text: hint?.textContent,
      lines: hint && textLines(hint),
    };
  });

function expectAboveButton(m) {
  expect(m.hint, "hint shown").toBeTruthy();
  expect(m.hint.left).toBeGreaterThanOrEqual(0);
  expect(m.hint.right).toBeLessThanOrEqual(m.width);
  expect(m.hint.top).toBeGreaterThanOrEqual(0);
  expect(Math.abs(m.hint.right - m.fab.right)).toBeLessThan(1.5);
  expect(m.hint.bottom).toBeLessThan(m.fab.top);
  expect(m.text).toBe("Having visibility issues?\nChange the canvas theme from the menu ☰");
  expect(m.lines, "one line per sentence").toBe(2);
}

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("hint sits above the menu button on a zoomed-out phone page", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName === "firefox", "Firefox cannot emulate a zoomed-out phone page");
  const page = await openWithHint(browser, phone(browserName), false);
  const m = await measure(page);
  expect(m.width, "page laid out wider than the phone").toBeGreaterThan(900);
  expect(m.zoom).toBeGreaterThan(2);
  expectAboveButton(m);
});

test("hint sits above the menu button on a phone page with a viewport meta tag", async ({
  browser,
  browserName,
}) => {
  const page = await openWithHint(browser, phone(browserName), true);
  const m = await measure(page);
  expect(m.width).toBe(390);
  expectAboveButton(m);
});

test("hint sits above the menu button on desktop", async ({ browser }) => {
  const page = await openWithHint(browser, {}, false);
  const m = await measure(page);
  expectAboveButton(m);
  // Two short lines instead of one long one, so it stays narrow
  expect(m.hint.right - m.hint.left).toBeLessThanOrEqual(330);
  expect(m.hint.bottom - m.hint.top).toBeLessThanOrEqual(66);
});

test("hint keeps two lines on a 320px wide phone", async ({ browser, browserName }) => {
  const small = { ...phone(browserName), viewport: { width: 320, height: 640 } };
  const page = await openWithHint(browser, small, true);
  const m = await measure(page);
  expect(m.width).toBe(320);
  expectAboveButton(m);
});
