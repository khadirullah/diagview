// Keyboard use of the fullscreen viewer: the arrow keys on the open menu's
// button step into the menu instead of panning the diagram.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

const pan = () => page.evaluate(() => DiagView.state.activePanzoom.getPan());

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.evaluate(() => DiagView.default.openFullscreen(document.getElementById("diag")));
  await page.waitForTimeout(800);
});

test.afterAll(async () => {
  await page.context().close();
});

test("ArrowDown and ArrowUp on the open menu's button enter the menu", async () => {
  await page.click("#dv-toggle");
  await page.waitForTimeout(400);
  // Mark the first and last control the menu can focus, in document order
  await page.evaluate(() => {
    const all = [
      ...document.querySelectorAll(
        ".diagview-menu.active :is(button, a[href], input, [tabindex]:not([tabindex='-1']))",
      ),
    ].filter((el) => el.checkVisibility({ visibilityProperty: true }));
    all[0].dataset.edge = "first";
    all.at(-1).dataset.edge = "last";
  });
  const focused = () => page.evaluate(() => document.activeElement.dataset.edge);
  const before = await pan();

  await page.focus("#dv-toggle");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  expect(await focused()).toBe("first");

  await page.focus("#dv-toggle");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  expect(await focused()).toBe("last");

  expect(await pan()).toEqual(before);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.activeElement.id)).toBe("dv-toggle");
});
