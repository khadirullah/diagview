/**
 * DiagView Toast Notification System
 * Provides user feedback with success, error, and info states
 * @module ui/toast
 */

import { state } from "../core/config.js";
import { TIMING, COLORS } from "../core/constants.js";
import { detectTheme, noticeColors } from "../core/theme.js";
import { setSVGContent } from "../core/utils.js";
import { addModalListener } from "../core/lifecycle.js";
import { ICONS } from "./icons.js";

/**
 * Track toast-specific timers to ensure they are properly cleared
 * without affecting other library features.
 * @type {Set<number>}
 */
const toastTimers = new Set();

/**
 * Toast types with colors
 */
const TOAST_TYPES = {
  success: {
    bg: null, // Will use accent color
    text: "#ffffff",
  },
  error: {
    bg: "#d73d3d",
    text: "#ffffff",
  },
  info: {
    bg: "#6b7280",
    text: "#ffffff",
  },
};

/**
 * Icons drawn in front of the message. SVG rather than Unicode symbols,
 * which some platforms render as colour emoji or with different glyphs.
 */
const TYPE_ICONS = {
  success: ICONS.check,
  error: ICONS.close,
  info: ICONS.info,
  warning: ICONS.warning,
  busy: ICONS.spinner,
  textSelect: ICONS.textSelect,
};

/**
 * Show toast notification
 * @param {string} message - Text to show
 * @param {string} [type="success"] - success, error, warning or info
 * @param {number|null} [duration] - Time on screen in ms, 0 to keep it
 * @param {string|null} [icon] - Type icon to draw first, a key of TYPE_ICONS
 * @returns {HTMLElement} The toast element
 */
export function showToast(message, type = "success", duration = null, icon = null) {
  // 1. Ensure container exists and is on top
  let container = document.getElementById("diagview-toast-container");

  // SEC-7: Determine the best parent for the toast container.
  // If the modal is open, we append the toast TO THE MODAL.
  // This ensures that the toast inherits the "Visual Viewport Sync" transform
  // and appears at the correct 1:1 scale even if the background is zoomed.
  // The modal element stays in the DOM after init but is display:none while
  // closed, so only use it while it is open.
  const modal = document.getElementById("diagview-modal");
  const targetParent =
    modal && document.contains(modal) && modal.classList.contains("open") ? modal : document.body;

  if (!container) {
    container = document.createElement("div");
    container.id = "diagview-toast-container";
    container.className = "diagview-toast-container";
    targetParent.appendChild(container);
  } else if (container.parentNode !== targetParent || container.nextSibling) {
    // Re-append to ensure it's in the correct parent and on top
    targetParent.appendChild(container);
  }

  // Only the latest notice shows, so a result replaces its progress notice.
  // Errors and warnings stay for their full time unless another one follows.
  const alert = type === "error" || type === "warning";
  container
    .querySelectorAll(alert ? ".diagview-toast" : ".diagview-toast:not([role=alert])")
    .forEach((t) => t.remove());

  // 2. Create new toast element
  const toast = document.createElement("div");
  toast.className = `diagview-toast diagview-toast-${type}`;
  toast.textContent = message;
  if (TYPE_ICONS[icon]) {
    // Decorative only. Screen readers announce just the message.
    setSVGContent(toast, TYPE_ICONS[icon], "prepend");
    const svg = toast.firstElementChild;
    if (svg) {
      svg.setAttribute(
        "class",
        icon === "busy" ? "diagview-toast-icon diagview-toast-spin" : "diagview-toast-icon",
      );
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
    }
  }

  let theme;
  try {
    theme = detectTheme();
  } catch (e) {
    // Fallback to safe theme if detection fails during rapid transitions
    theme = { isDark: true, accent: "#3b82f6", text: "#ffffff", onAccent: "#fff" };
  }
  const toastConfig = TOAST_TYPES[type] || TOAST_TYPES.info;
  // The accent and warning colour are the developer's, so their text is
  // picked to reach 4.5:1
  const colors =
    type === "success"
      ? noticeColors(theme.accent)
      : type === "warning"
        ? noticeColors(theme.warning || COLORS.WARNING)
        : toastConfig;

  // 3. Set styles and accessibility
  if (alert) {
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
  } else {
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
  }
  toast.style.backgroundColor = colors.bg;
  toast.style.color = colors.text;

  // 4. Animation - Initial state
  toast.style.opacity = "0";
  toast.style.transform = "translateY(10px) scale(0.95)";
  toast.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

  container.appendChild(toast);

  // Trigger entrance animation
  const rafId = requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0) scale(1)";
    state.asyncTasks.rafs.delete(rafId);
  });
  state.asyncTasks.rafs.add(rafId);

  // 5. Auto-hide
  const hideAfter =
    duration !== null
      ? duration
      : alert
        ? state.config.errorToastDuration || TIMING.ERROR_TOAST_DURATION
        : state.config.toastDuration || TIMING.TOAST_DURATION;

  if (hideAfter > 0) {
    const timerId = setTimeout(() => {
      toastTimers.delete(timerId);
      state.asyncTasks.timeouts.delete(timerId);
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px) scale(0.95)";

      // Remove from DOM after transition
      const removeTimerId = setTimeout(() => {
        toastTimers.delete(removeTimerId);
        state.asyncTasks.timeouts.delete(removeTimerId);
        toast.remove();
        // Remove container if empty
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
      toastTimers.add(removeTimerId);
      state.asyncTasks.timeouts.add(removeTimerId);
    }, hideAfter);
    toastTimers.add(timerId);
    state.asyncTasks.timeouts.add(timerId);
  }

  return toast;
}

