/**
 * DiagView in-page links. Handles a click on a `#section` link inside the viewer.
 * @module ui/section-links
 */

import { TIMING } from "../core/constants.js";
import { closeModal } from "./modal-controls.js";

/**
 * Make a link to a part of this page close the viewer, then go there as a
 * click on the page would. Left to the browser, the jump counted as Back.
 * @param {HTMLElement} viewport - The viewer's viewport
 */
export function wireSectionLinks(viewport) {
  viewport.addEventListener("click", async (e) => {
    const link = e.target.closest?.("a[*|href]");
    const hash = link?.getAttribute("href") ?? link?.getAttribute("xlink:href");
    if (!hash?.startsWith("#") || hash === "#" || link.hasAttribute("target")) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    // The viewer's copy prefixes its ids, so a link to a part of the
    // diagram goes to that part of the page's own diagram
    let id = hash.slice(1);
    if (viewport.contains(document.getElementById(id))) id = id.replace(/^dv-[^-]+-[^-]+-/, "");
    await closeModal();
    // Closing steps back over the viewer's history entry. Jump only once
    // that step has landed and the browser has restored its scroll position,
    // or the step undoes the jump.
    if (history.state?.diagviewModal) {
      let landed;
      await new Promise((resolve) => {
        landed = resolve;
        window.addEventListener("popstate", resolve, { once: true });
        setTimeout(resolve, TIMING.CLEANUP_DELAY);
      });
      window.removeEventListener("popstate", landed);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    // Setting the hash the address already has does not scroll
    const target = document.getElementById(id);
    if (location.hash === "#" + id) target?.scrollIntoView();
    else location.hash = id;
    // For a part inside an SVG, Firefox scrolls to the top of the SVG, which
    // leaves the part off screen in a diagram taller than the window
    if (target?.ownerSVGElement) {
      const box = target.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        window.scrollBy(0, box.top - pad);
      }
    }
  });
}
