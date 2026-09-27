// Compile-only checks for the published declarations in dist/. Run with
// `npm run typecheck` after `npm run build`. Nothing here executes.
// Each @ts-expect-error line must fail to compile, so a type that gets too
// loose breaks the check as well as one that gets too strict.

import DiagView, {
  init,
  initShadowRoot,
  destroy,
  refresh,
  configure,
  getConfiguration,
  exportDiagram,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  exportToWebP,
  exportToPDF,
  copyToClipboard,
  closeModal,
  openFullscreen,
  utils,
  state,
  version,
} from "diagview";
import type { DiagViewConfig, DiagViewOptions, ExportMode, ExportOptions } from "diagview";

declare const el: HTMLElement;
declare const svg: SVGSVGElement;
declare const shadow: ShadowRoot;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(): T | void {}

// Every documented option, with its documented type
const full: DiagViewOptions = {
  diagramSelector: ".diagram, .chart, [data-diagram]",
  accentColor: "#2563eb",
  warningColor: "#f59e0b",
  backgroundColor: null,
  textColor: "#e2e8f0",
  layout: "floating",
  ui: {
    buttons: {
      style: "accent",
      icons: { copy: "<svg></svg>", download: null, fullscreen: null },
    },
  },
  showBranding: true,
  showKeyboardHelp: true,
  helpTimeout: 8000,
  animateOpen: true,
  naturalPanning: false,
  rememberZoom: false,
  showMinimap: true,
  rotateKeepsView: false,
  canvasGrid: "none",
  maxZoomScale: 25,
  minZoomScale: 0.05,
  zoomAnimationDuration: 200,
  panAnimationDuration: 200,
  highResScale: 4,
  mobileScale: 2,
  maxPixels: 16777216,
  exportSearchHighlight: true,
  security: { mode: "strict", allowOverrides: true, allowRemoteResources: false },
  allowedImageTypes: ["png", "jpeg", "webp", "gif"],
  performance: { largeFileThreshold: 1000000, criticalFileLimit: 50000000 },
  toastDuration: 2500,
  errorToastDuration: 5000,
  showFirstTimeThemeHint: true,
  pdfLibraryUrl: "https://example.com/jspdf.js",
  pdfLibraryIntegrity: null,
  onOpen: () => {},
  onClose: () => {},
  onExport: (format: string, filename: string) => void [format, filename],
  onZoomChange: (scale: number) => void scale.toFixed(2),
  onError: (error: Error) => void error.message,
  watermark: {
    enabled: true,
    text: "ACME",
    style: "both",
    position: "four-sides",
    opacity: 0.2,
  },
};

// Every key is optional, nested groups too
const empty: DiagViewOptions = {};
const partialNested: DiagViewOptions = {
  ui: { buttons: { icons: { copy: null } } },
  security: { mode: "off" },
  performance: {},
  watermark: { enabled: true },
};

// Watermark values are matched without regard to case
const caseInsensitive: DiagViewOptions = {
  watermark: { style: "Corner", position: "TOP-LEFT" },
};

// Callbacks may be cleared
const cleared: DiagViewOptions = {
  onOpen: null,
  onClose: null,
  onExport: null,
  onZoomChange: null,
  onError: null,
};

// Unknown keys compile, DiagView warns about them at runtime
const unknownKey: DiagViewOptions = { someOldOption: true };

// Wrong values must not compile
// @ts-expect-error layout is a fixed set of strings
const badLayout: DiagViewOptions = { layout: "sidebar" };
// @ts-expect-error showMinimap is a boolean
const badMinimap: DiagViewOptions = { showMinimap: "yes" };
// @ts-expect-error exportSearchHighlight is a boolean
const badSearchExport: DiagViewOptions = { exportSearchHighlight: "no" };
// @ts-expect-error canvasGrid is a fixed set of strings
const badGrid: DiagViewOptions = { canvasGrid: "lines" };
// @ts-expect-error security.mode is a fixed set of strings
const badMode: DiagViewOptions = { security: { mode: "loose" } };
// @ts-expect-error button style is a fixed set of strings
const badStyle: DiagViewOptions = { ui: { buttons: { style: "outline" } } };
// @ts-expect-error watermark style is a fixed set of strings
const badWatermark: DiagViewOptions = { watermark: { style: "tiled" } };
// @ts-expect-error onZoomChange receives a number
const badZoomCb: DiagViewOptions = { onZoomChange: (scale: string) => void scale };
// @ts-expect-error maxZoomScale is a number
const badZoom: DiagViewOptions = { maxZoomScale: "25" };

void [full, empty, partialNested, caseInsensitive, cleared, unknownKey];
void [badLayout, badMinimap, badGrid, badMode, badStyle, badWatermark, badZoomCb, badZoom];

async function lifecycle(): Promise<void> {
  expectType<Equal<ReturnType<typeof init>, Promise<void>>>();
  expectType<Equal<ReturnType<typeof destroy>, Promise<void>>>();
  await init();
  await init(full);
  await DiagView.init({ layout: "header", showMinimap: false });
  configure({ accentColor: "#ff0000" });
  DiagView.configure();
  refresh();
  initShadowRoot(shadow);
  // @ts-expect-error initShadowRoot needs a shadow root
  initShadowRoot();
  await destroy();
  await DiagView.destroy();
}

