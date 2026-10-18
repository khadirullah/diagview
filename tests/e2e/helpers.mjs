import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const E2E_PORT = Number(process.env.E2E_PORT || 9340);
/** Root of the test site that serve.mjs builds from demo/ and dist/ */
export const SITE = `http://127.0.0.1:${E2E_PORT}`;
export const REPRO = `${SITE}/tests/e2e/repro.html`;

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
/** Build under test. DV_DIST points the fixture suites at another build. */
export const DIST = process.env.DV_DIST || path.join(ROOT, "dist", "diagview.umd.js");

/** file:// URL of a fixture in the repo, for suites that need a file:// page */
export const fixtureFile = (name) => pathToFileURL(path.join(here, "fixtures", name)).href;

/** New page in its own context, sized like the old scripts' Chrome window */
export async function newPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    ...options,
  });
  return context.newPage();
}

/** Viewport centre measured in the diagram's own coordinates (see repro.html) */
export const centerInSVG = (page) => page.evaluate(() => window.__centerInSVG());

/**
 * Wait until a share link has been applied in the viewer. The dv- parameters
 * leave the address bar before the viewer opens, so that alone is not enough.
 * The restore then loads the rotation code, rotates, zooms and pans to the
 * shared point over a few frames. This waits for the viewer to open with the
 * link's rotation and zoom, for the open animation to end, and for the pan
 * to hold still for 300 ms, which also covers the throttled minimap update.
 * @param {import("@playwright/test").Page} page - Page opened on the share link
 * @param {URLSearchParams} q - The link's parameters
 */
export const waitForShareRestore = (page, q) =>
  page.waitForFunction(
    ({ r, z }) => {
      const s = window.DiagView?.default?.state;
      const pz = s?.activePanzoom;
      const content = document.querySelector(".diagview-modal-content");
      const ready =
        s?.isModalOpen &&
        !s.isModalOpening &&
        pz &&
        !window.location.search.includes("dv-") &&
        s.rotationAngle === r &&
        Math.abs(pz.getScale() - z) < 0.01 &&
        content?.getAnimations().length === 0;
      if (!ready) {
        window.__dvRestorePan = null;
        return false;
      }
      const { x, y } = pz.getPan();
      const last = window.__dvRestorePan;
      if (!last || last.x !== x || last.y !== y) {
        window.__dvRestorePan = { x, y, since: performance.now() };
        return false;
      }
      return performance.now() - last.since >= 300;
    },
    { r: Number(q.get("dv-r") || 0), z: Number(q.get("dv-z")) },
    { polling: "raf" },
  );
