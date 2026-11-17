/**
 * Save an export as a PDF, with jsPDF loaded on first use
 * @module features/export/pdf
 */

import { state } from "../../core/config.js";
import { loadScript, getDiagramSvg } from "../../core/utils.js";
import { showErrorToast, showProgressToast, showWarningToast } from "../../ui/toast.js";
import { showSaved } from "./notices.js";
import { renderToCanvas, processImageExport } from "./raster.js";

/**
 * Resolves to true once the PDF is saved. The PNG fallback resolves to
 * undefined because no PDF was made.
 * @private
 */
export async function savePDF(sourceElement, filename, { transparent, modalClone, silent }) {
  try {
    showProgressToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    // An element with id="jspdf" also shows up as window.jspdf, so look
    // for the jsPDF class itself
    if (typeof window.jspdf?.jsPDF !== "function") {
      await loadScript(pdfUrl, state.config.pdfLibraryIntegrity, "jspdf").catch(() => {
        // Silently handle load failure, the check below will trigger the fallback UI
      });
    }

    // Fallback: If no jsPDF, save as PNG
    if (typeof window.jspdf?.jsPDF !== "function") {
      showWarningToast("PDF engine unavailable, falling back to PNG...");
      // The same PNG export exportToPNG() makes. Importing that from
      // export.js would make a circular import.
      if (getDiagramSvg(sourceElement)) {
        await processImageExport(sourceElement, {
          filename,
          format: "png",
          transparent: false,
          copy: false,
          modalClone,
          silent: true,
        });
      } else {
        showErrorToast("No diagram found");
      }
      return;
    }

    if (transparent) {
      showWarningToast("PDF format does not support transparency. Using background color.");
    }

    const { canvas, width, height, faint, linked } = await renderToCanvas(
      sourceElement,
      modalClone,
      false, // transparent
      true, // opaque
      silent,
    );
    let imgData;
    try {
      imgData = canvas.toDataURL("image/png");
    } finally {
      // Release the canvas memory, as the image exports do
      canvas.width = 0;
      canvas.height = 0;
    }

    // jsPDF caps a page side at 14400 pt, and its px unit is 96/72 pt, so
    // a side over 10800 px would lose its far end. Shrink the page and the
    // image together to fit.
    const fit = Math.min(1, 10800 / Math.max(width, height));
    const w = width * fit;
    const h = height * fit;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF(w > h ? "l" : "p", "px", [w, h]);
    pdf.addImage(imgData, "PNG", 0, 0, w, h, undefined, "FAST");
    pdf.save(`${filename}.pdf`);
    showSaved("PDF saved", { linked, faint, silent, kind: "PDF" });
    return true;
  } catch (e) {
    if (!e?.dvReported) showErrorToast("PDF Failed", e.message);
  }
}
