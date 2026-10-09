// offHint marks a diagram with layout "off" as one that opens fullscreen.
// With a mouse the icon and label badges show on hover or keyboard focus
// and the line below stays hidden, as the zoom-in cursor says the same. A
// touch screen shows all three, with the touch text. A click on the badge
// still opens the viewer, which shows no hint, and destroy() takes every
// hint away.
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

/** @type {import("@playwright/test").Page} */
let page;
/** The page before DiagView, to compare with after destroy() */
let before;

/** Open the fixture and set DiagView up with offHint left at "none" */
async function load(target) {
  await target.goto(fixtureFile("off-hint.html"));
  await target.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    window.__before = document.body.innerHTML;
  });
  await target.addScriptTag({ path: DIST });
  await target.evaluate(() => DiagView.init({ diagramSelector: ".diagram", animateOpen: false }));
  for (const id of ["icon", "label", "below", "plain", "bare", "header"]) {
    await target.waitForSelector(`#${id}[data-diagview-init]`);
  }
}

const hintOf = (id) => page.locator(`#${id} > .diagview-off-hint`);
const opacity = (locator) => locator.evaluate((el) => getComputedStyle(el).opacity);

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await load(page);
  before = await page.evaluate(() => window.__before);
});

test.afterAll(async () => {
  await page.context().close();
});

test("only the diagrams that ask for a hint get one, and it holds no svg", async () => {
  const dom = await page.evaluate(() => {
    const info = (id) => {
      const el = document.getElementById(id);
      return {
        hints: el.querySelectorAll(".diagview-off-hint").length,
        host: el.classList.contains("diagview-off-host"),
        style: el.getAttribute("style"),
      };
    };
    return {
      icon: info("icon"),
      label: info("label"),
      below: info("below"),
      plain: info("plain"),
      header: info("header"),
      svgsInHints: document.querySelectorAll(".diagview-off-hint svg").length,
      ariaHidden: [...document.querySelectorAll(".diagview-off-hint")].every(
        (h) => h.getAttribute("aria-hidden") === "true",
      ),
      firstSvg: document.getElementById("icon").querySelector("svg").parentElement.id,
    };
  });
  expect(dom).toEqual({
    icon: { hints: 1, host: true, style: null },
    label: { hints: 1, host: true, style: null },
    below: { hints: 1, host: false, style: null },
    plain: { hints: 0, host: false, style: null },
    header: { hints: 0, host: false, style: null },
    svgsInHints: 0,
    ariaHidden: true,
    firstSvg: "icon",
  });
});

test("with a mouse the icon stays hidden until the diagram is hovered", async () => {
  const hint = hintOf("icon");
  expect(await opacity(hint)).toBe("0");

  // Headless WebKit can drop a hover, so hover again until it holds
  await expect(async () => {
    await page.locator("#icon").hover();
    expect(await opacity(hint)).toBe("1");
  }).toPass();

  const box = await page.evaluate(() => {
    const host = document.getElementById("icon").getBoundingClientRect();
    const badge = document.querySelector("#icon > .diagview-off-hint").getBoundingClientRect();
    return {
      width: Math.round(badge.width),
      height: Math.round(badge.height),
      top: Math.round(badge.top - host.top),
      right: Math.round(host.right - badge.right),
    };
  });
  expect(box).toEqual({ width: 32, height: 32, top: 8, right: 8 });
});

test("keyboard focus shows the icon too", async () => {
  await page.mouse.move(900, 700);
  await expect.poll(() => opacity(hintOf("icon"))).toBe("0");
  await page.focus("#before");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("icon");
  await expect.poll(() => opacity(hintOf("icon"))).toBe("1");
});

test("with a mouse the label reads Click to expand and the line below stays hidden", async () => {
  await expect(async () => {
    await page.locator("#label").hover();
    expect(await opacity(hintOf("label"))).toBe("1");
  }).toPass();
  expect(await hintOf("label").evaluate((el) => el.innerText.trim())).toBe("Click to expand");

  const below = await page.evaluate(() => ({
    display: getComputedStyle(document.querySelector("#below > .diagview-off-hint")).display,
    // The hidden line takes no room
    height: document.getElementById("below").offsetHeight,
    plain: document.getElementById("plain").offsetHeight,
  }));
  expect(below).toEqual({ display: "none", height: below.plain, plain: below.plain });
});