function configuration(): void {
  const config: DiagViewConfig = getConfiguration();
  expectType<Equal<typeof config.layout, "header" | "floating" | "off">>();
  expectType<Equal<typeof config.accentColor, string | null>>();
  expectType<Equal<typeof config.warningColor, string>>();
  expectType<Equal<typeof config.security.mode, "strict" | "permissive" | "off">>();
  expectType<Equal<typeof config.ui.buttons.icons.copy, string | null>>();
  expectType<Equal<typeof config.performance.criticalFileLimit, number>>();
  expectType<Equal<typeof config.watermark.opacity, number>>();
  expectType<Equal<typeof config.allowedImageTypes, string[]>>();
  // A full config is valid input for configure()
  configure(config);
  DiagView.getConfiguration().showMinimap satisfies boolean;
}

async function exporting(): Promise<void> {
  const modes: ExportMode[] = [
    "png",
    "svg",
    "jpeg",
    "webp",
    "pdf",
    "copy",
    "copy-svg",
    "png-transparent",
    "webp-transparent",
    "download",
  ];
  // @ts-expect-error gif is not an export mode
  const badMode: ExportMode = "gif";
  void badMode;

  const opts: ExportOptions = { transparent: true, filename: "chart", silent: true };
  expectType<Equal<ReturnType<typeof exportDiagram>, Promise<void>>>();
  for (const mode of modes) await exportDiagram(el, mode);
  await exportDiagram(el, "png", opts);
  await exportDiagram(el, "svg", null);
  await DiagView.exportDiagram(el, "pdf");
  // @ts-expect-error mode is required
  await exportDiagram(el);
  // @ts-expect-error filename is a string
  await exportDiagram(el, "png", { filename: 42 });

  await exportToPNG(el);
  await exportToPNG(el, { transparent: true, filename: "my-chart" });
  await exportToSVG(el, { transparent: true });
  await exportToJPEG(el, { filename: "export" });
  await exportToWebP(el, { transparent: true });
  await exportToPDF(el, { filename: "report" });
  await copyToClipboard(el);
  await DiagView.exportToPNG(el, opts);
  // @ts-expect-error the element is required
  await exportToPNG();
}

async function modal(): Promise<void> {
  expectType<Equal<ReturnType<typeof openFullscreen>, Promise<void>>>();
  expectType<Equal<ReturnType<typeof closeModal>, Promise<void>>>();
  await openFullscreen(el);
  await openFullscreen(el, { zoom: 2.5 });
  await openFullscreen(el, { searchQuery: "database" });
  await DiagView.openFullscreen(el, { zoom: 1.5, searchQuery: "auth" });
  // @ts-expect-error zoom is a number
  await openFullscreen(el, { zoom: "2" });
  await closeModal();
  await DiagView.closeModal();
}

function utilities(): void {
  const s = utils.sanitizeSVG("<svg></svg>", "strict");
  expectType<Equal<typeof s, string | Node | null>>();
  DiagView.utils.sanitizeSVG(svg, "permissive");
  DiagView.utils.sanitizeSVG("<svg></svg>", "strict", { maxChars: 500000 });
  DiagView.utils.sanitizeSVG("<svg></svg>", "off", 500000);
  DiagView.utils.sanitizeSVG("<svg></svg>", "strict", null);
  DiagView.utils.sanitizeSVG("<svg></svg>", "strict", {
    maxChars: 1000,
    allowRemoteResources: true,
    allowedImageTypes: ["png"],
  });
  // @ts-expect-error maxChars is a number
  DiagView.utils.sanitizeSVG("<svg></svg>", "strict", { maxChars: "big" });
  // @ts-expect-error unknown sanitize options are a mistake
  DiagView.utils.sanitizeSVG("<svg></svg>", "strict", { maxchars: 1000 });
  // @ts-expect-error mode is a fixed set of strings
  DiagView.utils.sanitizeSVG("<svg></svg>", "loose");

  expectType<Equal<typeof version, string>>();
  DiagView.version satisfies string;
}

function stateAndEvents(): void {
  state.isInitialized satisfies boolean;
  state.isModalOpen satisfies boolean;
  state.isModalOpening satisfies boolean;
  state.meetingMode satisfies boolean;
  state.readableText satisfies boolean;
  state.currentDiagramIndex satisfies number;
  state.rotationAngle satisfies number;
  state.searchMatches satisfies Element[];
  state.customCanvasColor satisfies string | null;
  state.activeCanvasThemeMode satisfies "auto" | "light" | "dark" | "custom";
  DiagView.state.isModalOpen satisfies boolean;

  const off = state.events.on("dv:toggle-text-select", () => {});
  off();
  const handler = (data: unknown) => void data;
  state.events.on("custom", handler);
  state.events.emit("custom", { a: 1 });
  state.events.off("custom", handler);
  // Events may carry no data
  state.events.emit("custom");

  // @ts-expect-error state is read-only
  state.isModalOpen = true;
  // @ts-expect-error clear() stays internal
  state.events.clear();
}

void [lifecycle, configuration, exporting, modal, utilities, stateAndEvents];
