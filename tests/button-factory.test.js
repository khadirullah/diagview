/**
 * Button Factory Tests
 * The success tick follows the result of the click handler, and a button
 * inside a page's form leaves the form alone.
 */
import { jest } from "@jest/globals";
import { createButton, createMenuItem } from "../src/ui/button-factory.js";
import { TIMING } from "../src/core/constants.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("success tick after a click", () => {
  let errorSpy;
  const make = (onClick, feedback = true) =>
    createButton({ action: "copy", title: "Copy", icon: "<svg></svg>", feedback, onClick });

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    jest.useRealTimers();
  });

  test("shows only once the handler has finished, then clears", async () => {
    jest.useFakeTimers();
    let finish;
    const btn = make(() => new Promise((r) => (finish = r)));
    btn.click();
    expect(btn.classList.contains("success")).toBe(false);
    finish(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.classList.contains("success")).toBe(true);
    jest.advanceTimersByTime(TIMING.BUTTON_SUCCESS_DURATION);
    expect(btn.classList.contains("success")).toBe(false);
  });

  test("a handler that resolves to false shows no tick", async () => {
    const btn = make(async () => false);
    btn.click();
    await flush();
    expect(btn.classList.contains("success")).toBe(false);
  });

  test("a handler that throws shows no tick and logs the error", async () => {
    const btn = make(async () => {
      throw new Error("broke");
    });
    btn.click();
    await flush();
    expect(btn.classList.contains("success")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  test("a handler with no result still shows the tick", async () => {
    const btn = make(() => {});
    btn.click();
    await flush();
    expect(btn.classList.contains("success")).toBe(true);
  });

  test("a second success restarts the timer instead of cutting the tick short", async () => {
    jest.useFakeTimers();
    const btn = make(async () => true);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(TIMING.BUTTON_SUCCESS_DURATION - 100);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(200);
    expect(btn.classList.contains("success")).toBe(true);
    jest.advanceTimersByTime(TIMING.BUTTON_SUCCESS_DURATION);
    expect(btn.classList.contains("success")).toBe(false);
  });

  test("a button without feedback never shows it", async () => {
    const btn = make(async () => true, false);
    btn.click();
    await flush();
    expect(btn.classList.contains("success")).toBe(false);
  });
});

describe("a button inside a page's form", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test.each([
    ["toolbar button", () => createButton({ action: "copy", title: "Copy", icon: "<svg></svg>" })],
    ["menu item", () => createMenuItem({ id: "dv-x", icon: "<svg></svg>", label: "Share" })],
  ])("a %s does not submit the form", (_name, make) => {
    const form = document.createElement("form");
    const submit = jest.fn((e) => e.preventDefault());
    form.addEventListener("submit", submit);
    const btn = make();
    form.appendChild(btn);
    document.body.appendChild(form);

    expect(btn.type).toBe("button");
    btn.click();
    expect(submit).not.toHaveBeenCalled();
  });
});