test("an svg the selector matched gets its label on a line under it", async () => {
  await expect(async () => {
    await page.locator("#bare").hover();
    expect(
      await page
        .locator("#bare + .diagview-off-hint")
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("1");
  }).toPass();
  const geo = await page.evaluate(() => {
    const svg = document.getElementById("bare");
    const hint = svg.nextElementSibling;
    const s = svg.getBoundingClientRect();
    const h = hint.getBoundingClientRect();
    const p = svg.parentElement.getBoundingClientRect();
    return {
      className: hint.className,
      inside: !!svg.querySelector(".diagview-off-hint"),
      under: h.top >= s.bottom,
      right: Math.round(p.right - h.right),
      text: hint.innerText.trim(),
    };
  });
  expect(geo).toEqual({
    className: "diagview-off-hint diagview-off-hint--label diagview-off-hint--after",
    inside: false,
    under: true,
    right: 0,
    text: "Click to expand",
  });
});

test("a click on the badge opens the viewer, which shows no hint", async () => {
  await expect(async () => {
    await page.locator("#icon").hover();
    expect(await opacity(hintOf("icon"))).toBe("1");
  }).toPass();
  const box = await hintOf("icon").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
  const modal = await page.evaluate(() => ({
    source: DiagView.default.state.activeSourceElement?.id,
    hints: document.querySelectorAll("#diagview-modal .diagview-off-hint").length,
    minimapHints: document.querySelectorAll("#diagview-minimap .diagview-off-hint").length,
  }));
  expect(modal).toEqual({ source: "icon", hints: 0, minimapHints: 0 });
  await page.evaluate(() => DiagView.closeModal());
  await expect(page.locator("#diagview-modal.open")).toHaveCount(0);
});

test("a touch screen shows every hint with the touch text", async ({ browser, browserName }) => {
  const phonePage = await newPage(browser, phone(browserName));
  try {
    await load(phonePage);
    test.skip(
      !(await phonePage.evaluate(() => matchMedia("(hover: none) or (pointer: coarse)").matches)),
      "This browser does not emulate a touch screen",
    );
    const seen = await phonePage.evaluate(() => {
      const hint = (id) => document.querySelector(`#${id} > .diagview-off-hint`);
      const look = (el) => ({
        opacity: getComputedStyle(el).opacity,
        display: getComputedStyle(el).display,
        text: el.innerText.trim(),
      });
      const svg = document.querySelector("#below svg").getBoundingClientRect();
      const line = hint("below").getBoundingClientRect();
      const host = document.getElementById("below").getBoundingClientRect();
      return {
        icon: look(hint("icon")),
        label: look(hint("label")),
        below: look(hint("below")),
        bare: look(document.querySelector("#bare + .diagview-off-hint")),
        belowUnder: line.top >= svg.bottom,
        belowRight: Math.round(host.right - line.right),
      };
    });
    expect(seen).toEqual({
      icon: { opacity: "0.85", display: "flex", text: "" },
      label: { opacity: "0.85", display: "flex", text: "Tap to expand" },
      below: { opacity: "1", display: "flex", text: "Tap to expand" },
      bare: { opacity: "0.85", display: "flex", text: "Tap to expand" },
      belowUnder: true,
      belowRight: 0,
    });

    // A tap on the line below opens the viewer. The line lets the tap
    // through, so tap its spot rather than the element.
    const line = await phonePage.locator("#below > .diagview-off-hint").boundingBox();
    await phonePage.touchscreen.tap(line.x + line.width - 20, line.y + line.height / 2);
    await phonePage.waitForFunction(
      () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
    );
    expect(await phonePage.evaluate(() => DiagView.default.state.activeSourceElement?.id)).toBe(
      "below",
    );
  } finally {
    await phonePage.context().close();
  }
});

test("destroy() takes every hint and host class away", async () => {
  await page.evaluate(() => DiagView.destroy());
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
});
