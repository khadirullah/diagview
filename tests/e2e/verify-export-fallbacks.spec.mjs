// Exports in browsers that cannot do everything DiagView asks of them, in
// a tab in the background, which runs no animation frames, and while the
// page's own jsPDF script is still loading.
// Safari's canvas cannot make WebP and hands back a PNG. Playwright's
// WebKit can, so the WebP checks stand in for Safari by wrapping toBlob.
//
// Runs offline on the copy-image fixture. DV_DIST=/path/to/diagview.umd.js
// tests another build.
import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { DIST, SITE, newPage } from "./helpers.mjs";

const URL_ = `${SITE}/tests/e2e/fixtures/copy-image.html`;

/** A canvas that makes a PNG when asked for WebP, as Safari's does */
const noWebP = () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
    return toBlob.call(this, cb, type === "image/webp" ? "image/png" : type, quality);
  };
};

/** A page on the fixture with DiagView set up and the viewer open */
async function openViewer(browser, init) {
  const page = await newPage(browser, { acceptDownloads: true });
  if (init) await page.addInitScript(init);
  await page.route("**/held-back.woff", (route) =>
    route.fulfill({ body: "wOFF", contentType: "font/woff" }).catch(() => {}),
  );
  await page.goto(URL_);
  await page.evaluate(() => {
    localStorage.setItem("diagview-canvas-hint-shown", "true");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
  });
  await page.addScriptTag({ path: DIST });
  await page.evaluate(() => {
    window.__exports = [];
    DiagView.init({
      animateOpen: false,
      rememberZoom: false,
      onExport: (format, name) => window.__exports.push([format, name]),
    });
    DiagView.openFullscreen(document.getElementById("diag"));
  });
  await page.waitForFunction(() => DiagView.state.isModalOpen && !DiagView.state.isModalOpening);
  await page.waitForTimeout(300);
  return page;
}

/** Wait for the notice that ends an export and return its text and kind */
async function savedNotice(page) {
  const handle = await page.waitForFunction(
    () => {
      const t = [...document.querySelectorAll(".diagview-toast")].find(
        (n) => !/Processing/.test(n.textContent),
      );
      return t && { text: t.textContent, warning: t.classList.contains("diagview-toast-warning") };
    },
    null,
    { timeout: 20000 },
  );
  return handle.jsonValue();
}

const PNG_SIGNATURE = "89504e470d0a1a0a";

test("a WebP the browser cannot make downloads as a PNG and says so", async ({ browser }) => {
  const page = await openViewer(browser, noWebP);
  try {
    await page.click("#dv-toggle");
    await page.waitForTimeout(300);
    const download = page.waitForEvent("download");
    await page.click('.dv-exp [data-action="webp"]');
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^copy_check_.*\.png$/);
    const bytes = await fs.readFile(await file.path());
    expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    const notice = await savedNotice(page);
    expect(notice.text).toMatch(/^This browser cannot make WebP, so it saved a \d\.\dx PNG$/);
    expect(notice.warning).toBe(true);
    const [[format, name]] = await page.evaluate(() => window.__exports);
    expect(format).toBe("png");
    expect(`${name}.png`).toBe(file.suggestedFilename());
  } finally {
    await page.context().close();
  }
});

test("a browser that makes WebP still saves a .webp file", async ({ browser }) => {
  const page = await openViewer(browser);
  try {
    await page.click("#dv-toggle");
    await page.waitForTimeout(300);
    const download = page.waitForEvent("download");
    await page.click('.dv-exp [data-action="webp"]');
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.webp$/);
    const bytes = await fs.readFile(await file.path());
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    const notice = await savedNotice(page);
    expect(notice.text).toMatch(/^\d\.\dx WebP saved$/);
    expect(notice.warning).toBe(false);
  } finally {
    await page.context().close();
  }
});

test("an export started from code in a tab in the background still finishes", async ({
  browser,
}) => {
  const page = await openViewer(browser);
  try {
    const download = page.waitForEvent("download");
    // A tab in the background runs no animation frames
    const result = await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      const done = DiagView.exportDiagram(document.getElementById("diag"), "png", {
        filename: "background",
      });
      const stalled = new Promise((resolve) => setTimeout(() => resolve("stalled"), 10000));
      return Promise.race([done, stalled]);
    });
    expect(result).toBe(true);
    expect((await download).suggestedFilename()).toBe("background.png");
  } finally {
    await page.context().close();
  }
});

test("a PDF export waits for the page's own jsPDF tag that is still loading", async ({
  browser,
}) => {
  const page = await openViewer(browser);
  try {
    const url = `${SITE}/held-back-jspdf.js`;
    // A stand-in for jsPDF that arrives after 1.5 seconds
    await page.route(url, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        contentType: "text/javascript",
        body: `window.jspdf = { jsPDF: function () {
          return { addImage() {}, save(name) { window.__pdf = name; } };
        } };`,
      });
    });
    const result = await page.evaluate(async (src) => {
      DiagView.configure({ pdfLibraryUrl: src, pdfLibraryIntegrity: null });
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
      const ok = await DiagView.exportDiagram(document.getElementById("diag"), "pdf", {
        filename: "waited",
      });
      return { ok, saved: window.__pdf ?? null };
    }, url);
    expect(result).toEqual({ ok: true, saved: "waited.pdf" });
    expect(await page.evaluate(() => document.querySelectorAll("script[src*=jspdf]").length)).toBe(
      1,
    );
  } finally {
    await page.context().close();
  }
});
