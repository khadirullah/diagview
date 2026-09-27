// React 18 StrictMode integration on demo/framework-react.html, a real React
// dev-build tree with StrictMode on:
//   - StrictMode's destroy, init double effect leaves DiagView initialized
//   - no uncaught DOM errors on mount, unmount, remount and replace
//   - fullscreen opens from the floating toolbar and from a layout "off" diagram
//   - the documented anti-pattern (diagram element as component root) really
//     throws NotFoundError on unmount, so the rule is load-bearing
//
// The test site serves the demo with its unpkg diagview tag pointed at the
// local build. Set DV_CDN to a version (e.g. DV_CDN=1.0.11) to load that
// published build instead. React and Panzoom come from CDNs, so this suite
// needs network access.
import { test, expect } from "@playwright/test";
import { SITE, newPage } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

/** @type {import("@playwright/test").Page} */
let page;
const pageErrors = [];
let s;
let errorsBefore;
let errorsAfterCrash;

const snapshot = () =>
  page.evaluate(() => {
    const dv = window.DiagView;
    const st = (dv.default && dv.default.state) || dv.state || {};
    return {
      version: dv.version,
      initCalls: window.__dv.initCalls,
      destroyCalls: window.__dv.destroyCalls,
      errors: window.__dv.errors.slice(),
      caught: window.__dv.caught.slice(),
      initialized: !!st.isInitialized,
      modalOpen: !!st.isModalOpen,
      wrappers: document.querySelectorAll(".diagview-wrapper").length,
      hosts: document.querySelectorAll(".diagram-host").length,
      boundaries: document.querySelectorAll(".rx-boundary").length,
      diagrams: document.querySelectorAll(".diagram").length,
      floatingTitle:
        document
          .querySelector("#viewer-card .diagram-host .diagram > svg")
          ?.getAttribute("aria-label") || null,
      headerTitle:
        document
          .querySelector("#header-card .diagram-host .diagram > svg")
          ?.getAttribute("aria-label") || null,
      toolbarButtons: document.querySelectorAll(".diagview-wrapper button").length,
    };
  });
const allErrors = () => [...s.errors, ...pageErrors].join(" | ").slice(0, 200);

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  if (process.env.DV_CDN) {
    const cdn = `https://unpkg.com/diagview@${process.env.DV_CDN}/dist/diagview.umd.js`;
    await page.route("**/dist/diagview.umd.js", async (route) =>
      route.fulfill({ response: await route.fetch({ url: cdn }) }),
    );
  }
  await page.goto(`${SITE}/demo/framework-react.html`);
  await page.waitForTimeout(1200); // React mount + StrictMode double effect + observer debounce
  // Diagrams initialise lazily (IntersectionObserver, 200px margin), so bring
  // the viewer card into view like a reader would before looking for its wrapper
  await page.evaluate(() => document.getElementById("viewer-card")?.scrollIntoView());
  await page.waitForTimeout(600);
  s = await snapshot();
  test.info().annotations.push({ type: "diagview", description: String(s.version) });
});

test.afterAll(async () => {
  await page.context().close();
});

test.describe("StrictMode mount", () => {
  test("StrictMode ran the effect twice (init, destroy, init)", async () => {
    const detail = `init=${s.initCalls} destroy=${s.destroyCalls}`;
    expect(s.initCalls, detail).toBe(2);
    expect(s.destroyCalls, detail).toBe(1);
  });

  test("DiagView is initialized after the StrictMode cycle", async () => {
    expect(s.initialized).toBe(true);
  });

  test("floating + header diagrams got their wrappers", async () => {
    const detail = `wrappers=${s.wrappers} buttons=${s.toolbarButtons}`;
    expect(s.wrappers, detail).toBe(2);
    expect(s.toolbarButtons, detail).toBeGreaterThan(0);
  });

  test("no uncaught errors on mount", async () => {
    expect(s.errors.length === 0 && pageErrors.length === 0, allErrors()).toBe(true);
  });
});

