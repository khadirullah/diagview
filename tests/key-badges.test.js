/**
 * Key badges on touch screens
 * The stylesheet hides the menu's key badges and the "Press ? for shortcuts"
 * hint on touch-only screens until the modal has the dv-keys class. The first
 * key press outside a text field sets it for the rest of the page visit.
 * Its own file, because the flag lives for as long as the module does.
 */
import { jest } from "@jest/globals";
import { init, destroy } from "../src/index.js";

const modalHasKeys = () => document.getElementById("diagview-modal").classList.contains("dv-keys");

const press = (target, init) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, ...init }));

describe("key badges on touch screens", () => {
  beforeAll(async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    await init();
  });

  afterAll(() => destroy());

  test("typing into a text field does not count as a keyboard", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const field = document.body.appendChild(document.createElement(tag));
      press(field, { key: "a" });
    }
    const editable = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(editable, "isContentEditable", { value: true });
    press(editable, { key: "a" });
    expect(modalHasKeys()).toBe(false);
  });

  test("keys from an on-screen keyboard or an input method do not count", () => {
    press(document.body, { key: "Unidentified" });
    press(document.body, { key: "Process" });
    press(document.body, { key: "a", isComposing: true });
    expect(modalHasKeys()).toBe(false);
  });

  test("the first other key press shows the badges", () => {
    press(document.body, { key: "Shift" });
    expect(modalHasKeys()).toBe(true);
  });

  test("the badges stay shown on the modal a new init() builds", async () => {
    await destroy();
    expect(document.getElementById("diagview-modal")).toBeNull();
    await init();
    expect(modalHasKeys()).toBe(true);
  });
});
