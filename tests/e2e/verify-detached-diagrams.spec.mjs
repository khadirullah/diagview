// A single-page app that swaps routes without destroy(). A diagram that
// leaves the page is released: DiagView gives the removed subtree its own
// markup back, and an empty card left on the page goes. A route the app
// takes out and puts back before the observer runs keeps its cards, and one
// put back later gets them again. Both open fullscreen. destroy() then puts
// back the page as it was.
//
// Runs offline on a file:// fixture. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

/** More than the observer's 100 ms wait */
const settle = () => page.waitForTimeout(400);

/** State of each diagram, found through the route even when off the page */
const look = () =>
  page.evaluate(() =>
    ["flow", "steps"].map((id) => {
      const el = window.__route.querySelector(`#${id}`);
      return {
        id,
        onPage: el.isConnected,
        init: !!el.dataset.diagviewInit,
        inCard: !!el.closest(".diagview-wrapper"),
        parent: el.parentElement?.id || el.parentElement?.className,
      };
    }),
  );

const openFrom = async (id) => {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await page.waitForSelector(`#${id}[data-diagview-init]`);
  // The toolbar shows on hover
  await page.locator(`#${id}`).hover();
  await page
    .locator(`.diagview-wrapper:has(#${id}) [data-action="fullscreen"]`)
    .click({ timeout: 5000 });
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
  const shown = await page.evaluate(() => !!document.querySelector("#diagview-modal.open svg"));
  await page.evaluate(() => DiagView.closeModal());
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  await page.waitForTimeout(300);
  return shown;
};

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(fixtureFile("detached-diagrams.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    window.__route = document.getElementById("route-a");
    window.__before = document.body.innerHTML;
    window.__flow = document.getElementById("flow").outerHTML;
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram", animateOpen: false }));
  for (const id of ["flow", "steps"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("a route taken out and put back at once keeps its cards and opens fullscreen", async () => {
  const same = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll(".diagview-wrapper")];
    const outlet = document.getElementById("outlet");
    // Out for a moment, as a framework moving or remounting a node does
    window.__route.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    outlet.appendChild(window.__route);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const now = [...document.querySelectorAll(".diagview-wrapper")];
    return now.length === 2 && now.every((card, i) => card === cards[i]);
  });
  expect(same).toBe(true);
  expect(await openFrom("flow")).toBe(true);
});

test("a route swapped out is released and keeps none of DiagView's markup", async () => {
  const before = await page.evaluate(() => window.__before);
  await page.evaluate(() => {
    window.__route.remove();
    const next = document.createElement("section");
    next.id = "route-b";
    next.innerHTML = "<h2>Route B</h2><p>No diagrams here</p>";
    document.getElementById("outlet").appendChild(next);
  });
  await settle();

  expect(await look()).toEqual([
    { id: "flow", onPage: false, init: false, inCard: false, parent: "route-a" },
    { id: "steps", onPage: false, init: false, inCard: false, parent: "route-a" },
  ]);
  // The route holds its own markup again, as the app wrote it
  const routeNow = await page.evaluate(() => window.__route.outerHTML);
  expect(before).toContain(routeNow);
  expect(await page.locator(".diagview-wrapper").count()).toBe(0);
});

test("a route put back later gets its cards again and opens fullscreen", async () => {
  await page.evaluate(() => {
    document.getElementById("route-b").remove();
    document.getElementById("outlet").appendChild(window.__route);
  });
  await settle();
  expect(await openFrom("steps")).toBe(true);
  expect(await look()).toEqual([
    { id: "flow", onPage: true, init: true, inCard: true, parent: "diagview-viewport" },
    { id: "steps", onPage: true, init: true, inCard: true, parent: "diagview-viewport" },
  ]);
  expect(await page.locator(".diagview-wrapper").count()).toBe(2);
});

test("a diagram the page removes from inside its card takes the empty card with it, and destroy restores the other", async () => {
  await page.evaluate(() => window.__route.querySelector("#steps").remove());
  await settle();
  const left = await page.evaluate(() => ({
    cards: document.querySelectorAll(".diagview-wrapper").length,
    steps: !!document.getElementById("steps"),
    flowInCard: !!document.querySelector("#flow").closest(".diagview-wrapper"),
  }));
  expect(left).toEqual({ cards: 1, steps: false, flowInCard: true });

  const after = await page.evaluate(async () => {
    await DiagView.destroy();
    const flow = document.getElementById("flow");
    return {
      flow: flow.outerHTML === window.__flow,
      parent: flow.parentElement.id,
      cards: document.querySelectorAll(".diagview-wrapper").length,
      marked: document.querySelectorAll("[data-diagview-init], [data-diagview-index]").length,
    };
  });
  expect(after).toEqual({ flow: true, parent: "route-a", cards: 0, marked: 0 });
});
