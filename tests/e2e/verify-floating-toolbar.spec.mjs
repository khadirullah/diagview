// The floating toolbar sits at the bottom of the card with no line of its
// own, so a hovered card shows one bottom edge. The header toolbar keeps
// the line that separates it from the diagram. A touch screen shows the
// toolbar without a hover, at the same spot a desktop hover puts it.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/floating-toolbar.html`;

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

// Gap between the bottom of the toolbar and the bottom of its card
const toolbarGap = (page, id) =>
  page.evaluate((id) => {
    const wrap = document.getElementById(id).closest(".diagview-wrapper");
    const bar = wrap.querySelector(".diagview-controls");
    return Math.round(wrap.getBoundingClientRect().bottom - bar.getBoundingClientRect().bottom);
  }, id);

/** Desktop gap under the hovered floating toolbar, for the touch check */
let hoverGap;

// Bottom border of the toolbar and of its card, after hovering the card
async function hoverAndMeasure(id) {
  const wrapper = page.locator(`.diagview-wrapper:has(#${id})`);
  await wrapper.hover();
  const controls = wrapper.locator(".diagview-controls");
  await expect(controls).toHaveCSS("opacity", "1");
  // Wait for the slide down to end
  await expect(controls).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  return page.evaluate((id) => {
    const wrap = document.getElementById(id).closest(".diagview-wrapper");
    const bar = getComputedStyle(wrap.querySelector(".diagview-controls"));
    return {
      toolbar: `${bar.borderBottomWidth} ${bar.borderBottomStyle}`,
      card: `${getComputedStyle(wrap).borderBottomWidth} ${getComputedStyle(wrap).borderBottomStyle}`,
    };
  }, id);
}

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(PAGE);
  await page.waitForSelector("#floating[data-diagview-init]");
  await page.waitForSelector("#header[data-diagview-init]");
});

test.afterAll(async () => {
  await page.context().close();
});

test("a hovered floating card shows only its own bottom edge", async () => {
  expect(await hoverAndMeasure("floating")).toEqual({ toolbar: "0px none", card: "1px solid" });
  hoverGap = await toolbarGap(page, "floating");
});

test("the header toolbar keeps its line under the title", async () => {
  expect((await hoverAndMeasure("header")).toolbar).toBe("1px solid");
});

test("a touch screen shows the floating toolbar where a desktop hover puts it", async ({
  browser,
  browserName,
}) => {
  const phonePage = await newPage(browser, phone(browserName));
  try {
    await phonePage.goto(PAGE);
    await phonePage.waitForSelector("#floating[data-diagview-init]");
    test.skip(
      !(await phonePage.evaluate(() => matchMedia("(hover: none) or (pointer: coarse)").matches)),
      "This browser does not emulate a touch screen",
    );
    const controls = phonePage.locator(".diagview-wrapper:has(#floating) .diagview-controls");
    await expect(controls).toHaveCSS("opacity", "1");
    await expect(controls).toHaveCSS("transform", "none");
    expect(await toolbarGap(phonePage, "floating")).toBe(hoverGap);
  } finally {
    await phonePage.context().close();
  }
});
