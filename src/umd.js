/**
 * Entry for the UMD and CommonJS builds. They export the DiagView object
 * itself, so window.DiagView and require("diagview") hold only the API.
 * The ESM build keeps src/index.js with its named and default exports.
 */
import DiagView from "./index.js";

// Earlier UMD builds exposed the module namespace, so code may still read
// DiagView.default. Keep it working without listing it as a key.
Object.defineProperty(DiagView, "default", { value: DiagView });

export default DiagView;