test.describe("fullscreen", () => {
  test("toolbar fullscreen button opens the modal", async () => {
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll(".diagview-wrapper button")];
      const fs = btns.find((b) =>
        /full/i.test(b.title + " " + (b.getAttribute("aria-label") || "")),
      );
      if (!fs) return false;
      fs.click();
      return true;
    });
    await page.waitForTimeout(700);
    s = await snapshot();
    expect(clicked && s.modalOpen, `clicked=${clicked} open=${s.modalOpen}`).toBe(true);
  });

  test("Escape closes the modal", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    s = await snapshot();
    expect(s.modalOpen).toBe(false);
  });
});

test.describe("safe pattern", () => {
  test("unmount removes host + wrapper without DOM errors", async () => {
    // Safe pattern: React removes .diagram-host
    await page.click("#btn-toggle");
    await page.waitForTimeout(500);
    s = await snapshot();
    expect(
      s.hosts === 0 && s.wrappers === 0 && s.errors.length === 0 && pageErrors.length === 0,
      `hosts=${s.hosts} wrappers=${s.wrappers} errors=${allErrors()}`,
    ).toBe(true);
  });

  test("unmount ran destroy() and tore DiagView down cleanly", async () => {
    // The demo ties init() and destroy() to the component, as the docs do
    expect(
      !s.initialized && s.destroyCalls === 2 && s.wrappers === 0,
      `initialized=${s.initialized} destroyCalls=${s.destroyCalls}`,
    ).toBe(true);
  });

  test("remount re-inits DiagView and both diagrams (wrappers back)", async () => {
    await page.click("#btn-toggle");
    await page.waitForTimeout(600);
    s = await snapshot();
    expect(
      s.initialized && s.hosts === 2 && s.wrappers === 2 && s.errors.length === 0,
      `initialized=${s.initialized} hosts=${s.hosts} wrappers=${s.wrappers}`,
    ).toBe(true);
  });

  test("replace swaps both diagrams (keyed hosts) without errors", async () => {
    const before = s.floatingTitle;
    await page.click("#btn-replace");
    await page.waitForTimeout(600);
    s = await snapshot();
    expect(
      !!s.floatingTitle &&
        s.floatingTitle !== before &&
        s.headerTitle === s.floatingTitle &&
        s.wrappers === 2 &&
        s.errors.length === 0 &&
        pageErrors.length === 0,
      `${before} → ${s.floatingTitle} (header: ${s.headerTitle}) wrappers=${s.wrappers} errors=${allErrors()}`,
    ).toBe(true);
  });

  test("Detach runs destroy() only: diagrams stay in place, wrappers gone, no errors", async () => {
    await page.click("#btn-detach");
    await page.waitForTimeout(700);
    s = await snapshot();
    const diagrams = await page.evaluate(
      () => document.querySelectorAll("#viewer-card .diagram, #header-card .diagram").length,
    );
    expect(
      !s.initialized &&
        s.wrappers === 0 &&
        s.hosts === 2 &&
        diagrams === 2 &&
        s.errors.length === 0,
      `initialized=${s.initialized} wrappers=${s.wrappers} hosts=${s.hosts} diagrams=${diagrams}`,
    ).toBe(true);
  });

  test("Attach runs init() and re-enhances the same diagrams", async () => {
    await page.click("#btn-detach"); // Attach again
    await page.waitForTimeout(800);
    s = await snapshot();
    expect(
      s.initialized && s.wrappers === 2 && s.hosts === 2 && s.errors.length === 0,
      `initialized=${s.initialized} wrappers=${s.wrappers}`,
    ).toBe(true);
  });

  test('layout:"off" diagram (component root) opens fullscreen on click', async () => {
    await page.click("#stealth-diagram");
    await page.waitForTimeout(700);
    s = await snapshot();
    expect(s.modalOpen).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
  });
});

