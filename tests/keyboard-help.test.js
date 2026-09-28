/**
 * Keyboard help panel tests
 * Covers the helpTimeout auto-close and its hover/focus pause, and the rows it lists.
 */

import { jest } from "@jest/globals";

const { resetConfig, updateConfig } = await import("../src/core/config.js");
const {
  showKeyboardHelp,
  hideKeyboardHelp,
  toggleKeyboardHelp,
  isHelpVisible,
  cleanupKeyboardHelp,
} = await import("../src/ui/keyboard-help.js");

describe("Keyboard help auto-close", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetConfig();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanupKeyboardHelp();
    jest.useRealTimers();
  });

  const panel = () => document.getElementById("diagview-help-modal");
  const closeBtn = () => panel().querySelector(".diagview-help-close");
  const card = () => panel().querySelector(".diagview-help-content");

  test("closes after helpTimeout and focuses the close button", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    expect(document.activeElement).toBe(closeBtn());
    expect(isHelpVisible()).toBe(true);

    jest.advanceTimersByTime(1499);
    expect(isHelpVisible()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isHelpVisible()).toBe(false);
  });

  test("closes after the default timeout when helpTimeout is not set", () => {
    showKeyboardHelp();
    jest.advanceTimersByTime(8000);
    expect(isHelpVisible()).toBe(false);
  });

  test("helpTimeout 0 keeps the panel open", () => {
    updateConfig({ helpTimeout: 0 });
    showKeyboardHelp();
    jest.advanceTimersByTime(60000);
    expect(isHelpVisible()).toBe(true);
  });

  // jsdom may lack PointerEvent, so give a plain event the pointer type
  const pointerMove = (pointerType) => {
    const e = new Event("pointermove", { bubbles: true });
    Object.defineProperty(e, "pointerType", { value: pointerType });
    return e;
  };

  test("moving the mouse over the card pauses the timer and leaving restarts it", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(new MouseEvent("mouseenter"));
    card().dispatchEvent(pointerMove("mouse"));
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);

    card().dispatchEvent(new MouseEvent("mouseleave"));
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("a pointer that rests where the card opens does not pause the timer", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    // What WebKit sends when the card appears under a still mouse
    card().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    card().dispatchEvent(new MouseEvent("mouseenter"));
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("a finger or pen moving over the card does not pause the timer", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(pointerMove("touch"));
    card().dispatchEvent(pointerMove("pen"));
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("the pointer on the backdrop does not pause the timer", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    panel().dispatchEvent(pointerMove("mouse"));
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("moving focus back into the panel pauses the timer", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    closeBtn().blur();
    closeBtn().focus();
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);

    closeBtn().blur();
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("every way of closing hands focus back to where it was", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    updateConfig({ helpTimeout: 1500 });
    const ways = [
      () => closeBtn().click(),
      () => panel().click(), // backdrop
      () => hideKeyboardHelp(), // Esc
      () => toggleKeyboardHelp(), // ?
      () => jest.advanceTimersByTime(1500),
    ];
    for (const close of ways) {
      opener.focus();
      showKeyboardHelp();
      expect(document.activeElement).toBe(closeBtn());
      close();
      expect(isHelpVisible()).toBe(false);
      expect(document.activeElement).toBe(opener);
    }
  });

  test("a backdrop click that left focus on the page body still hands it back", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    showKeyboardHelp();
    closeBtn().blur();
    panel().click();
    expect(document.activeElement).toBe(opener);
  });

  test("does not take focus back from a control it has moved to", () => {
    const opener = document.createElement("button");
    const other = document.createElement("input");
    document.body.append(opener, other);
    opener.focus();
    showKeyboardHelp();
    other.focus();
    hideKeyboardHelp();
    expect(document.activeElement).toBe(other);
  });
});

describe("Keyboard help list", () => {
  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    showKeyboardHelp();
  });

  afterEach(() => cleanupKeyboardHelp());

  const row = (desc) =>
    [...document.querySelectorAll(".diagview-help-row")].find(
      (r) => r.querySelector(".diagview-help-desc").textContent === desc,
    );

  test("the Esc row says what Esc closes and in which order", () => {
    expect(row("Close help, search or menu, then the viewer").textContent).toMatch(/^Esc/);
  });

  test("Shift and Arrows show as one combo with a plus between two keys", () => {
    const key = row("Fast pan").querySelector(".diagview-help-key");
    expect([...key.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Shift", "Arrows"]);
    expect(key.textContent).toBe("Shift+Arrows");
  });

  test("alternative keys keep a space between them", () => {
    expect(row("Zoom in").querySelector(".diagview-help-key").textContent).toBe("+ =");
  });

  test("the ? row says it both shows and hides the panel", () => {
    expect(row("Show or hide this help")).toBeDefined();
  });
});
