// The viewer's top bar on a phone. A query from a share link or from
// openFullscreen() opens the folded search bar so the reader can see and
// clear it, without focusing the box. On a page without a viewport meta
// tag the phone lays the page out 980px wide and zooms out, so the topbar
// gets the desktop layout at a phone's width. It drops its extras then, so
// the search box keeps its room.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

// repro.html has no viewport meta tag. With meta, the page gets one, so a
// phone lays it out at its own width.
async function load(browser, options, { meta = false, query = "" } = {}) {
  const page = await newPage(browser, options);
  if (meta) {
    await page.route("**/repro.html*", async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(
        "<head>",
        '<head><meta name="viewport" content="width=device-width, initial-scale=1">',
      );
      await route.fulfill({ response: res, body });
    });
  }
  await page.goto(REPRO + query);
  await page.waitForTimeout(300);
  return page;
}

const open = async (page, options = {}) => {
  await page.evaluate(
    (o) => DiagView.default.openFullscreen(document.getElementById("diag"), o),
    options,
  );
  await page.waitForTimeout(800);
};

const searchState = (page) =>
  page.evaluate(() => {
    const input = document.getElementById("diagview-search");
    const btn = document.getElementById("dv-search-icon-btn");
    return {
      open: document.querySelector(".diagview-topbar").classList.contains("search-open"),
      expanded: btn.getAttribute("aria-expanded"),
      value: input.value,
      width: input.getBoundingClientRect().width,
      focused: document.activeElement === input,
      searching: !!document.querySelector("#diagview-modal-viewport svg.dv-searching"),
    };
  });

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("a query from openFullscreen() opens the phone search bar", async ({
  browser,
  browserName,
}) => {
  const page = await load(browser, phone(browserName), { meta: true });
  await open(page, { searchQuery: "C3" });
  const s = await searchState(page);
  expect(s).toMatchObject({ open: true, expanded: "true", value: "C3", searching: true });
  expect(s.width, "search box shown").toBeGreaterThan(100);
  expect(s.focused, "no keyboard pops up").toBe(false);

  await page.locator(".diagview-search-back").click();
  await page.waitForTimeout(300);
  expect(await searchState(page)).toMatchObject({
    open: false,
    expanded: "false",
    value: "",
    searching: false,
  });
});

test("a query from a share link opens the phone search bar", async ({ browser, browserName }) => {
  const page = await load(browser, phone(browserName), { meta: true, query: "?dv-idx=0&dv-q=C3" });
  await page.waitForTimeout(2000);
  const s = await searchState(page);
  expect(s).toMatchObject({ open: true, value: "C3", searching: true, focused: false });
  expect(s.width).toBeGreaterThan(100);
});

test("a query on desktop leaves the top bar as it is", async ({ browser }) => {
  const page = await load(browser);
  await open(page, { searchQuery: "C3" });
  const s = await searchState(page);
  expect(s).toMatchObject({ open: false, expanded: "false", value: "C3", searching: true });
});

const topbar = (page) =>
  page.evaluate(() => {
    const modal = document.getElementById("diagview-modal");
    const shown = (sel) => getComputedStyle(modal.querySelector(sel)).display !== "none";
    const zoom = Number(getComputedStyle(modal).getPropertyValue("--dv-zoom-comp") || 1);
    return {
      layout: window.innerWidth,
      narrow: modal.classList.contains("dv-narrow"),
      // In design pixels, the size the reader sees
      search: document.getElementById("diagview-search").getBoundingClientRect().width / zoom,
      hint: shown(".diagview-shortcut-hint"),
      zoomBadge: shown(".diagview-zoom-display"),
      branding: shown(".diagview-branding"),
    };
  });

test("a zoomed-out phone page keeps room for the search box", async ({ browser, browserName }) => {
  test.skip(browserName === "firefox", "Firefox cannot emulate a zoomed-out phone page");
  const page = await load(browser, phone(browserName));
  await open(page);
  const t = await topbar(page);
  expect(t.layout, "page laid out wider than the phone").toBeGreaterThan(900);
  expect(t).toMatchObject({ narrow: true, hint: false, zoomBadge: false, branding: false });
  expect(t.search).toBeGreaterThan(120);

  await page.locator("#diagview-close").click();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() =>
      document.getElementById("diagview-modal").classList.contains("dv-narrow"),
    ),
  ).toBe(false);
});

test("a phone page with a viewport meta tag and a desktop page keep their topbar", async ({
  browser,
  browserName,
}) => {
  const phonePage = await load(browser, phone(browserName), { meta: true });
  await open(phonePage);
  expect((await topbar(phonePage)).narrow).toBe(false);

  const desktop = await load(browser);
  await open(desktop);
  expect(await topbar(desktop)).toMatchObject({
    narrow: false,
    hint: true,
    zoomBadge: true,
    branding: true,
  });
});
