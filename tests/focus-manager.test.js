/**
 * Focus Manager Tests
 * The modal focus trap must only cycle through controls that are actually rendered.
 */
import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import { setupFocusTrap, invalidateFocusableCache } from "../src/ui/focus-manager.js";

describe("focus trap ignores unrendered and closed-search controls", () => {
  let modal, cleanupTrap;
  const el = (tag, id, cls, parent) => {
    const n = document.createElement(tag);
    if (id) n.id = id;
    if (cls) n.className = cls;
    if (tag === "a") n.href = "#";
    parent.appendChild(n);
    return n;
  };

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    invalidateFocusableCache();

    // jsdom has no layout: emulate checkVisibility() via a data-hidden marker
    // on the display:none ancestor (what .dv-topbar-actions is on desktop).
    Element.prototype.checkVisibility = function () {
      return !this.closest("[data-hidden]");
    };

    modal = document.createElement("div");
    modal.id = "diagview-modal";
    modal.tabIndex = -1;
    document.body.appendChild(modal);

    const topbar = el("div", null, "diagview-topbar", modal);
    const actions = el("div", null, "dv-topbar-actions", topbar);
    actions.dataset.hidden = "1"; // desktop: display:none
    el("button", "dv-search-icon-btn", "dv-icon-btn", actions);
    el("button", "dv-text-select-btn", "dv-icon-btn", actions);
    el("a", null, "diagview-branding", topbar);
    const searchContainer = el("div", null, "diagview-search-container", topbar);
    el("input", "diagview-search", "diagview-search-input", searchContainer);
    el("button", "diagview-close", "diagview-close-btn", topbar);
    el("button", "dv-toggle", "diagview-fab", modal);

    state.isModalOpen = true;
    cleanupTrap = setupFocusTrap();
  });

  afterEach(() => {
    cleanupTrap?.();
    delete Element.prototype.checkVisibility;
    state.isModalOpen = false;
  });

  const pressTab = (shift = false) => {
    const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, cancelable: true });
    document.activeElement.dispatchEvent(ev);
    return ev;
  };

  test("Tab from the last control wraps to the first RENDERED control", () => {
    document.getElementById("dv-toggle").focus();
    const ev = pressTab();
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement.className).toBe("diagview-branding");
  });

  test("Shift+Tab from the first rendered control wraps to the last control", () => {
    document.querySelector(".diagview-branding").focus();
    const ev = pressTab(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe("dv-toggle");
  });

  test("inputs inside the collapsed mobile search container are skipped", () => {
    // Mobile: action row rendered, branding hidden, search collapsed
    document.querySelector(".dv-topbar-actions").removeAttribute("data-hidden");
    document.querySelector(".diagview-branding").dataset.hidden = "1";
    const container = document.querySelector(".diagview-search-container");
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    invalidateFocusableCache();

    // Mid-list Tab steps over the collapsed search input straight to Close
    document.getElementById("dv-text-select-btn").focus();
    pressTab();
    expect(document.activeElement.id).toBe("diagview-close");

    document.getElementById("dv-toggle").focus();
    pressTab();
    expect(document.activeElement.id).toBe("dv-search-icon-btn");

    // Shift+Tab from the search icon wraps to the FAB — never the hidden input
    pressTab(true);
    expect(document.activeElement.id).toBe("dv-toggle");

    // Opening search (class + styles) rebuilds the list and exposes the input
    document.querySelector(".diagview-topbar").classList.add("search-open");
    container.style.opacity = "";
    container.style.pointerEvents = "";
    document.querySelector(".dv-topbar-actions").dataset.hidden = "1";
    invalidateFocusableCache();

    document.getElementById("dv-toggle").focus();
    pressTab();
    expect(document.activeElement.id).toBe("diagview-search");
  });
});
