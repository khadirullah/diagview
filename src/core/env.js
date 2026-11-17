import { TIMING } from "./constants.js";
import { forgetScreenFix } from "./svg-geometry.js";
/**
 * DiagView browser environment helpers
 * The viewport watch, device checks, clipboard, downloads and script loading
 * @module core/env
 */

/**
 * Check if code is running in browser
 */
export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

let isMobileCache = null;

let watchingViewport = false;

const forgetViewport = () => {
  isMobileCache = null;
  forgetScreenFix();
};

/**
 * Start or stop watching the window for a resize or a turn of the device.
 * isMobileDevice() and getClientCTM() call watchViewport(true) when they
 * first cache an answer, and a resize then drops their cached answers.
 * watchViewport(false), run by destroy(), removes the listeners and drops
 * the cached answers too.
 * @param {boolean} on - true to listen, false to stop and forget the answers
 */
export function watchViewport(on) {
  if (!on) forgetViewport();
  if (watchingViewport === on) return;
  watchingViewport = on;
  ["resize", "orientationchange"].forEach((type) =>
    window[on ? "addEventListener" : "removeEventListener"](type, forgetViewport),
  );
}

/**
 * Detect if device is mobile/touch-capable
 */
export function isMobileDevice() {
  if (isMobileCache !== null) return isMobileCache;
  if (!isBrowser()) return false;
  watchViewport(true);
  isMobileCache =
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.matchMedia?.("(max-width: 768px)").matches;
  return isMobileCache;
}

/**
 * Download a file from URL
 */
export function downloadFile(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (url.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(url), TIMING.RESOURCE_REVOKE_DELAY);
  }
}

/**
 * Check if the clipboard can take an image. Copy Image needs both
 * clipboard.write and ClipboardItem, so a page that has only one gets the
 * download in place of an error.
 */
export function isClipboardAvailable() {
  return (
    isBrowser() &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem === "function"
  );
}

/**
 * Lazy load script
 */
/**
 * Registry for in-flight script load promises to prevent redundant requests.
 * @private
 */
const SCRIPT_PROMISES = new Map();

/**
 * Page tags for a URL that failed while loadScript waited for them
 * @private
 */
const FAILED_SCRIPTS = new WeakSet();

/**
 * Whether a script has defined the global `name`. The browser also puts an
 * element with id="name" on window, so an element does not count.
 * @param {string} name - Global name, such as "jspdf"
 * @returns {boolean} True when a script defined it
 * @private
 */
function hasScriptGlobal(name) {
  const value = window[name];
  return value !== undefined && !(value instanceof Element || value instanceof HTMLCollection);
}

/**
 * Lazy load script with synchronization to prevent thundering herd race conditions.
 *
 * @param {string} url - Script URL
 * @param {string|null} [integrity=null] - SRI hash
 * @param {string} [globalName] - Global the script defines, such as "jspdf".
 *   A page tag that has loaded without it counts as failed.
 * @returns {Promise<void>} Rejects when the script fails to load or takes
 *   longer than TIMING.SCRIPT_LOAD_TIMEOUT. A <script> for the URL that the
 *   page already has resolves once it has loaded, or at once when the
 *   global it defines is there. A failed load leaves no
 *   tag behind, so the next call tries again.
 */
export function loadScript(url, integrity = null, globalName) {
  if (!isBrowser()) return Promise.resolve();

  const absoluteUrl = new URL(url, window.location.href).href;

  // Return existing promise if this URL is already being loaded
  if (SCRIPT_PROMISES.has(absoluteUrl)) {
    return SCRIPT_PROMISES.get(absoluteUrl);
  }

  // MEM-2: Prevent memory leaks by capping the script cache size
  const MAX_SCRIPT_CACHE = 20;
  if (SCRIPT_PROMISES.size >= MAX_SCRIPT_CACHE) {
    const firstKey = SCRIPT_PROMISES.keys().next().value;
    SCRIPT_PROMISES.delete(firstKey);
  }

  const promise = new Promise((resolve, reject) => {
    // A tag another part of the page added. Its download has a timing
    // entry once it is over, and one that failed has an entry too, so the
    // global it defines decides. One still loading gets waited for.
    let script = Array.from(document.scripts).find(
      (s) => s.src === absoluteUrl && !FAILED_SCRIPTS.has(s),
    );
    // The global alone shows the tag has run, as a page that calls
    // performance.clearResourceTimings() leaves no timing entry.
    if (script && globalName && hasScriptGlobal(globalName)) {
      resolve();
      return;
    }
    if (script && performance.getEntriesByName?.(absoluteUrl).length) {
      if (!globalName) {
        resolve();
        return;
      }
      FAILED_SCRIPTS.add(script);
      script = undefined;
    }

    const addedHere = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = url;
      script.async = true;
      if (integrity) {
        script.integrity = integrity;
        script.crossOrigin = "anonymous";
      }
      document.head.appendChild(script);
    }
    // A const copy for the listeners below, as script is reassigned above
    const tag = script;

    /** @param {string} message - Why it failed */
    const fail = (message) => {
      clearTimeout(timer);
      // Our own tag goes, so the next call adds a fresh one. A page tag
      // stays, and the next call stops waiting for it.
      if (addedHere) tag.remove();
      else FAILED_SCRIPTS.add(tag);
      reject(new Error(message));
    };

    // A stalled download fails after a while so the caller can fall back
    const timer = setTimeout(
      () => fail(`Timed out loading script: ${url}`),
      TIMING.SCRIPT_LOAD_TIMEOUT,
    );
    tag.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    });
    tag.addEventListener("error", () => {
      let errorMsg = `Failed to load script: ${url}`;
      if (integrity) {
        errorMsg += ". This may be due to a Subresource Integrity (SRI) mismatch.";
      }
      fail(errorMsg);
    });
  });

  // Store promise to synchronize other callers
  SCRIPT_PROMISES.set(absoluteUrl, promise);

  // If the load fails, remove it from the cache to allow retries later
  promise.catch(() => SCRIPT_PROMISES.delete(absoluteUrl));

  return promise;
}

/**
 * Copy text the old way, through a hidden field and execCommand("copy"),
 * for pages without the Clipboard API. The field is removed again even
 * when execCommand throws.
 * @param {string} text - Text to copy
 * @returns {boolean|undefined} False when the browser refuses to copy,
 *   undefined when it has no execCommand
 */
export function copyText(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand?.("copy");
  } finally {
    field.remove();
  }
}
