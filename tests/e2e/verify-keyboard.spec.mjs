// Keyboard use of the fullscreen viewer: the arrow keys on the open menu's
// button step into the menu instead of panning the diagram, and the open
// shortcuts panel keeps every shortcut away from the diagram behind it.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

const pan = () => page.evaluate(() => DiagView.state.activePanzoom.getPan());
const view = () =>
  page.evaluate(() => ({
    ...DiagView.state.activePanzoom.getPan(),
    scale: DiagView.state.activePanzoom.getScale(),
    rotation: DiagView.state.rotationAngle,
    meeting: !!document.querySelector("#diagview-modal-viewport.meeting"),
  }));
const helpOpen = () => page.evaluate(() => !!document.querySelector("#diagview-help-modal.show"));
async function openHelp() {
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(300);
  expect(await helpOpen()).toBe(true);
}

test.beforeAll(async ({ browser }) => {
  // Short enough that the shortcuts list scrolls
  page = await newPage(browser, { viewport: { width: 1280, height: 420 } });
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

test("the open shortcuts panel blocks every shortcut, arrows scroll its list", async () => {
  await page.evaluate(() => DiagView.configure({ helpTimeout: 0 }));
  await openHelp();
  const before = await view();
  for (const key of ["r", "Shift+Equal", "Minus", "0", "m", "l", "t", "f", "ArrowLeft"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  expect(await view()).toEqual(before);
  expect(await helpOpen()).toBe(true);

  const list = ".diagview-help-content";
  expect(await page.$eval(list, (el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  expect(await page.$eval(list, (el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await view()).toEqual(before);

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.className)).toBe("diagview-help-close");
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement.className)).toBe("diagview-help-close");
});

test("?, Escape, Enter and Space on the close button close the panel", async () => {
  for (const key of ["Shift+Slash", "Escape", "Enter", "Space"]) {
    if (!(await helpOpen())) await openHelp();
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect(await helpOpen(), key).toBe(false);
  }
  expect(await page.evaluate(() => DiagView.state.isModalOpen)).toBe(true);

  // Closed again, the shortcuts reach the diagram
  const before = await view();
  await page.focus("#diagview-modal");
  await page.keyboard.press("Shift+Equal");
  await page.waitForTimeout(400);
  expect((await view()).scale).toBeGreaterThan(before.scale);
});
