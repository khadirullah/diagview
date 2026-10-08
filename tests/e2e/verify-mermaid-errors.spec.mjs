// A Mermaid diagram with a syntax error shows DiagView's error box. When
// the page renders the fixed code into the same element, as a live editor
// or hot reload does, the diagram gets its toolbar without a refresh().
// A working diagram that the page renders again with an error gives up its
// toolbar for the error box, also while the viewer is open, and destroy()
// and init() after all that leave one toolbar.
//
// Mermaid 12, 11 and 10 come from jsdelivr, so this needs network access.
// DV_DIST=/path/to/diagview.umd.js tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const BROKEN = "flowchart TD\n  A[Start] --> B{Check\n";
const FIXED = "flowchart TD\n  A[Start] --> B{Check}\n  B --> C[Done]\n";

/**
 * Open the fixture with Mermaid `version` and set DiagView up. With `start`
 * Mermaid renders the broken code itself on load, otherwise render() does.
 */
async function load(browser, version, { start = false, options = {} } = {}) {
  const page = await newPage(browser, options);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto(`${fixtureFile("mermaid-errors.html")}?v=${version}${start ? "&start=1" : ""}`);
  await page.waitForFunction(() => window.mermaid);
  if (start) await page.waitForSelector("#live svg");
  else await page.evaluate((code) => window.render(code), BROKEN);
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() =>
    DiagView.init({ diagramSelector: ".mermaid", animateOpen: false, showKeyboardHelp: false }),
  );
  await page.waitForSelector("#live[data-diagview-init]");
  return { page, errors };
}

/** What DiagView shows for the diagram right now */
const look = (page) =>
  page.evaluate(() => {
    const el = document.getElementById("live");
    const svg = [...el.querySelectorAll("svg")].find((s) => !s.closest(".diagview-error"));
    return {
      error: el.dataset.diagviewError === "1",
      errorBoxes: el.querySelectorAll(".diagview-error").length,
      wrappers: document.querySelectorAll(".diagview-wrapper").length,
      wrapped: !!el.closest(".diagview-wrapper"),
      svgShown: !!svg && getComputedStyle(svg).display !== "none",
      roleDescription: svg?.getAttribute("aria-roledescription"),
    };
  });

/** Open the viewer from the floating toolbar, which shows on hover */
async function openFromToolbar(page) {
  await page.locator(".diagview-wrapper").hover();
  await page.locator(".diagview-wrapper [data-action='fullscreen']").click();
  await expect(page.locator("#diagview-modal.open")).toBeVisible();
}

const ERROR_STATE = { error: true, errorBoxes: 1, wrappers: 0, wrapped: false, svgShown: false };
const WORKING = { error: false, errorBoxes: 0, wrappers: 1, wrapped: true, svgShown: true };

for (const version of ["12", "11", "10"]) {
  test(`Mermaid ${version}: a diagram fixed in place gets its toolbar`, async ({ browser }) => {
    const { page, errors } = await load(browser, version);
    expect(await look(page)).toMatchObject({ ...ERROR_STATE, roleDescription: "error" });

    await page.evaluate((code) => window.render(code), FIXED);
    await page.waitForSelector("#live[data-diagview-id]");
    expect(await look(page)).toMatchObject({ ...WORKING, roleDescription: "flowchart-v2" });

    // The new toolbar opens the fixed diagram
    await openFromToolbar(page);
    await expect(page.locator("#diagview-modal-viewport svg")).toHaveAttribute(
      "aria-roledescription",
      "flowchart-v2",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#diagview-modal.open")).toHaveCount(0);

    expect(errors).toEqual([]);
    await page.context().close();
  });
}

test("a working diagram that breaks shows the error box, and recovers", async ({ browser }) => {
  const { page, errors } = await load(browser, "12");
  await page.evaluate((code) => window.render(code), FIXED);
  await page.waitForSelector("#live[data-diagview-id]");

  // Typing breaks it again
  await page.evaluate((code) => window.render(code), BROKEN);
  await page.waitForSelector("#live[data-diagview-error]");
  expect(await look(page)).toMatchObject(ERROR_STATE);

  // A second broken render keeps one error box and hides Mermaid's picture
  await page.evaluate((code) => window.render(code), BROKEN.replace("Check", "Look"));
  await page.waitForTimeout(400);
  expect(await look(page)).toMatchObject(ERROR_STATE);

  await page.evaluate((code) => window.render(code), FIXED);
  await page.waitForSelector("#live[data-diagview-id]");
  expect(await look(page)).toMatchObject(WORKING);

  // destroy() leaves the plain element in its container, init() sets it up once
  await page.evaluate(() => DiagView.destroy());
  expect(
    await page.evaluate(() => {
      const el = document.getElementById("live");
      return {
        parent: el.parentElement.className,
        data: Object.keys(el.dataset).filter((k) => k.startsWith("diagview")),
      };
    }),
  ).toEqual({ parent: "card", data: [] });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".mermaid", animateOpen: false }));
  await page.waitForSelector("#live[data-diagview-id]");
  expect(await look(page)).toMatchObject(WORKING);

  expect(errors).toEqual([]);
  await page.context().close();
});

test("a diagram that breaks while the viewer is open", async ({ browser }) => {
  const { page, errors } = await load(browser, "12");
  await page.evaluate((code) => window.render(code), FIXED);
  await page.waitForSelector("#live[data-diagview-id]");

  await openFromToolbar(page);
  await page.evaluate((code) => window.render(code), BROKEN);
  await page.waitForSelector("#live[data-diagview-error]");

  // The viewer keeps the diagram it opened with and closes cleanly
  await expect(page.locator("#diagview-modal-viewport svg")).toHaveAttribute(
    "aria-roledescription",
    "flowchart-v2",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  expect(await look(page)).toMatchObject(ERROR_STATE);

  expect(errors).toEqual([]);
  await page.context().close();
});
