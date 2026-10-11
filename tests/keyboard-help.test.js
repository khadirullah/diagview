/**
 * Keyboard help panel tests
 * Covers when helpTimeout closes the panel, and the rows it lists.
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

  // The viewer that holds the panel. A click on the card's text moves focus here.
  let viewer;
  beforeEach(() => {
    viewer = document.createElement("div");
    viewer.id = "diagview-modal";
    viewer.tabIndex = -1;
    document.body.appendChild(viewer);
  });

  // Focus leaves the card, then the check runs once it has landed
  const leaveCard = async () => {
    viewer.focus();
    await Promise.resolve();
  };

  test("stays open while focus is on it, as after the ? key", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    expect(document.activeElement).toBe(closeBtn());
    jest.advanceTimersByTime(60000);
    expect(isHelpVisible()).toBe(true);
  });

  test("stays open past the default timeout too", () => {
    showKeyboardHelp();
    jest.advanceTimersByTime(10000);
    expect(isHelpVisible()).toBe(true);
  });

  test("closes after helpTimeout once focus has left the card", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(1499);
    expect(isHelpVisible()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isHelpVisible()).toBe(false);
  });

  test("closes after the default timeout once focus has left the card", async () => {
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(7999);
    expect(isHelpVisible()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isHelpVisible()).toBe(false);
  });

  test("helpTimeout 0 keeps the panel open after focus has left", async () => {
    updateConfig({ helpTimeout: 0 });
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(60000);
    expect(isHelpVisible()).toBe(true);
  });

  test("focus coming back into the card stops the timer", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(1000);
    closeBtn().focus();
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);
  });

  test("the whole window losing focus does not start the timer", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    const hasFocus = jest.spyOn(document, "hasFocus").mockReturnValue(false);
    closeBtn().blur();
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);
    hasFocus.mockRestore();
  });

  // jsdom may lack PointerEvent, so give a plain event the pointer type
  const pointerMove = (pointerType) => {
    const e = new Event("pointermove", { bubbles: true });
    Object.defineProperty(e, "pointerType", { value: pointerType });
    return e;
  };

  test("the mouse over the card holds it open and leaving starts the timer", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(new MouseEvent("mouseenter"));
    card().dispatchEvent(pointerMove("mouse"));
    await leaveCard();
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);

    card().dispatchEvent(new MouseEvent("mouseleave"));
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("the mouse leaving does not start the timer while focus is in the card", () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(pointerMove("mouse"));
    card().dispatchEvent(new MouseEvent("mouseleave"));
    jest.advanceTimersByTime(5000);
    expect(isHelpVisible()).toBe(true);
  });

  test("a pointer that rests where the card opens does not hold it open", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    // What WebKit sends when the card appears under a still mouse
    card().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    card().dispatchEvent(new MouseEvent("mouseenter"));
    await leaveCard();
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("a finger or pen moving over the card does not hold it open", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(pointerMove("touch"));
    card().dispatchEvent(pointerMove("pen"));
    await leaveCard();
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("the pointer on the backdrop does not hold it open", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    panel().dispatchEvent(pointerMove("mouse"));
    await leaveCard();
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("a touch on the card restarts the timer", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(1000);
    card().dispatchEvent(new Event("touchstart"));
    jest.advanceTimersByTime(1000);
    expect(isHelpVisible()).toBe(true);
    jest.advanceTimersByTime(500);
    expect(isHelpVisible()).toBe(false);
  });

  test("a mouse left over the card when it closed does not hold it open next time", async () => {
    updateConfig({ helpTimeout: 1500 });
    showKeyboardHelp();
    card().dispatchEvent(pointerMove("mouse"));
    hideKeyboardHelp();
    showKeyboardHelp();
    await leaveCard();
    jest.advanceTimersByTime(1500);
    expect(isHelpVisible()).toBe(false);
  });

  test("every way of closing hands focus back to where it was", async () => {
    const opener = document.createElement("button");
    viewer.appendChild(opener);
    updateConfig({ helpTimeout: 1500 });
    const ways = [
      () => closeBtn().click(),
      () => panel().click(), // backdrop
      () => hideKeyboardHelp(), // Esc
      () => toggleKeyboardHelp(), // ?
      async () => {
        // A click on the card's text, then the timer
        await leaveCard();
        jest.advanceTimersByTime(1500);
      },
    ];
    for (const close of ways) {
      opener.focus();
      showKeyboardHelp();
      expect(document.activeElement).toBe(closeBtn());
      await close();
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

  test("Enter and Shift+Enter step through search matches", () => {
    expect(row("Next search match").querySelector(".diagview-help-key").textContent).toBe("Enter");
    const back = row("Previous search match").querySelector(".diagview-help-key");
    expect(back.textContent).toBe("Shift+Enter");
  });

  test("alternative keys keep a space between them", () => {
    expect(row("Zoom in").querySelector(".diagview-help-key").textContent).toBe("+ =");
  });

  test("the ? row says it both shows and hides the panel", () => {
    expect(row("Show or hide this help")).toBeDefined();
  });
});
