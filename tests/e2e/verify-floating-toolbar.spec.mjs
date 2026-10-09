// The floating toolbar sits at the bottom of the card with no line of its
// own, so a hovered card shows one bottom edge. The header toolbar keeps
// the line that separates it from the diagram. A touch screen shows the
// toolbar without a hover, at the same spot a desktop hover puts it, with
// buttons big enough for a finger. A tap leaves no hover look behind, on
// the page or in the viewer.
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

// Sizes of the toolbar buttons, and whether they sit in one row inside the card
const toolbarFit = (page, id) =>
  page.evaluate((id) => {
    const wrap = document.getElementById(id).closest(".diagview-wrapper");
    const card = wrap.getBoundingClientRect();
    const btns = [...wrap.querySelectorAll(".diagview-controls .diagview-btn")].map((b) =>
      b.getBoundingClientRect(),
    );
    return {
      // WebKit on a phone reports 44.00001
      sizes: [...new Set(btns.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`))],
      oneRow: new Set(btns.map((r) => Math.round(r.top))).size === 1,
      inside: btns.every((r) => r.left >= card.left && r.right <= card.right),
    };
  }, id);

// Card shadow, and the first button's look next to the second one's
const hoverLook = (page, id) =>
  page.evaluate((id) => {
    const wrap = document.getElementById(id).closest(".diagview-wrapper");
    const [first, second] = [...wrap.querySelectorAll(".diagview-btn")].map((b) => {
      const cs = getComputedStyle(b);
      return `${cs.backgroundColor} ${cs.transform} ${cs.borderTopLeftRadius}`;
    });
    return { shadow: getComputedStyle(wrap).boxShadow, first, second };
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

test("a desktop keeps its 36px floating and 34px header buttons", async () => {
  expect((await toolbarFit(page, "floating")).sizes).toEqual(["36x36"]);
  expect((await toolbarFit(page, "header")).sizes).toEqual(["34x34"]);
});

test("a touch screen gives the toolbar buttons 44px and keeps them in one row on a 320px phone", async ({
  browser,
  browserName,
}) => {
  const phonePage = await newPage(browser, phone(browserName));
  try {
    await phonePage.goto(PAGE);
    await phonePage.waitForSelector("#header[data-diagview-init]");
    test.skip(
      !(await phonePage.evaluate(() => matchMedia("(hover: none) or (pointer: coarse)").matches)),
      "This browser does not emulate a touch screen",
    );
    for (const width of [390, 320]) {
      await phonePage.setViewportSize({ width, height: 844 });
      for (const id of ["floating", "header"]) {
        expect(await toolbarFit(phonePage, id), `${id} at ${width}px`).toEqual({
          sizes: ["44x44"],
          oneRow: true,
          inside: true,
        });
      }
    }
  } finally {
    await phonePage.context().close();
  }
});

test("a desktop hover still lifts the card and the button under the pointer", async () => {
  const wrapper = page.locator(".diagview-wrapper:has(#floating)");
  const first = wrapper.locator(".diagview-btn").first();
  // Headless WebKit can drop a hover, so hover again until it holds
  await expect(async () => {
    await wrapper.hover();
    await first.hover();
    await expect(first).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -1)", { timeout: 1000 });
    const look = await hoverLook(page, "floating");
    expect(look.shadow).not.toBe("none");
    expect(look.first).not.toBe(look.second);
  }).toPass();
});

test("a tap on a touch screen leaves no hover look on the card or its button", async ({
  browser,
  browserName,
}) => {
  const phonePage = await newPage(browser, phone(browserName));
  try {
    await phonePage.goto(PAGE);
    await phonePage.waitForSelector("#header[data-diagview-init]");
    test.skip(
      !(await phonePage.evaluate(() => matchMedia("(hover: none)").matches)),
      "This browser does not emulate a touch screen",
    );
    for (const id of ["floating", "header"]) {
      // Copy leaves the page as it is. Wait for its tick to come and go,
      // where the browser allows the copy.
      const copy = phonePage.locator(`.diagview-wrapper:has(#${id}) .diagview-btn`).first();
      await copy.tap();
      await expect(copy)
        .toHaveClass(/success/, { timeout: 3000 })
        .catch(() => {});
      await expect(copy).not.toHaveClass(/success/, { timeout: 5000 });
      await phonePage.waitForTimeout(400);
      const look = await hoverLook(phonePage, id);
      expect(look.shadow, `${id} card`).toBe("none");
      expect(look.first, `${id} button`).toBe(look.second);
    }
  } finally {
    await phonePage.context().close();
  }
});

test("a tap in the viewer leaves no hover look on the menu button it hit", async ({
  browser,
  browserName,
}) => {
  const phonePage = await newPage(browser, phone(browserName));
  try {
    await phonePage.goto(PAGE);
    await phonePage.waitForSelector("#floating[data-diagview-init]");
    test.skip(
      !(await phonePage.evaluate(() => matchMedia("(hover: none)").matches)),
      "This browser does not emulate a touch screen",
    );
    await phonePage.locator(".diagview-wrapper:has(#floating) [data-action=fullscreen]").tap();
    await phonePage.locator(".diagview-fab-btn").tap();
    const zoomOut = phonePage.locator("#dv-zoomout");
    await expect(zoomOut).toBeVisible();
    await zoomOut.tap();
    await phonePage.waitForTimeout(400);
    const [tapped, other] = await phonePage.evaluate(() =>
      ["dv-zoomout", "dv-zoomin"].map((id) => {
        const cs = getComputedStyle(document.getElementById(id));
        return `${cs.backgroundColor} ${cs.color} ${cs.transform}`;
      }),
    );
    expect(tapped).toBe(other);
  } finally {
    await phonePage.context().close();
  }
});
