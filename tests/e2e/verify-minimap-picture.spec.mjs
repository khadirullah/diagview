// The minimap picture must sit where the minimap maps the diagram, so the
// viewport box and a click point at what the picture shows. Each diagram
// has one red box. The test finds it in a screenshot of the minimap,
// compares it with where the minimap maps that box, then clicks it and
// checks the viewer lands on it.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

const PAGE = `${SITE}/tests/e2e/fixtures/minimap-picture.html`;

/** @type {import("@playwright/test").Page} */
let page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { deviceScaleFactor: 2 });
  await page.goto(PAGE);
  await page.waitForTimeout(300);
});

test.afterAll(async () => {
  await page.context().close();
});

async function open(id) {
  await page.evaluate(async (id) => {
    const dv = DiagView.default;
    if (dv.state.isModalOpen) dv.closeModal();
    await new Promise((r) => setTimeout(r, 900));
    dv.openFullscreen(document.getElementById(id));
  }, id);
  await page.waitForTimeout(800);
  await page.evaluate(() => DiagView.default.state.activePanzoom.zoom(4, { animate: false }));
  await page.waitForTimeout(500); // throttled updateMinimap
  await expect(page.locator("#diagview-minimap.show")).toHaveCount(1);
}

/** Bounds of the red pixels in the minimap, in page pixels */
async function redInMinimap() {
  const box = await page.evaluate(() => {
    const m = document.getElementById("diagview-minimap");
    m.querySelector(".dv-mm-v").style.visibility = "hidden";
    const r = m.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const png = await page.screenshot({ clip: box });
  const found = await page.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x + 1);
            y1 = Math.max(y1, y + 1);
          }
        }
      }
      return x1 < 0 ? null : { x0, y0, x1, y1, width: img.width };
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
  await page.evaluate(() => {
    document.querySelector("#diagview-minimap .dv-mm-v").style.visibility = "";
  });
  if (!found) return null;
  // The screenshot has two pixels to each page pixel
  const k = box.width / found.width;
  return {
    left: box.x + found.x0 * k,
    top: box.y + found.y0 * k,
    right: box.x + found.x1 * k,
    bottom: box.y + found.y1 * k,
  };
}

/** Where the minimap maps a diagram rectangle, in page pixels */
const mapped = (r) =>
  page.evaluate((r) => {
    const mm = DiagView.default.state.minimapSvg;
    const ctm = mm.getScreenCTM();
    const at = (x, y) => {
      const p = mm.createSVGPoint();
      p.x = x;
      p.y = y;
      return p.matrixTransform(ctm);
    };
    const a = at(r.x, r.y);
    const b = at(r.x + r.w, r.y + r.h);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }, r);

const CASES = [
  { id: "shifted", red: { x: 85, y: 250, w: 110, h: 50 } },
  { id: "negative", red: { x: 540, y: 200, w: 100, h: 80 } },
  { id: "sized", red: { x: 180, y: 70, w: 70, h: 40 } },
];

for (const { id, red } of CASES) {
  test(`${id}: the minimap draws the red box where it maps it`, async () => {
    await open(id);
    const drawn = await redInMinimap();
    const want = await mapped(red);
    const detail = `drawn ${JSON.stringify(drawn)}, mapped ${JSON.stringify(want)}`;
    expect(drawn, detail).not.toBeNull();
    for (const side of ["left", "top", "right", "bottom"]) {
      expect(Math.abs(drawn[side] - want[side]), `${side}: ${detail}`).toBeLessThan(1.5);
    }
  });

  test(`${id}: a click on the red box in the minimap centres it`, async () => {
    await open(id);
    const drawn = await redInMinimap();
    await page.mouse.click(
      Math.round((drawn.left + drawn.right) / 2),
      Math.round((drawn.top + drawn.bottom) / 2),
    );
    await page.waitForTimeout(800); // pan animates

    // The red box's centre on screen against the viewport centre, in
    // minimap pixels, since one click pixel covers several screen pixels
    const off = await page.evaluate((r) => {
      const dv = DiagView.default;
      const clone = document.querySelector("#diagview-modal-viewport svg");
      const root = clone.querySelector(".dv-rot-g") || clone;
      const p = clone.createSVGPoint();
      p.x = r.x + r.w / 2;
      p.y = r.y + r.h / 2;
      const s = p.matrixTransform(root.getScreenCTM());
      const v = document.getElementById("diagview-modal-viewport").getBoundingClientRect();
      const mm = dv.state.minimapSvg.getScreenCTM().a;
      const view = root.getScreenCTM().a;
      return {
        x: ((s.x - (v.left + v.width / 2)) / view) * mm,
        y: ((s.y - (v.top + v.height / 2)) / view) * mm,
      };
    }, red);
    expect(Math.abs(off.x), `x off by ${off.x.toFixed(2)} minimap px`).toBeLessThan(1.5);
    expect(Math.abs(off.y), `y off by ${off.y.toFixed(2)} minimap px`).toBeLessThan(1.5);
  });
}

test("one zoom step that takes the diagram past the viewport shows the minimap", async () => {
  await page.evaluate(async () => {
    const dv = DiagView.default;
    if (dv.state.isModalOpen) dv.closeModal();
    await new Promise((r) => setTimeout(r, 900));
    dv.openFullscreen(document.getElementById("shifted"));
  });
  await page.waitForTimeout(800);
  await expect(page.locator("#diagview-minimap.show")).toHaveCount(0);

  // The "+" key zooms with an animation
  await page.keyboard.press("+");
  await page.waitForTimeout(800);
  const past = await page.evaluate(() => {
    const s = document.querySelector("#diagview-modal-viewport svg").getBoundingClientRect();
    const v = document.getElementById("diagview-modal-viewport").getBoundingClientRect();
    return s.width > v.width * 1.05 || s.height > v.height * 1.05;
  });
  expect(past).toBe(true);
  await expect(page.locator("#diagview-minimap.show")).toHaveCount(1);
});
