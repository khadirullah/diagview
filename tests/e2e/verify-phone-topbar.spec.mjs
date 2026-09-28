// The viewer's top bar on a phone. A query from a share link or from
// openFullscreen() opens the folded search bar so the reader can see and
// clear it, without focusing the box.
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
