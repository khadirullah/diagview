/**
 * DiagView Button Factory
 * Centralized button creation to eliminate duplicate code
 * @module ui/button-factory
 */

import { TIMING } from "../core/constants.js";
import { setSVGContent } from "../core/utils.js";

/**
 * Create an action button with consistent styling and behavior
 *
 * @param {object} config - Button configuration
 * @param {string} config.action - Action identifier (data-action attribute)
 * @param {string} config.title - Tooltip text
 * @param {string} config.icon - SVG icon HTML
 * @param {string} config.styleClass - Additional CSS classes (optional)
 * @param {Function} config.onClick - Click handler (optional)
 * @param {boolean} config.feedback - Show the success tick once onClick has finished,
 *   unless it resolved to false (default: false)
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
  const { action, title, icon, styleClass = "", onClick = null, feedback = false } = config;

  // Create button element
  const btn = document.createElement("button");
  // Without a type, a button inside a page's <form> submits it
  btn.type = "button";
  btn.className = `diagview-btn ${styleClass}`.trim();
  btn.setAttribute("data-action", action);
  btn.setAttribute("title", title);
  btn.setAttribute("aria-label", title);
  setSVGContent(btn, icon, "prepend");

  // Attach click handler
  if (onClick) {
    let successTimer = null;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      let result;
      try {
        result = await onClick(e);
      } catch (error) {
        console.error("DiagView: Button click handler error:", error);
        return;
      }

      // The success tick shows only once the action has worked. A handler
      // reports a failure by resolving to false.
      if (feedback && result !== false) {
        clearTimeout(successTimer);
        btn.classList.add("success");
        successTimer = setTimeout(() => {
          btn.classList.remove("success");
        }, TIMING.BUTTON_SUCCESS_DURATION);
      }
    });
  }

  return btn;
}

/**
 * Create a button group container with buttons
 *
 * @param {Array<object>} buttonConfigs - Array of button configurations
 * @returns {HTMLDivElement} Button group container
 *
 * @example
 * const btnGroup = createButtonGroup([
 *   { action: "copy", title: "Copy", icon: ICONS.copy },
 *   { action: "download", title: "Download", icon: ICONS.dl }
 * ]);
 */
export function createButtonGroup(buttonConfigs) {
  const group = document.createElement("div");
  group.className = "diagview-btn-group";
  group.append(...buttonConfigs.map(createButton));
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
  const { id, icon, label, shortcut = null, onClick = null } = config;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dv-menu-item";
  btn.id = id;

  // Insert the built-in icon then safe text nodes
  setSVGContent(btn, icon, "prepend");
  const labelNode = document.createTextNode(" " + label);
  btn.appendChild(labelNode);
  if (shortcut) {
    const kbd = document.createElement("kbd");
    kbd.textContent = shortcut;
    btn.appendChild(document.createTextNode(" "));
    btn.appendChild(kbd);
  }

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
