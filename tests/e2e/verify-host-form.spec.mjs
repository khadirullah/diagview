// A diagram can sit inside the page's own <form>, as in a CMS editor. Its
// copy, download and fullscreen buttons do their job without submitting
// that form, in the floating and the header layout. Enter in a field of
// the form submits it through the page's own button, not a DiagView one.
//
// Runs offline on a file:// fixture. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { acceptDownloads: true });
  await page.goto(fixtureFile("host-form.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram", animateOpen: false }));
  for (const id of ["floating", "header"]) {
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

for (const id of ["floating", "header"]) {
  test(`the ${id} toolbar buttons leave the form alone`, async () => {
    const wrapper = page.locator(`.diagview-wrapper:has(#${id})`);
    const button = (action) => wrapper.locator(`.diagview-btn[data-action="${action}"]`);
    await wrapper.hover();

    // Copy may fail where the browser keeps the clipboard closed, which
    // does not matter here
    await button("copy").click();
    await page.waitForTimeout(300);

    const download = page.waitForEvent("download");
    await button("download").click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);

    await button("fullscreen").click();
    await expect(page.locator("#diagview-modal.open")).toHaveCount(1);
    await page.evaluate(() => DiagView.closeModal());
    await expect(page.locator("#diagview-modal.open")).toHaveCount(0);

    expect(await page.evaluate(() => window.__submits)).toEqual([]);
    expect(page.url()).toMatch(/host-form\.html$/);
  });
}

test("Enter in a field of the form submits it with the page's own button", async () => {
  await page.locator("#field").press("Enter");
  // The first submit button in the form gets the press. Before, that was
  // the copy button of the first diagram.
  await expect.poll(() => page.evaluate(() => window.__submits)).toEqual(["save"]);
});
