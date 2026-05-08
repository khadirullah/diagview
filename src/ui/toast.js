/**
 * DiagView Toast Notification System
 * Provides user feedback with success, error, and info states
 * @module ui/toast
 */

import { state } from "../core/config.js";
import { TIMING } from "../core/constants.js";
import { detectTheme } from "../core/theme.js";

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
    bg: "#ef4444",
    text: "#ffffff",
  },
  info: {
    bg: "#6b7280",
    text: "#ffffff",
  },
};

/**
 * Show toast notification
 */
export function showToast(message, type = "success", duration = null) {
  // 1. Ensure container exists and is on top
  let container = document.getElementById("diagview-toast-container");

  // SEC-7: Determine the best parent for the toast container.
  // If the modal is open, we append the toast TO THE MODAL.
  // This ensures that the toast inherits the "Visual Viewport Sync" transform
  // and appears at the correct 1:1 scale even if the background is zoomed.
  const modal = document.getElementById("diagview-modal");
  const targetParent = modal && document.contains(modal) ? modal : document.body;

  if (!container) {
    container = document.createElement("div");
    container.id = "diagview-toast-container";
    container.className = "diagview-toast-container";
    targetParent.appendChild(container);
  } else if (container.parentNode !== targetParent || container.nextSibling) {
    // Re-append to ensure it's in the correct parent and on top
    targetParent.appendChild(container);
  }

  // 2. Create new toast element
  const toast = document.createElement("div");
  toast.className = `diagview-toast diagview-toast-${type}`;
  toast.textContent = message;

  let theme;
  try {
    theme = detectTheme();
  } catch (e) {
    // Fallback to safe theme if detection fails during rapid transitions
    theme = { isDark: true, accent: "#3b82f6", text: "#ffffff" };
  }
  const toastConfig = TOAST_TYPES[type] || TOAST_TYPES.info;

  // 3. Set styles and accessibility
  if (type === "error") {
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    toast.style.backgroundColor = toastConfig.bg;
    toast.style.color = toastConfig.text;
  } else {
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    if (type === "success") {
      toast.style.backgroundColor = theme.accent;
      toast.style.color = theme.isDark ? "#ffffff" : theme.text;
    } else {
      toast.style.backgroundColor = toastConfig.bg;
      toast.style.color = toastConfig.text;
    }
  }

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
      : type === "error"
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
  showToast(`✓ ${message}`, "success");
}

/**
 * Show error toast with detailed message
 */
export function showErrorToast(message, details = null) {
  const fullMessage = details ? `${message}: ${details}` : message;
  showToast(`✕ ${fullMessage}`, "error");
}

/**
 * Show info toast
 */
export function showInfoToast(message) {
  showToast(`ℹ ${message}`, "info");
}

/**
 * Show warning toast (for HTTPS/clipboard issues)
 */
export function showWarningToast(message) {
  showToast(`⚠ ${message}`, "error", 5000); // Longer duration for warnings
}
