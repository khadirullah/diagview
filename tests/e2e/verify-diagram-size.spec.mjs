// Diagrams on the page show at their own size, centred in the card, and
// shrink only when the card is narrower. A tall diagram keeps its own
// height, and the card around a short one hugs it. A wrapper between the diagram element and its SVG does not change
// that size, and a caption sits under the diagram. A page rule can still
// make every diagram, or chosen ones, fill the card, --dv-max-height caps
// the height, and fullscreen ignores both.
//
// Runs offline: the page is file:// and the Mermaid diagram is static
// Mermaid output, so no Mermaid is loaded. DV_DIST=/path/to/diagview.umd.js
// tests another build.
import { test, expect } from "@playwright/test";
import { DIST, newPage, fixtureFile } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

// Own width and height of each diagram in the fixture. An SVG with only a
// viewBox has no width of its own and fills the card.
const DIAGRAMS = {
  mermaid: { width: 360, height: 418 },
  nested: { width: 360, height: 418 },
  fixed: { width: 311, height: 312 },
  wide: { width: 1000, height: 200 },
  viewbox: { width: Infinity, height: 240 / 520 },
  figure: { width: 520, height: 240 },
  tall: { width: 415, height: 2192 },
  short: { width: 400, height: 51 },
};
const IDS = Object.keys(DIAGRAMS);

// The longer selector beats DiagView's own rule, which it adds at init
const FULL_WIDTH =
  ".diagview-wrapper .diagview-viewport svg { width: 100% !important; max-width: 100% !important; }";
const BIG = ".diagview-viewport .big svg { width: 100% !important; max-width: 100% !important; }";
// The height cap a page can bring back, set on the page, a card, a viewport
// or the diagram element
const CAPS = {
  root: ":root { --dv-max-height: 80vh; }",
  diagram: "#tall { --dv-max-height: 80vh; }",
  wrapper: ".diagview-wrapper { --dv-max-height: 80vh; }",
  viewport: ".diagview-viewport { --dv-max-height: 80vh; }",
};

const phone = (browserName) => ({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // Firefox has no mobile emulation
  ...(browserName === "firefox" ? {} : { isMobile: true }),
  hasTouch: true,
});

/**
 * Open the fixture and set DiagView up on every diagram. `css` goes in a
 * style tag in <head> before init, `big` gets class "big".
 */
async function load(browser, { options = {}, css = "", big = [] } = {}) {
  const page = await newPage(browser, options);
  await page.goto(fixtureFile("diagram-size.html"));
  await page.evaluate(
    ({ css, big }) => {
      localStorage.setItem("diagview-canvas-hint-shown", "true");
      document.documentElement.setAttribute("data-diagview-no-auto-init", "");
      if (css) {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      }
      for (const id of big) document.getElementById(id).classList.add("big");
    },
    { css, big },
  );
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() =>
    DiagView.init({ diagramSelector: ".diagram, .mermaid", animateOpen: false }),
  );
  // Diagrams are set up as they scroll into view
  for (const id of IDS) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForSelector(`#${id}[data-diagview-init]`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return page;
}

/** Size of each diagram's SVG and its gaps to the card's content box */
const measure = (page) =>
  page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const card = el.closest(".diagview-viewport");
      const cs = getComputedStyle(card);
      const box = card.getBoundingClientRect();
      const left = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const right = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const svg = el.querySelector("svg").getBoundingClientRect();
      out[id] = {
        width: svg.width,
        height: svg.height,
        card: right - left,
        leftGap: svg.left - left,
        rightGap: right - svg.right,
      };
    }
    return out;
  }, IDS);

