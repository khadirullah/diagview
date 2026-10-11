// Copy Image with a real click. Safari and Firefox take a clipboard write
// only during the click, so DiagView must call clipboard.write before it
// draws the image. Each check records whether the write ran inside the
// click handler (window.event is the click then) and how it ended.
//
// Runs offline on the copy-image fixture, served over http so the page
// has the clipboard. DV_DIST=/path/to/diagview.umd.js tests another build.
import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { DIST, SITE, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

const URL_ = `${SITE}/tests/e2e/fixtures/copy-image.html`;

/** Wrap clipboard.write to note each call, before the page's scripts run */
const recordWrites = () => {
  window.__writes = [];
  const clip = navigator.clipboard;
  if (!clip?.write) return;
  const write = clip.write.bind(clip);
  clip.write = (items) => {
    const call = { inClick: window.event?.type === "click", result: null };
    window.__writes.push(call);
    const done = write(items);
    done.then(
      () => (call.result = "ok"),
      (e) => (call.result = e.name),
    );
    return done;
  };
};

/**
 * A page on the fixture with DiagView set up. hold() sets how long the
 * font file takes from then on.
 */
async function openPage(browser, { clipboard }) {
  const page = await newPage(browser, { acceptDownloads: true });
  if (clipboard) await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(recordWrites);
  let wait = 0;
  await page.route("**/held-back.woff", async (route) => {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    // The export gives up on the font after 5 seconds and aborts the request
    await route
      .fulfill({ body: "wOFF", contentType: "font/woff", headers: { "cache-control": "no-store" } })
      .catch(() => {});
  });
  await page.goto(URL_);
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => DiagView.init({ animateOpen: false, rememberZoom: false }));
  await page.waitForTimeout(300);
  page.hold = (ms) => (wait = ms);
  return page;
}

async function openMenu(page) {
  if (!(await page.evaluate(() => DiagView.state.isModalOpen))) {
    await page.evaluate(() => DiagView.openFullscreen(document.getElementById("diag")));
    await page.waitForFunction(() => DiagView.state.isModalOpen && !DiagView.state.isModalOpening);
    await page.waitForTimeout(300);
  }
  await page.click("#dv-toggle");
  await page.waitForTimeout(300);
}

/** Wait for the notice that ends a copy and return its text */
async function copyNotice(page) {
  const handle = await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".diagview-toast")]
        .map((n) => n.textContent)
        .find((t) => /Copied|downloaded|Failed/.test(t)),
    null,
    { timeout: 20000 },
  );
  return handle.jsonValue();
}

const clearNotices = (page) =>
  page.evaluate(() => {
    document.getElementById("diagview-toast-container")?.remove();
    window.__writes.length = 0;
  });

const writes = (page) => page.evaluate(() => window.__writes);

/** Width and height a PNG file states in its header */
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test.describe("Copy Image", () => {
  /** @type {import("@playwright/test").Page} */
  let page;

  test.beforeAll(async ({ browser, browserName }) => {
    // Only Chromium knows the clipboard permissions, and only Chromium
    // reads the image back
    page = await openPage(browser, { clipboard: browserName === "chromium" });
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("the viewer menu writes during the click and copies the PNG", async ({ browserName }) => {
    await clearNotices(page);
    let downloads = 0;
    const count = () => downloads++;
    page.on("download", count);
    await openMenu(page);
    await page.click('.dv-exp [data-action="copy"]');
    expect(await copyNotice(page)).toBe("Copied to clipboard!");
    expect(await writes(page)).toEqual([{ inClick: true, result: "ok" }]);
    page.off("download", count);
    expect(downloads).toBe(0);

    if (browserName !== "chromium") return;
    const copied = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item.getType("image/png");
      const bmp = await createImageBitmap(blob);
      return { types: item.types, size: [bmp.width, bmp.height] };
    });
    expect(copied.types).toEqual(["image/png"]);
    // The same image a PNG download from the menu makes
    await openMenu(page);
    const download = page.waitForEvent("download");
    await page.click('.dv-exp [data-action="png"]');
    const file = await fs.readFile(await (await download).path());
    expect(copied.size).toEqual(pngSize(file));
    expect(copied.size[0]).toBeGreaterThan(300);
  });

  test("the Copy button on the page writes during the click", async () => {
    if (await page.evaluate(() => DiagView.state.isModalOpen)) {
      await page.evaluate(() => DiagView.closeModal());
      await page.waitForFunction(() => !DiagView.state.isModalOpen);
      await page.waitForTimeout(300);
    }
    await clearNotices(page);
    await page.hover("#diag");
    await page.locator('[data-action="copy"]').first().click({ force: true });
    expect(await copyNotice(page)).toBe("Copied to clipboard!");
    expect(await writes(page)).toEqual([{ inClick: true, result: "ok" }]);
  });
});

test("a copy that takes longer than the click still copies", async ({ browser }) => {
  // No clipboard permission here, so Chromium also needs the click. The
  // font file holds the export past the 5 seconds a click lasts.
  const page = await openPage(browser, { clipboard: false });
  try {
    let downloads = 0;
    page.on("download", () => downloads++);
    await openMenu(page);
    page.hold(7000);
    const start = Date.now();
    await page.click('.dv-exp [data-action="copy"]');
    expect(await copyNotice(page)).toBe("Copied to clipboard!");
    expect(Date.now() - start).toBeGreaterThan(5000);
    expect(await writes(page)).toEqual([{ inClick: true, result: "ok" }]);
    expect(downloads).toBe(0);
  } finally {
    await page.context().close();
  }
});

test("a denied write downloads the PNG", async ({ browser }) => {
  const page = await openPage(browser, { clipboard: false });
  try {
    await page.evaluate(() => {
      navigator.clipboard.write = () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError"));
    });
    await openMenu(page);
    const download = page.waitForEvent("download");
    await page.click('.dv-exp [data-action="copy"]');
    expect((await download).suggestedFilename()).toMatch(/^copy_check_.*\.png$/);
    expect(await copyNotice(page)).toBe("PNG downloaded (Clipboard unavailable)");
  } finally {
    await page.context().close();
  }
});
