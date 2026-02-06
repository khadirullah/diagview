/**
 * DiagView Button Factory
 * Centralized button creation to eliminate duplicate code
 * @module ui/button-factory
 */

import { TIMING } from "../core/constants.js";

/**
 * Create an action button with consistent styling and behavior
 *
 * @param {object} config - Button configuration
 * @param {string} config.action - Action identifier (data-action attribute)
 * @param {string} config.title - Tooltip text
 * @param {string} config.icon - SVG icon HTML
 * @param {string} config.styleClass - Additional CSS classes (optional)
 * @param {Function} config.onClick - Click handler (optional)
 * @param {boolean} config.feedback - Show success animation on click (default: false)
 * @param {string} config.ariaLabel - Accessibility label (defaults to title)
 * @returns {HTMLButtonElement} Configured button element
 *
 * @example
 * const copyBtn = createButton({
 *   action: "copy",
 *   title: "Copy to clipboard",
 *   icon: ICONS.copy,
 *   styleClass: "dv-btn-accent",
 *   feedback: true,
 *   onClick: () => exportDiagram(element, "copy")
 * });
 */
export function createButton(config) {
  const {
    action,
    title,
    icon,
    styleClass = "",
    onClick = null,
    feedback = false,
    ariaLabel = null,
  } = config;

  // Validate required fields
  if (!action || !title || !icon) {
    console.warn("DiagView: Button requires action, title, and icon");
    return null;
  }

  // Create button element
  const btn = document.createElement("button");
  btn.className = `diagview-btn ${styleClass}`.trim();
  btn.setAttribute("data-action", action);
  btn.setAttribute("title", title);
  btn.setAttribute("aria-label", ariaLabel || title);
  btn.innerHTML = icon;

  // Add feedback flag if enabled
  if (feedback) {
    btn.dataset.feedback = "true";
  }

  // Attach click handler
  if (onClick) {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      // Show success animation if feedback enabled
      if (feedback) {
        btn.classList.add("success");
        setTimeout(() => {
          btn.classList.remove("success");
        }, TIMING.BUTTON_SUCCESS_DURATION);
      }

      // Execute handler
      try {
        await onClick(e);
      } catch (error) {
        console.error("DiagView: Button click handler error:", error);
        // Remove success state on error
        if (feedback) {
          btn.classList.remove("success");
        }
      }
    });
  }

  return btn;
}

/**
 * Create multiple buttons at once
 *
 * @param {Array<object>} configs - Array of button configurations
 * @returns {Array<HTMLButtonElement>} Array of button elements
 *
 * @example
 * const buttons = createButtons([
 *   { action: "copy", title: "Copy", icon: ICONS.copy, feedback: true },
 *   { action: "download", title: "Download", icon: ICONS.dl, feedback: true },
 *   { action: "fullscreen", title: "Fullscreen", icon: ICONS.fs }
 * ]);
 */
export function createButtons(configs) {
  return configs.map((config) => createButton(config)).filter(Boolean);
}

/**
 * Create a button group container with buttons
 *
 * @param {Array<object>} buttonConfigs - Array of button configurations
 * @param {string} className - Additional CSS class for the group (optional)
 * @returns {HTMLDivElement} Button group container
 *
 * @example
 * const btnGroup = createButtonGroup([
 *   { action: "copy", title: "Copy", icon: ICONS.copy },
 *   { action: "download", title: "Download", icon: ICONS.dl }
 * ], "my-custom-group");
 */
export function createButtonGroup(buttonConfigs, className = "") {
  const group = document.createElement("div");
  group.className = `diagview-btn-group ${className}`.trim();

  const buttons = createButtons(buttonConfigs);
  buttons.forEach((btn) => {
    if (btn) group.appendChild(btn);
  });

  return group;
}

/**
 * Create a menu item button (for floating menu)
 *
 * @param {object} config - Menu item configuration
 * @param {string} config.id - Element ID
 * @param {string} config.icon - SVG icon HTML
 * @param {string} config.label - Button label text
 * @param {string} config.shortcut - Keyboard shortcut (optional)
 * @param {Function} config.onClick - Click handler (optional)
 * @param {string} config.className - Additional CSS classes (optional)
 * @returns {HTMLButtonElement} Menu item button
 *
 * @example
 * const shareBtn = createMenuItem({
 *   id: "dv-share",
 *   icon: ICONS.share,
 *   label: "Share Link",
 *   shortcut: "L",
 *   onClick: () => shareLink(index)
 * });
 */
export function createMenuItem(config) {
  const {
    id,
    icon,
    label,
    shortcut = null,
    onClick = null,
    className = "",
  } = config;

  if (!id || !icon || !label) {
    console.warn("DiagView: Menu item requires id, icon, and label");
    return null;
  }

  const btn = document.createElement("button");
  btn.className = `dv-menu-item ${className}`.trim();
  btn.id = id;

  // Build inner HTML
  let html = `${icon} ${label}`;
  if (shortcut) {
    html += ` <kbd>${shortcut}</kbd>`;
  }
  btn.innerHTML = html;

  // Attach click handler
  if (onClick) {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      try {
        await onClick(e);
      } catch (error) {
        console.error("DiagView: Menu item click handler error:", error);
      }
    });
  }

  return btn;
}

/**
 * Create multiple menu items at once
 *
 * @param {Array<object>} configs - Array of menu item configurations
 * @returns {Array<HTMLButtonElement>} Array of menu item buttons
 */
export function createMenuItems(configs) {
  return configs.map((config) => createMenuItem(config)).filter(Boolean);
}

/**
 * Update button state (active/inactive)
 *
 * @param {HTMLButtonElement|string} buttonOrId - Button element or ID
 * @param {boolean} active - Active state
 *
 * @example
 * setButtonActive("dv-meeting", true); // Activate meeting mode button
 * setButtonActive(button, false); // Deactivate button
 */
export function setButtonActive(buttonOrId, active) {
  const btn =
    typeof buttonOrId === "string"
      ? document.getElementById(buttonOrId)
      : buttonOrId;

  if (!btn) return;

  btn.classList.toggle("active", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

/**
 * Disable/enable button
 *
 * @param {HTMLButtonElement|string} buttonOrId - Button element or ID
 * @param {boolean} disabled - Disabled state
 *
 * @example
 * setButtonDisabled("copy-btn", true); // Disable button
 * setButtonDisabled(button, false); // Enable button
 */
export function setButtonDisabled(buttonOrId, disabled) {
  const btn =
    typeof buttonOrId === "string"
      ? document.getElementById(buttonOrId)
      : buttonOrId;

  if (!btn) return;

  btn.disabled = disabled;
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");
}

/**
 * Trigger button success animation manually
 *
 * @param {HTMLButtonElement|string} buttonOrId - Button element or ID
 *
 * @example
 * triggerButtonSuccess("copy-btn"); // Show checkmark animation
 */
export function triggerButtonSuccess(buttonOrId) {
  const btn =
    typeof buttonOrId === "string"
      ? document.getElementById(buttonOrId)
      : buttonOrId;

  if (!btn) return;

  btn.classList.add("success");
  setTimeout(() => {
    btn.classList.remove("success");
  }, TIMING.BUTTON_SUCCESS_DURATION);
}