test.describe("unsafe pattern", () => {
  test("anti-pattern (diagram as root) throws NotFoundError on unmount", async () => {
    await page.check("#chk-unsafe");
    await page.waitForTimeout(600); // remount with the unsafe key
    errorsBefore = pageErrors.length + (await snapshot()).errors.length;
    await page.click("#btn-toggle"); // unmount: React removes .diagram from its old parent
    await page.waitForTimeout(600);
    s = await snapshot();
    const errors = [...s.caught, ...pageErrors].join(" | ");
    const threw = /NotFoundError|not a child of this node|removeChild/i.test(errors);
    expect(threw && s.caught.length > 0, errors.slice(0, 160) || "no error captured").toBe(true);
  });

  test("expected crash is NOT reported as an unexpected error at the top", async () => {
    expect(s.errors.length, "unexpected errors").toBe(errorsBefore);
  });

  test("crash stays in the two re-parenting cards: off diagram + buttons survive, dead diagrams gone, no top box", async () => {
    const contained = await page.evaluate(() => ({
      boundaries: document.querySelectorAll(".rx-boundary").length,
      inFloating: !!document.querySelector("#viewer-card .rx-boundary"),
      inHeader: !!document.querySelector("#header-card .rx-boundary"),
      stealth: !!document.getElementById("stealth-diagram"),
      toolbar: !!document.getElementById("btn-toggle"),
      deadDiagramsInCards: document.querySelectorAll("#viewer-card .diagram, #header-card .diagram")
        .length,
      topBoxShown: document.getElementById("rx-error").classList.contains("show"),
    }));
    expect(contained).toEqual({
      boundaries: 2,
      inFloating: true,
      inHeader: true,
      stealth: true,
      toolbar: true,
      deadDiagramsInCards: 0,
      topBoxShown: false,
    });
  });

  test("Mount with the box still ticked re-arms the anti-pattern and re-inits DiagView", async () => {
    await page.click("#btn-toggle");
    await page.waitForTimeout(900);
    s = await snapshot();
    expect(
      s.boundaries === 0 && s.initialized && s.wrappers === 2 && s.hosts === 0,
      `boundaries=${s.boundaries} initialized=${s.initialized} wrappers=${s.wrappers} hosts=${s.hosts}`,
    ).toBe(true);
  });

  test("off-layout diagram opens fullscreen again after that remount", async () => {
    await page.click("#stealth-diagram");
    await page.waitForTimeout(700);
    s = await snapshot();
    expect(s.modalOpen).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });

  test("second unsafe unmount is contained the same way", async () => {
    await page.click("#btn-toggle"); // unmount again: second crash, still contained
    await page.waitForTimeout(600);
    s = await snapshot();
    expect(
      s.boundaries === 2 && s.errors.length === errorsBefore,
      `boundaries=${s.boundaries} unexpected=${s.errors.length}`,
    ).toBe(true);
    errorsAfterCrash = pageErrors.length + s.errors.length;
  });

  test("untick + Mount restores the safe viewers without new errors", async () => {
    await page.uncheck("#chk-unsafe");
    await page.waitForTimeout(300);
    const boundaryCleared = (await snapshot()).boundaries === 0;
    await page.click("#btn-toggle"); // Mount viewers
    await page.waitForTimeout(800);
    s = await snapshot();
    const unsafeChecked = await page.isChecked("#chk-unsafe");
    const newErrors = pageErrors.length + s.errors.length - errorsAfterCrash;
    expect(
      boundaryCleared &&
        !unsafeChecked &&
        s.initialized &&
        s.hosts === 2 &&
        s.wrappers === 2 &&
        newErrors === 0,
      `boundaryCleared=${boundaryCleared} unsafe=${unsafeChecked} initialized=${s.initialized} hosts=${s.hosts} wrappers=${s.wrappers} newErrors=${newErrors}`,
    ).toBe(true);
  });

  test("off-layout diagram still opens fullscreen after the recovery", async () => {
    await page.click("#stealth-diagram");
    await page.waitForTimeout(700);
    s = await snapshot();
    expect(s.modalOpen).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });
});