/**
 * Hide all toasts immediately and cancel pending animations
 */
export function hideToast() {
  const container = document.getElementById("diagview-toast-container");
  if (container) {
    container.remove();
  }

  // Safely cancel only the toast-related timers
  toastTimers.forEach((id) => {
    clearTimeout(id);
    state.asyncTasks.timeouts.delete(id);
  });
  toastTimers.clear();
}

/**
 * Show success toast with checkmark
 */
export function showSuccessToast(message) {
  showToast(message, "success", null, "success");
}

/**
 * Show error toast with detailed message
 */
export function showErrorToast(message, details = null) {
  const fullMessage = details ? `${message}: ${details}` : message;
  showToast(fullMessage, "error", null, "error");
}

/**
 * Show info toast
 * @returns {HTMLElement} The toast element
 */
export function showInfoToast(message, duration = null) {
  return showToast(message, "info", duration, "info");
}

/** Removers for the listeners that close the first-time theme hint */
let hintListeners = [];

/**
 * Show the first-time theme hint as a callout above the menu button. The
 * first press or wheel on the diagram closes it, like opening the menu does.
 * @param {string} message - Text to show, a newline starts the second line
 * @param {HTMLElement} viewport - The viewer's diagram area
 */
export function showMenuHint(message, viewport) {
  showInfoToast(message, 6000).classList.add("diagview-toast-menu-hint");
  hintListeners = ["pointerdown", "wheel"].map((type) =>
    addModalListener(viewport, type, closeMenuHint, { capture: true, passive: true }),
  );
}

/**
 * Close the first-time theme hint and remove the listeners that close it
 */
export function closeMenuHint() {
  document.querySelector(".diagview-toast-menu-hint")?.remove();
  hintListeners.forEach((remove) => remove());
  hintListeners = [];
}

/**
 * Show info toast with a spinning ring, for work the user waits on
 * @returns {HTMLElement} The toast element
 */
export function showProgressToast(message) {
  return showToast(message, "info", null, "busy");
}

/**
 * Show warning toast (for HTTPS/clipboard issues)
 */
export function showWarningToast(message) {
  showToast(message, "warning", 5000, "warning"); // Longer duration for warnings
}
