// The floating toolbar sits at the bottom of the card with no line of its
// own, so a hovered card shows one bottom edge. The header toolbar keeps
// the line that separates it from the diagram.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/floating-toolbar.html`;

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

// Bottom border of the toolbar and of its card, after hovering the card
async function hoverAndMeasure(id) {
  const wrapper = page.locator(`.diagview-wrapper:has(#${id})`);
  await wrapper.hover();
  const controls = wrapper.locator(".diagview-controls");
  await expect(controls).toHaveCSS("opacity", "1");
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
});

test("the header toolbar keeps its line under the title", async () => {
  expect((await hoverAndMeasure("header")).toolbar).toBe("1px solid");
});
