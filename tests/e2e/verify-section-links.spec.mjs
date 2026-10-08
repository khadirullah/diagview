// A #section link inside a diagram in the viewer closes the viewer and
// scrolls the page there. The viewer's copy prefixes its ids, so a link to
// a part of the diagram must land on the page's own copy of that part. A
// link to the section the address already names must still scroll.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/section-links.html`;

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(PAGE);
  await page.waitForSelector("#diag.diagview-wrapper, #diag .diagview-wrapper, .diagview-wrapper");
});

test.afterAll(async () => {
  await page.context().close();
});

async function clickInViewer(href, startY = 0) {
  await page.evaluate((y) => window.scrollTo(0, y), startY);
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForSelector("#diagview-modal.open");
  await page.waitForTimeout(400);
  const link = page
    .locator(
      `#diagview-modal-viewport a[href$="${href}"], #diagview-modal-viewport a[*|href$="${href}"]`,
    )
    .first();
  await link.dispatchEvent("click");
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  await page.waitForTimeout(600);
}

/** Top of an element relative to the window, after the jump */
const topOf = (sel) =>
  page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, sel);

test("a link to a part of the diagram lands on the page's copy of it", async () => {
  // Start below the diagram, which is taller than the window. Firefox
  // scrolls to the top of the SVG on its own, so the part was off screen.
  await clickInViewer("node2", 2000);
  expect(await page.evaluate(() => location.hash)).toBe("#node2");
  const box = await page.evaluate(() => {
    const r = document.getElementById("node2").getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: window.innerHeight };
  });
  expect(box.top).toBeGreaterThanOrEqual(-1);
  expect(box.top).toBeLessThanOrEqual(1);
  expect(box.bottom).toBeLessThanOrEqual(box.height);
});

test("a link to a page section scrolls there", async () => {
  await clickInViewer("details");
  expect(await page.evaluate(() => location.hash)).toBe("#details");
  expect(Math.abs(await topOf("#details"))).toBeLessThan(5);
});

test("the same link again still scrolls, though the address already has it", async () => {
  await clickInViewer("details");
  expect(await page.evaluate(() => location.hash)).toBe("#details");
  expect(Math.abs(await topOf("#details"))).toBeLessThan(5);
});

test("a part of the diagram lands under the page's scroll-padding", async () => {
  // A page with a sticky header sets scroll-padding-top to keep targets
  // out from under it
  await page.evaluate(() => {
    history.replaceState(null, "", location.pathname);
    document.documentElement.style.scrollPaddingTop = "60px";
  });
  await clickInViewer("node2", 2000);
  const top = await topOf("#node2");
  await page.evaluate(() => (document.documentElement.style.scrollPaddingTop = ""));
  expect(top).toBeGreaterThanOrEqual(59);
  expect(top).toBeLessThanOrEqual(61);
});
