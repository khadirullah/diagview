// A diagram with layout "off" has no toolbar, so it takes focus itself. Tab
// stops on it with a ring in the accent colour, Enter or Space opens the
// viewer and Esc brings focus back. A diagram with links inside keeps them
// reachable, and a click still opens the viewer without a ring.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/off-layout-keyboard.html`;

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

const isOpen = () => page.evaluate(() => !!document.querySelector("#diagview-modal.open"));
const focusedId = () => page.evaluate(() => document.activeElement?.id);

async function waitClosed() {
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
  await page.waitForTimeout(400);
}

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem("diagview-canvas-hint-shown", "true"));
  await page.waitForSelector("#titled[data-diagview-init]");
  await page.waitForSelector("#header[data-diagview-init]");
});

test.afterAll(async () => {
  await page.context().close();
});

test("Tab stops on the diagram and shows a ring in the accent colour", async () => {
  await page.focus("#before");
  await page.keyboard.press("Tab");
  expect(await focusedId()).toBe("titled");
  const ring = await page.evaluate(() => {
    const el = document.getElementById("titled");
    const s = getComputedStyle(el);
    return {
      visible: el.matches(":focus-visible"),
      style: s.outlineStyle,
      width: s.outlineWidth,
      colour: s.outlineColor,
      role: el.getAttribute("role"),
      label: el.getAttribute("aria-label"),
    };
  });
  expect(ring).toEqual({
    visible: true,
    style: "solid",
    width: "2px",
    colour: "rgb(59, 130, 246)",
    role: "button",
    label: "Open Order flow in fullscreen",
  });
});

test("the ring is drawn inside the diagram's box, so a card that clips it still shows it", async () => {
  const box = await page.evaluate(() => {
    const r = document.getElementById("titled").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const png = await page.screenshot({ clip: box });
  const edges = await page.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const at = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)].join(",");
      const [w, h] = [c.width, c.height];
      // One device pixel in from each edge, halfway along it
      return [at(w >> 1, 1), at(w >> 1, h - 2), at(1, h >> 1), at(w - 2, h >> 1)];
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
  expect(edges).toEqual(Array(4).fill("59,130,246"));
});

test("Enter opens the viewer", async () => {
  await page.keyboard.press("Enter");
  await page.waitForSelector("#diagview-modal.open");
  expect(await page.evaluate(() => DiagView.default.state.activeSourceElement?.id)).toBe("titled");
  await page.waitForTimeout(500);
});

test("Esc closes the viewer and focus goes back to the diagram", async () => {
  await page.keyboard.press("Escape");
  await waitClosed();
  expect(await focusedId()).toBe("titled");
});

test("Space opens the viewer and the page does not scroll", async () => {
  const before = await page.evaluate(() => {
    // The viewer takes focus at once, so check that the key's scroll is
    // cancelled too, not only where the page ends up
    window.addEventListener("keydown", (e) => (window.__spaceStopped = e.defaultPrevented), {
      once: true,
    });
    return window.scrollY;
  });
  await page.keyboard.press(" ");
  expect(await page.evaluate(() => window.__spaceStopped)).toBe(true);
  await page.waitForSelector("#diagview-modal.open");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await waitClosed();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(await focusedId()).toBe("titled");
});

test("a click still opens the viewer, with no ring after it closes", async () => {
  await page.locator("#untitled").click();
  await page.waitForSelector("#diagview-modal.open");
  await page.waitForTimeout(500);
  await page.locator("#diagview-close").click();
  await waitClosed();
  const el = await page.evaluate(() => {
    const u = document.getElementById("untitled");
    return { focused: document.activeElement === u, ring: u.matches(":focus-visible") };
  });
  expect(el).toEqual({ focused: true, ring: false });
});

test("a diagram with links is a group, and Enter on its link follows the link", async () => {
  const linked = await page.evaluate(() => {
    const el = document.getElementById("linked");
    return [el.getAttribute("role"), el.getAttribute("aria-label")];
  });
  expect(linked).toEqual(["group", "Checkout, press Enter to open fullscreen"]);
  expect(
    await page.evaluate(() => document.getElementById("untitled").getAttribute("aria-label")),
  ).toBe("Open diagram in fullscreen");
  // The header diagram keeps its toolbar and stays out of the tab order
  expect(
    await page.evaluate(() => document.getElementById("header").hasAttribute("tabindex")),
  ).toBe(false);

  // Last, since the link changes the address
  await page.focus("#inner");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  expect(await isOpen()).toBe(false);
  expect(await page.evaluate(() => location.hash)).toBe("#details");
});
