// canvasGrid: "dots" draws a dot grid behind the fullscreen diagram. The
// grid follows a drag and a zoom, sets nothing the diagram inherits, so a
// pan does not restyle every element of a big diagram, and turning it off
// clears it.
import { test, expect } from "@playwright/test";
import { REPRO, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await page.goto(REPRO);
  await page.evaluate(() => {
    DiagView.default.configure({ canvasGrid: "dots" });
    DiagView.default.openFullscreen(document.getElementById("diag"));
  });
  await page.waitForFunction(
    () => DiagView.default.state.isModalOpen && !DiagView.default.state.isModalOpening,
  );
});

test.afterAll(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

/** The grid's background on the viewer, and the one the pan and zoom call for */
const readGrid = () =>
  page.evaluate(() => {
    const viewport = document.getElementById("diagview-modal-viewport");
    const pz = DiagView.default.state.activePanzoom;
    const scale = pz.getScale();
    const { x, y } = pz.getPan();
    // The browser writes calc() its own way, so let it write the expected
    // value too
    const probe = document.createElement("div");
    probe.style.backgroundPosition = `calc(50% + ${x * scale}px) calc(50% + ${y * scale}px)`;
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe).backgroundPosition;
    probe.remove();
    const style = getComputedStyle(viewport);
    return {
      image: style.backgroundImage,
      size: style.backgroundSize,
      position: style.backgroundPosition,
      expected,
    };
  });

/** Whether the grid sits where the pan and zoom call for */
const inStep = async () => {
  const grid = await readGrid();
  return grid.position === grid.expected;
};

test("the dots follow a drag and a zoom", async () => {
  const box = await page.locator("#diagview-modal-viewport").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width / 2 - i * 7, box.y + box.height / 2 + i * 3);
  }
  await page.mouse.up();
  // Panzoom reports a move on the next frame, so the grid takes the last
  // step of the drag a frame after the pan itself
  await expect.poll(inStep).toBe(true);
  let grid = await readGrid();
  expect(grid.image).toMatch(/radial-gradient/);
  expect(grid.position).not.toBe("50% 50%");

  await page.evaluate(() => DiagView.default.state.activePanzoom.zoom(2.5, { animate: false }));
  await expect.poll(inStep).toBe(true);
  grid = await readGrid();
  // 24px at 2.5 is 60px, halved until it is under 32px
  expect(grid.size).toBe("30px 30px");
});

test("the diagram inherits nothing from the grid", async () => {
  const inherited = await page.evaluate(() => {
    const svg = document.querySelector("#diagview-modal-viewport svg");
    const style = getComputedStyle(svg.querySelector("rect"));
    return ["--dv-grid-size", "--dv-grid-x", "--dv-grid-y"].map((name) =>
      style.getPropertyValue(name),
    );
  });
  expect(inherited).toEqual(["", "", ""]);
});

test("turning the grid off clears it", async () => {
  await page.evaluate(() => DiagView.default.configure({ canvasGrid: "none" }));
  const off = await page.evaluate(() => {
    const viewport = document.getElementById("diagview-modal-viewport");
    return {
      image: getComputedStyle(viewport).backgroundImage,
      style: viewport.style.cssText,
    };
  });
  expect(off.image).toBe("none");
  expect(off.style).not.toMatch(/background/);
});
