// diagramSelector can match an <svg> itself, with no container around it.
// Such an SVG gets the same card and toolbar as a container, at its own
// size, and fits a phone screen. It opens fullscreen, searches and exports,
// and layout "off" puts it in the tab order. An <svg> drawn inside another
// SVG is left alone, and an empty one gets its card once something is drawn
// in it. destroy() puts back the same nodes in the same places.
//
// Runs offline on a file:// fixture. DV_DIST=/path/to/diagview.umd.js tests
// another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

/** Open the fixture and set DiagView up on every svg.diagram */
async function load(browser, options = {}) {
  const page = await newPage(browser, { acceptDownloads: true, ...options });
  await page.goto(fixtureFile("bare-svg.html"));
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    // The page as it was, and the nodes a framework would hold on to
    window.__before = document.body.innerHTML;
    window.__nodes = ["header-svg", "wide-svg", "off-svg", "boxed"].map((id) => {
      const el = document.getElementById(id);
      return { el, parent: el.parentNode, next: el.nextSibling };
    });
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ diagramSelector: ".diagram", animateOpen: false }));
  for (const id of ["header-svg", "wide-svg", "off-svg", "box"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return page;
}

/** Width of an SVG and its gaps to the content box of its card */
const fit = (page, id) =>
  page.evaluate((id) => {
    const svg = document.getElementById(id);
    const card = svg.closest(".diagview-viewport");
    const cs = getComputedStyle(card);
    const box = card.getBoundingClientRect();
    const left = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const right = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const r = svg.getBoundingClientRect();
    return {
      width: r.width,
      card: right - left,
      leftGap: r.left - left,
      rightGap: right - r.right,
    };
  }, id);

const near = (actual, expected, label) =>
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual} should be ${expected}`,
  ).toBeLessThanOrEqual(1);

const waitOpen = (page) =>
  page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );

async function close(page) {
  await page.evaluate(() => DiagView.closeModal());
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  await page.waitForTimeout(300);
}

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await load(browser);
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("an svg the selector matches gets a card and a toolbar where it stood", async () => {
  const cards = await page.evaluate(() =>
    ["header-svg", "wide-svg"].map((id) => {
      const svg = document.getElementById(id);
      const wrapper = svg.closest(".diagview-wrapper");
      return {
        inViewport: svg.parentElement.classList.contains("diagview-viewport"),
        buttons: wrapper.querySelectorAll(".diagview-btn").length,
        label: !!wrapper.querySelector(".diagview-controls:not(.diagview-controls-floating)"),
        before: wrapper.previousElementSibling?.id || wrapper.previousElementSibling?.textContent,
        after: wrapper.nextElementSibling?.id || wrapper.nextElementSibling?.textContent,
      };
    }),
  );
  expect(cards).toEqual([
    {
      inViewport: true,
      buttons: 3,
      label: true,
      before: "Before the diagram",
      after: "After the diagram",
    },
    { inViewport: true, buttons: 3, label: false, before: "host", after: "off-svg" },
  ]);

  const kept = await page.evaluate(() => {
    const svg = document.getElementById("header-svg");
    return {
      classes: [...svg.classList].filter((c) => c !== "dv-svg-content"),
      data: svg.getAttribute("data-x"),
      outline: svg.style.outlineWidth,
    };
  });
  expect(kept).toEqual({ classes: ["diagram", "flow"], data: "kept", outline: "0px" });
});

test("it shows at its own width, centred, and a wider one fits the card", async () => {
  const own = await fit(page, "header-svg");
  near(own.width, 360, "header-svg width");
  near(own.leftGap, own.rightGap, "header-svg left gap against right gap");

  const wide = await fit(page, "wide-svg");
  near(wide.width, wide.card, "wide-svg width against the card");
});

test("on a phone every card fits the screen", async ({ browser, browserName }) => {
  const small = await load(browser, phone(browserName));
  const sizes = await small.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    widest: Math.max(
      ...[...document.querySelectorAll(".diagview-wrapper")].map(
        (w) => w.getBoundingClientRect().right,
      ),
    ),
  }));
  expect(sizes.page).toBeLessThanOrEqual(390);
  expect(sizes.widest).toBeLessThanOrEqual(390);
  for (const id of ["header-svg", "wide-svg"]) {
    const s = await fit(small, id);
    expect(s.width, id).toBeLessThanOrEqual(s.card + 1);
    expect(s.leftGap, id).toBeGreaterThanOrEqual(-1);
  }
  await small.context().close();
});

test("the toolbar opens it fullscreen and search finds its labels", async () => {
  await page.locator("#header-svg").hover();
  await page.evaluate(() =>
    document
      .getElementById("header-svg")
      .closest(".diagview-wrapper")
      .querySelector('[data-action="fullscreen"]')
      .click(),
  );
  await waitOpen(page);
  await page.evaluate(() => {
    const input = document.getElementById("diagview-search");
    input.value = "Payment";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page
    .waitForFunction(() => DiagView.default.state.searchMatches.length > 0, null, { timeout: 5000 })
    .catch(() => {});
  const shown = await page.evaluate(() => ({
    labels: [...document.querySelectorAll("#diagview-modal .diagview-rotator > svg text")].map(
      (t) => t.textContent,
    ),
    matches: DiagView.default.state.searchMatches.length,
  }));
  expect(shown).toEqual({ labels: ["Checkout", "Payment"], matches: 1 });
  await close(page);
});

test("the toolbar's download saves a PNG named after its title", async () => {
  const download = page.waitForEvent("download", { timeout: 30000 });
  await page.evaluate(() =>
    document
      .getElementById("header-svg")
      .closest(".diagview-wrapper")
      .querySelector('[data-action="download"]')
      .click(),
  );
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^order_pipeline_\d{4}-\d\d-\d\d_\d{6}\.png$/);
});

test("with layout off it is a button in the tab order that Enter opens", async () => {
  const off = await page.evaluate(() => {
    const svg = document.getElementById("off-svg");
    return {
      wrapped: !!svg.closest(".diagview-wrapper"),
      tabindex: svg.getAttribute("tabindex"),
      role: svg.getAttribute("role"),
    };
  });
  expect(off).toEqual({ wrapped: false, tabindex: "0", role: "button" });
  await page.focus("#off-svg");
  await page.keyboard.press("Enter");
  await waitOpen(page);
  await close(page);
});

test("an svg inside another svg, or inside a matched box, gets no toolbar of its own", async () => {
  const nested = await page.evaluate(() => ({
    inner: document.getElementById("inner").hasAttribute("data-diagview-init"),
    innerParent: document.getElementById("inner").parentElement.id,
    boxed: document.getElementById("boxed").hasAttribute("data-diagview-init"),
    boxWrappers: document.getElementById("box").closest(".diagview-wrapper")
      ? document.getElementById("box").querySelectorAll(".diagview-wrapper").length
      : -1,
  }));
  expect(nested).toEqual({ inner: false, innerParent: "outer", boxed: false, boxWrappers: 0 });
});

test("an empty svg gets its card once something is drawn in it", async () => {
  await page.locator("#late").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.getElementById("late").dataset.diagviewInit)).toBe(
    undefined,
  );
  await page.evaluate(() => {
    const svg = document.getElementById("late");
    svg.innerHTML =
      '<rect x="5" y="5" width="290" height="70" rx="8" fill="#fef3c7" stroke="#b45309"/><text x="150" y="45" text-anchor="middle">Drawn later</text>';
  });
  await page.waitForSelector("#late[data-diagview-init]");
  expect(
    await page.evaluate(
      () => !!document.getElementById("late").closest(".diagview-wrapper .diagview-viewport"),
    ),
  ).toBe(true);
});

test("destroy puts back the same nodes in the same places", async () => {
  const back = await page.evaluate(async () => {
    await DiagView.destroy();
    document.getElementById("late").replaceChildren();
    return {
      same: document.body.innerHTML === window.__before,
      nodes: window.__nodes.every(
        ({ el, parent, next }) => el.parentNode === parent && el.nextSibling === next,
      ),
    };
  });
  expect(back).toEqual({ same: true, nodes: true });
});
