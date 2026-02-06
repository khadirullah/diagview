/**
 * DiagView Toast Notification System
 * Provides user feedback with success, error, and info states
 * @module ui/toast
 */

import { state } from "../core/config.js";
import { TIMING } from "../core/constants.js";
import { detectTheme } from "../core/theme.js";

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
  const toast = document.getElementById("diagview-toast");
  if (!toast) return;

  // Clear existing timer
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }

  const theme = detectTheme();
  const toastConfig = TOAST_TYPES[type] || TOAST_TYPES.info;

  // Set colors
  if (type === "success") {
    toast.style.backgroundColor = theme.accent;
    toast.style.color = theme.isDark ? "#ffffff" : theme.text;
  } else {
    toast.style.backgroundColor = toastConfig.bg;
    toast.style.color = toastConfig.text;
  }

  toast.textContent = message;

  // Reset transition
  toast.style.transition = "none";
  toast.style.opacity = "0";

  // Trigger reflow
  requestAnimationFrame(() => {
    toast.style.transition = "opacity 0.3s ease";
    toast.style.opacity = "1";
  });

  // Auto-hide
  const hideAfter =
    duration !== null
      ? duration
      : type === "error"
        ? TIMING.ERROR_TOAST_DURATION
        : TIMING.TOAST_DURATION;

  if (hideAfter > 0) {
    state.toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      state.toastTimer = null;
    }, hideAfter);
  }
}

/**
 * Hide toast immediately
 */
export function hideToast() {
  const toast = document.getElementById("diagview-toast");
  if (!toast) return;

  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }

  toast.style.opacity = "0";
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
