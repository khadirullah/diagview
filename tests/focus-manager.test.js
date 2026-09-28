/**
 * Focus Manager Tests
 * The modal focus trap must only cycle through controls that are actually rendered.
 */
import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import {
  setupFocusTrap,
  invalidateFocusableCache,
  saveFocus,
  restoreFocus,
  resetFocusManagement,
} from "../src/ui/focus-manager.js";

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

  test("Tab reaches diagram links written with xlink:href, between the topbar and the menu button", () => {
    const viewport = el("div", "diagview-modal-viewport", null, modal);
    modal.insertBefore(viewport, document.getElementById("dv-toggle"));
    // jsdom only focuses an xlink:href link that has a tabindex. -1 keeps
    // it out of the [tabindex] part of the selector, so a[*|href] must match.
    viewport.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<a xlink:href="#one" tabindex="-1"><rect/></a><a href="#two"><rect/></a></svg>';
    const [one, two] = viewport.querySelectorAll("a");
    invalidateFocusableCache();

    document.getElementById("diagview-close").focus();
    pressTab();
    expect(document.activeElement).toBe(one);
    pressTab();
    expect(document.activeElement).toBe(two);
    pressTab();
    expect(document.activeElement.id).toBe("dv-toggle");
    pressTab(true);
    pressTab(true);
    expect(document.activeElement).toBe(one);
  });

  test("Tab and Shift+Tab stay in the open shortcuts panel", () => {
    const help = el("div", null, "diagview-help-modal show", modal);
    const close = el("button", null, "diagview-help-close", help);
    close.focus();
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  test("a closed shortcuts panel leaves the viewer's own order alone", () => {
    const help = el("div", null, "diagview-help-modal", modal);
    el("button", null, "diagview-help-close", help).dataset.hidden = "1";
    document.getElementById("dv-toggle").focus();
    pressTab();
    expect(document.activeElement.className).toBe("diagview-branding");
  });
});

describe("focus returns to the diagram after closing", () => {
  let diagram, other;

  beforeEach(() => {
    document.body.innerHTML = '<div id="d"></div><button id="o"></button>';
    diagram = document.getElementById("d");
    other = document.getElementById("o");
    state.activeSourceElement = diagram;
  });

  afterEach(() => {
    state.activeSourceElement = null;
  });

  test("a diagram opened by clicking it gets focus back, outside the tab order", () => {
    document.activeElement.blur();
    saveFocus();
    const focusSpy = jest.spyOn(diagram, "focus");
    restoreFocus();

    expect(document.activeElement).toBe(diagram);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(diagram.getAttribute("tabindex")).toBe("-1");

    other.focus();
    expect(diagram.hasAttribute("tabindex")).toBe(false);
  });

  test("an existing tabindex on the diagram is left alone", () => {
    diagram.setAttribute("tabindex", "0");
    document.activeElement.blur();
    saveFocus();
    restoreFocus();
    other.focus();
    resetFocusManagement();

    expect(document.activeElement).toBe(other);
    expect(diagram.getAttribute("tabindex")).toBe("0");
  });

  test("destroy removes the tabindex even when the diagram never lost focus", () => {
    document.activeElement.blur();
    saveFocus();
    restoreFocus();
    expect(diagram.getAttribute("tabindex")).toBe("-1");

    resetFocusManagement();
    expect(diagram.hasAttribute("tabindex")).toBe(false);
  });

  test("a focused opener still gets focus back", () => {
    other.focus();
    saveFocus();
    other.blur();
    restoreFocus();

    expect(document.activeElement).toBe(other);
    expect(diagram.hasAttribute("tabindex")).toBe(false);
  });
});

describe("focus restore inside a shadow root", () => {
  let shadow;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    shadow = document.getElementById("host").attachShadow({ mode: "open" });
    shadow.innerHTML = '<div id="d"></div><button id="b"></button>';
  });

  afterEach(() => {
    state.activeSourceElement = null;
  });

  test("the toolbar button gets focus back, not the page body", () => {
    const button = shadow.getElementById("b");
    button.focus();
    saveFocus();
    button.blur();
    restoreFocus();

    expect(shadow.activeElement).toBe(button);
  });

  test("a clicked diagram gets focus back and then drops its tabindex", () => {
    const diagram = shadow.getElementById("d");
    state.activeSourceElement = diagram;
    document.activeElement.blur();
    saveFocus();
    restoreFocus();

    expect(shadow.activeElement).toBe(diagram);
    diagram.blur();
    expect(diagram.hasAttribute("tabindex")).toBe(false);
  });
});