const near = (actual, expected, label) =>
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual} should be ${expected}`,
  ).toBeLessThanOrEqual(1);

/** Width the diagram should show at in a card of this width */
const expectedWidth = (id, card) => Math.min(DIAGRAMS[id].width, card);

/** Height that keeps the diagram's aspect ratio at the width it shows at */
const expectedHeight = (id, width) => {
  const { width: w, height: h } = DIAGRAMS[id];
  return w === Infinity ? width * h : (width * h) / w;
};

/** Open fullscreen and measure the diagram in the viewer */
async function fullscreenSize(page, id) {
  await page.evaluate((id) => DiagView.openFullscreen(document.getElementById(id)), id);
  const svg = page.locator("#diagview-modal .diagview-rotator > svg");
  await expect(svg).toBeVisible();
  await page.waitForTimeout(500);
  const box = await svg.boundingBox();
  await page.evaluate(() => DiagView.closeModal());
  await expect(svg).toHaveCount(0);
  return { width: box.width, height: box.height };
}

/** @type {import("@playwright/test").Page} */
let page;
/** @type {Awaited<ReturnType<typeof measure>>} */
let sizes;

test.beforeAll(async ({ browser }) => {
  page = await load(browser);
  sizes = await measure(page);
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

test("each diagram shows at its own width, centred in its card", async () => {
  for (const id of ["mermaid", "nested", "fixed", "figure", "short"]) {
    const s = sizes[id];
    near(s.width, DIAGRAMS[id].width, `${id} width`);
    near(s.leftGap, s.rightGap, `${id} left gap against right gap`);
  }
});

test("a Mermaid diagram inside a wrapper keeps the size it has on its own", async () => {
  near(sizes.nested.width, sizes.mermaid.width, "nested width");
  near(sizes.nested.height, sizes.mermaid.height, "nested height");
});

test("a diagram wider than the card and one with only a viewBox fill the card", async () => {
  for (const id of ["wide", "viewbox"]) {
    near(sizes[id].width, sizes[id].card, `${id} width`);
    near(sizes[id].leftGap, 0, `${id} left gap`);
  }
});

test("no diagram is wider than its card and each keeps its aspect ratio", async () => {
  for (const id of IDS) {
    const s = sizes[id];
    expect(s.width, `${id} width`).toBeLessThanOrEqual(s.card + 1);
    expect(s.height, `${id} height`).toBeGreaterThan(0);
    near(s.width, expectedWidth(id, s.card), `${id} width`);
    near(s.height, expectedHeight(id, s.width), `${id} height`);
  }
});

test("a caption sits under its diagram", async () => {
  const { svg, caption } = await page.evaluate(() => {
    const figure = document.getElementById("figure");
    return {
      svg: figure.querySelector("svg").getBoundingClientRect().toJSON(),
      caption: figure.querySelector("figcaption").getBoundingClientRect().toJSON(),
    };
  });
  expect(caption.height).toBeGreaterThan(0);
  expect(caption.top).toBeGreaterThanOrEqual(svg.bottom - 1);
  // Under it, not beside it
  expect(caption.left).toBeLessThan(svg.right);
});

test("on a phone every diagram fits the card width", async ({ browser, browserName }) => {
  const phonePage = await load(browser, { options: phone(browserName) });
  const phoneSizes = await measure(phonePage);
  for (const id of IDS) {
    const s = phoneSizes[id];
    // The card is narrower than most diagrams
    expect(s.card, `${id} card`).toBeLessThan(DIAGRAMS.mermaid.width);
    near(s.width, expectedWidth(id, s.card), `${id} width`);
    near(s.height, expectedHeight(id, s.width), `${id} height`);
    near(s.leftGap, s.rightGap, `${id} left gap against right gap`);
  }
});

test("a full-width page rule makes every diagram fill the card", async ({ browser }) => {
  const rulePage = await load(browser, { css: FULL_WIDTH });
  const ruleSizes = await measure(rulePage);
  for (const id of IDS) {
    const s = ruleSizes[id];
    near(s.width, s.card, `${id} width`);
    near(s.height, expectedHeight(id, s.width), `${id} height`);
  }
});

test("a per-diagram page rule makes only the chosen diagram fill the card", async ({ browser }) => {
  const bigPage = await load(browser, { css: BIG, big: ["mermaid"] });
  const bigSizes = await measure(bigPage);
  near(bigSizes.mermaid.width, bigSizes.mermaid.card, "mermaid width");
  for (const id of IDS.filter((id) => id !== "mermaid")) {
    near(bigSizes[id].width, sizes[id].width, `${id} width`);
  }
});

test("fullscreen shows a diagram at the same size with or without the page rule", async ({
  browser,
}) => {
  const rulePage = await load(browser, { css: FULL_WIDTH });
  for (const id of ["mermaid", "fixed", "figure", "tall"]) {
    const plain = await fullscreenSize(page, id);
    const ruled = await fullscreenSize(rulePage, id);
    expect(plain.width, `${id} fullscreen width`).toBeGreaterThan(0);
    near(ruled.width, plain.width, `${id} fullscreen width`);
    near(ruled.height, plain.height, `${id} fullscreen height`);
  }
});

test("a tall diagram keeps its own height, and fullscreen still fits it to the screen", async () => {
  const s = sizes.tall;
  near(s.width, DIAGRAMS.tall.width, "tall width");
  near(s.height, DIAGRAMS.tall.height, "tall height");
  const { innerWidth, innerHeight } = await page.evaluate(() => ({ innerWidth, innerHeight }));
  expect(s.height, "tall height against the window").toBeGreaterThan(innerHeight);
  // The drawing, not the SVG box, which spans the viewer
  await page.evaluate(() => DiagView.openFullscreen(document.getElementById("tall")));
  const drawing = page.locator("#diagview-modal .diagview-rotator > svg g.root");
  await expect(drawing).toBeVisible();
  await page.waitForTimeout(500);
  const full = await drawing.boundingBox();
  await page.evaluate(() => DiagView.closeModal());
  await expect(drawing).toHaveCount(0);
  expect(full.y, "tall fullscreen top").toBeGreaterThanOrEqual(0);
  expect(full.y + full.height, "tall fullscreen bottom").toBeLessThanOrEqual(innerHeight);
  expect(full.width, "tall fullscreen width").toBeLessThanOrEqual(innerWidth);
  // Fitted to the screen height, not left at a sliver
  expect(full.height, "tall fullscreen height").toBeGreaterThan(innerHeight / 2);
});

test("--dv-max-height on the page, a card, a viewport or a diagram caps the height", async ({
  browser,
}) => {
  for (const [where, css] of Object.entries(CAPS)) {
    const capPage = await load(browser, { css });
    const capSizes = await measure(capPage);
    const maxHeight = 0.8 * (await capPage.evaluate(() => innerHeight));
    near(capSizes.tall.height, maxHeight, `${where}: tall height`);
    near(
      capSizes.tall.width,
      expectedWidth("tall", maxHeight * (415 / 2192)),
      `${where}: tall width`,
    );
    // A diagram shorter than the cap keeps its own size
    near(capSizes.fixed.height, DIAGRAMS.fixed.height, `${where}: fixed height`);
    // Fullscreen ignores the cap
    const plain = await fullscreenSize(page, "tall");
    const capped = await fullscreenSize(capPage, "tall");
    near(capped.height, plain.height, `${where}: tall fullscreen height`);
    await capPage.context().close();
  }
});

test("--dv-max-height caps a diagram in a shadow root too", async ({ browser }) => {
  // Set on the page, it reaches into the shadow root. Set in the shadow
  // root's own style, it applies there.
  for (const [where, outer, inner] of [
    ["page", CAPS.root, ""],
    ["shadow root", "", CAPS.wrapper],
  ]) {
    const shadowPage = await load(browser, { css: outer });
    const height = await shadowPage.evaluate(async (inner) => {
      const host = document.createElement("div");
      document.body.prepend(host);
      const root = host.attachShadow({ mode: "open" });
      const svg = document
        .querySelector("#tall svg")
        .outerHTML.replace("mermaid-tall", "shadow-tall");
      root.innerHTML = `<style>${inner}</style><pre class="mermaid">${svg}</pre>`;
      DiagView.initShadowRoot(root);
      const el = root.querySelector(".mermaid");
      for (let i = 0; i < 50 && !el.dataset.diagviewInit; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!el.closest(".diagview-viewport")) return -1;
      return el.querySelector("svg").getBoundingClientRect().height;
    }, inner);
    const maxHeight = 0.8 * (await shadowPage.evaluate(() => innerHeight));
    near(height, maxHeight, `${where}: tall height in a shadow root`);
    await shadowPage.context().close();
  }
});

/** Diagram, card padding box and toolbar of one diagram, in page pixels */
const cardParts = (page, id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    const card = el.closest(".diagview-viewport");
    const cs = getComputedStyle(card);
    const bar = card.closest(".diagview-wrapper").querySelector(".diagview-controls");
    return {
      svg: el.querySelector("svg").getBoundingClientRect().toJSON(),
      card: card.getBoundingClientRect().toJSON(),
      padding: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      bar: bar.getBoundingClientRect().toJSON(),
    };
  }, id);

test("the card around a short diagram hugs it", async () => {
  const { svg, card, padding } = await cardParts(page, "short");
  near(svg.height, DIAGRAMS.short.height, "short height");
  near(card.height, svg.height + padding, "short card height");
});

test("the floating toolbar sits under a short diagram, on hover and on a touch screen", async ({
  browser,
  browserName,
}) => {
  // The card takes its real height only once it is on screen, which moves
  // it, so scroll it into view again before the mouse goes over it
  await page.locator("#short").scrollIntoViewIfNeeded();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.locator("#short").scrollIntoViewIfNeeded();
  const bar = page.locator(".diagview-wrapper:has(#short) .diagview-controls");
  // Headless WebKit now and then drops :hover with the mouse at rest
  await expect(async () => {
    await page.locator(".diagview-wrapper:has(#short)").hover();
    await expect(bar).toHaveCSS("opacity", "1", { timeout: 1000 });
  }).toPass();
  const hovered = await cardParts(page, "short");
  expect(hovered.bar.top, "toolbar top on hover").toBeGreaterThanOrEqual(hovered.card.bottom - 1);

  const phonePage = await load(browser, { options: phone(browserName) });
  await phonePage.locator("#short").scrollIntoViewIfNeeded();
  const touch = await cardParts(phonePage, "short");
  expect(touch.bar.top, "toolbar top on a touch screen").toBeGreaterThanOrEqual(
    touch.card.bottom - 1,
  );
  near(touch.card.height, touch.svg.height + touch.padding, "short card height on a phone");
});

test("a phone card has 12px of padding around the diagram, a desktop card 24px", async ({
  browser,
  browserName,
}) => {
  const desktop = await cardParts(page, "fixed");
  near(desktop.padding, 48, "desktop top and bottom padding");
  const phonePage = await load(browser, { options: phone(browserName) });
  const parts = await cardParts(phonePage, "fixed");
  near(parts.padding, 24, "phone top and bottom padding");
  // The 311px diagram now fits a 390px phone at its own size
  near(parts.svg.width, DIAGRAMS.fixed.width, "fixed width on a phone");
  near(parts.svg.left - parts.card.left, parts.card.right - parts.svg.right, "fixed centred");
});
