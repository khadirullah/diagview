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
