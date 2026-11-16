// Types for require("diagview"). The CommonJS build exports the DiagView
// object itself, so this file declares it with `export =`. The types come
// from the ESM declarations in index.d.ts, which tsc generates from
// src/index.js. `npm run build:types` copies this file to dist/.

import type {
  default as Api,
  DiagViewConfig as Config,
  DiagViewOptions as Options,
  ExportMode as Mode,
  ExportOptions as ModeOptions,
} from "./index.js" with { "resolution-mode": "import" };

declare const DiagView: typeof Api & {
  /** The same object. Kept for code written against earlier builds. */
  readonly default: typeof Api;
};

declare namespace DiagView {
  type DiagViewConfig = Config;
  type DiagViewOptions = Options;
  type ExportMode = Mode;
  type ExportOptions = ModeOptions;
}

export = DiagView;
