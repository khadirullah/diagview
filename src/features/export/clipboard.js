/**
 * Clipboard writes for Copy Image and Copy SVG
 * @module features/export/clipboard
 */

import { isClipboardAvailable, copyText } from "../../core/utils.js";

/**
 * Start a clipboard write for an image or markup that is not ready yet.
 * Safari and Firefox let a page write to the clipboard only during the
 * click that asked for it, and making the file takes longer than that. So
 * the write starts at once with a promise of the file, and the browser
 * waits for it. Call it before the first await of the click.
 * @private
 * @param {string} mime - Type of the file
 * @returns {{give: Function, done: Promise<{ok: boolean, error?: *}>|null}|null}
 *   null when the clipboard cannot take it. give(blob) hands over the
 *   file, and give(null, error) says it failed. done settles once the
 *   write ends, and is null where ClipboardItem takes only a finished Blob
 *   (Chrome before 98).
 */
export function startCopy(mime) {
  if (!isClipboardAvailable()) return null;
  let give;
  const file = new Promise((resolve, reject) => {
    give = (blob, error) => (blob ? resolve(blob) : reject(error));
  });
  // A browser that never takes the promise must not report it as unhandled
  file.catch(() => {});
  let done = null;
  try {
    done = navigator.clipboard.write([new ClipboardItem({ [mime]: file })]).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );
  } catch (_e) {
    // ClipboardItem refused the promise, so the finished Blob goes in later
  }
  return { give, done };
}

/**
 * Hand the finished file to a write that startCopy() began. Resolves to
 * true once copied and to false when the browser denies the write. Any
 * other failure of the early write, or a browser that refused the promise,
 * gets one more try with the finished file, which throws if that fails too.
 * @private
 */
export async function finishCopy(clip, mime, blob) {
  clip.give(blob);
  const early = clip.done && (await clip.done);
  if (early?.ok) return true;
  if (early?.error?.name === "NotAllowedError") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    return true;
  } catch (err) {
    if (err?.name !== "NotAllowedError") throw err;
    return false;
  }
}

/**
 * Put SVG markup on the clipboard. Uses the write startCopy() began when
 * there is one, then the text clipboard, then the old copy command.
 * @private
 * @param {object|null} clip - What startCopy() returned
 * @param {string} data - The markup
 * @returns {Promise<boolean|undefined>} True once copied, and false or
 *   undefined when the browser denies the write or has no clipboard
 */
export async function copyMarkup(clip, data) {
  let copied;
  if (clip) {
    copied = await finishCopy(clip, "text/plain", new Blob([data], { type: "text/plain" }));
  } else if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(data);
      copied = true;
    } catch (err) {
      // Firefox and Safari deny the write once the click is too far back
      if (err?.name !== "NotAllowedError") throw err;
    }
  } else {
    copied = copyText(data);
  }
  return copied;
}
