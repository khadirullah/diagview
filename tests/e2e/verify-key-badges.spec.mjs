// Key badges in the viewer menu. A touch-only phone has no keys, so the
// badges and the "Press ? for shortcuts" hint stay hidden until the first
// key press outside a text field, which means a keyboard is plugged in.
// Typing into the search box does not count, since an on-screen keyboard
// only types into text fields. A desktop shows the badges from the start.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

async function openViewer(browser, options) {
  const page = await newPage(browser, options);
  // The hint would sit over the menu button
  await page.addInitScript(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.route("**/repro.html", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      "<head>",
      '<head><meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    await route.fulfill({ response: res, body });
  });
  await page.goto(REPRO);
  await page.waitForTimeout(300);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(500);
  return page;
}

const touchOnly = (page) =>
  page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);

const badges = (page) => page.locator("#dv-menu-panel .dv-menu-item kbd");

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("a touch phone shows the key badges only after a key press", async ({
  browser,
  browserName,
}) => {
  const page = await openViewer(browser, phone(browserName));
  test.skip(!(await touchOnly(page)), "This browser does not emulate a touch-only screen");
  await page.locator("#dv-toggle").tap();
  await page.waitForTimeout(300);
  await expect(badges(page)).toHaveCount(3);
  for (const kbd of await badges(page).all()) await expect(kbd).toBeHidden();

  await page.keyboard.press("Shift");
  for (const kbd of await badges(page).all()) await expect(kbd).toBeVisible();
  await expect(page.locator("#diagview-modal")).toHaveClass(/\bdv-keys\b/);
});

test("typing into the search box on a touch phone keeps them hidden", async ({
  browser,
  browserName,
}) => {
  const page = await openViewer(browser, phone(browserName));
  test.skip(!(await touchOnly(page)), "This browser does not emulate a touch-only screen");
  await page.locator("#dv-search-icon-btn").tap();
  await page.locator("#diagview-search").focus();
  await page.keyboard.type("A1");
  await expect(page.locator("#diagview-modal")).not.toHaveClass(/\bdv-keys\b/);
});

test("a desktop shows the key badges and the shortcut hint from the start", async ({
  browser,
}) => {
  const page = await openViewer(browser, {});
  await expect(page.locator(".diagview-shortcut-hint")).toBeVisible();
  await page.locator("#dv-toggle").click();
  await page.waitForTimeout(300);
  for (const kbd of await badges(page).all()) await expect(kbd).toBeVisible();
});
