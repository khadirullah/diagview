// Compile-only checks for require("diagview") in a CommonJS TypeScript
// project. Run with `npm run typecheck` after `npm run build`. Nothing here
// executes. ../api.ts checks the full API through import.

import DiagView = require("diagview");

declare const el: HTMLElement;

const options: DiagView.DiagViewOptions = { layout: "floating" };
const ready: Promise<void> = DiagView.init(options);
const config: DiagView.DiagViewConfig = DiagView.getConfiguration();
const mode: DiagView.ExportMode = "png";
const exportOptions: DiagView.ExportOptions = { silent: true };
const saved: Promise<boolean> = DiagView.exportDiagram(el, mode, exportOptions);
const version: string = DiagView.version;
const sameObject: typeof DiagView.default = DiagView.default;

// @ts-expect-error init takes an options object, not a string
DiagView.init("floating");

void [ready, config, saved, version, sameObject];
