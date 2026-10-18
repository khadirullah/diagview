/**
 * Rollup Configuration for DiagView
 * Optimized for production with proper tree-shaking and minification
 */

import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import replace from "@rollup/plugin-replace";
import { visualizer } from "rollup-plugin-visualizer";
import fs from "fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const production = !process.env.ROLLUP_WATCH;
const analyze = !!process.env.ANALYZE;

// The MIT license asks for the copyright notice to stay with every copy.
// terserConfig keeps comments that start with "/*!", so the minified file has it too.
const banner = `/*! DiagView v${pkg.version} | (c) 2026 Khadirullah Mohammad | MIT License | github.com/khadirullah/diagview */`;

// Strip comments and layout whitespace from the CSS that gets inlined into
// the bundles. The rules stay the same. dist/diagview.css keeps the source.
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/ ?([{};>]) ?/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function stringPlugin() {
  return {
    name: "string",
    transform(code, id) {
      if (id.endsWith(".css")) {
        return {
          code: `export default ${JSON.stringify(minifyCss(code))};`,
          map: null,
        };
      }
    },
  };
}

// Common plugins configuration
const babelConfig = {
  babelHelpers: "bundled",
  exclude: "node_modules/**",
  presets: [
    [
      "@babel/preset-env",
      {
        // Both builds use the browserslist field in package.json.
        targets: pkg.browserslist,
        modules: false,
        loose: true,
      },
    ],
  ],
};

// Terser configuration for optimal minification
const terserConfig = {
  compress: {
    pure_getters: true,
    // Drop console.log calls only. console.warn and console.error stay, so
    // a page with a wrong option still gets the message in production.
    pure_funcs: ["console.log"],
    passes: 3,
  },
  mangle: {
    properties: {
      regex: /^_/,
    },
  },
  format: {
    comments: /^!/,
  },
};

export default [
  // UMD build (browser <script> tag) - NO CODE SPLITTING
  // The same bundle is also written as .cjs for require("diagview"). The
  // package is "type": "module", so Node reads any .js file in it as ESM.
  // src/umd.js exports the DiagView object alone, so the global and
  // require() hold the API without a "default" key.
  {
    input: "src/umd.js",
    output: ["dist/diagview.umd.js", "dist/diagview.umd.cjs"].map((file) => ({
      file,
      format: "umd",
      name: "DiagView",
      exports: "default",
      banner,
      inlineDynamicImports: true, // FIX: Inline dynamic imports for UMD
    })),
    plugins: [
      stringPlugin(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      replace({
        __DV_VERSION__: JSON.stringify(pkg.version),
        preventAssignment: true,
      }),
      babel(babelConfig),
    ],
  },

  // UMD minified (production) - NO CODE SPLITTING
  {
    input: "src/umd.js",
    output: {
      file: "dist/diagview.umd.min.js",
      format: "umd",
      name: "DiagView",
      exports: "default",
      sourcemap: production,
      banner,
      inlineDynamicImports: true, // FIX: Inline dynamic imports for UMD
    },
    plugins: [
      stringPlugin(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      replace({
        __DV_VERSION__: JSON.stringify(pkg.version),
        preventAssignment: true,
      }),
      babel(babelConfig),
      production && terser(terserConfig),
      // Bundle analysis — only runs when ANALYZE=1 (never in CI builds)
      analyze &&
        visualizer({
          filename: "dist/bundle-stats.html",
          open: false,
          gzipSize: true,
          title: `DiagView v${pkg.version} Bundle Analysis`,
        }),
    ],
  },

  // ESM build (for bundlers like Webpack, Vite, etc.) - SUPPORTS CODE SPLITTING
  {
    input: "src/index.js",
    output: {
      dir: "dist/esm", // Changed from file to dir for code splitting
      format: "esm",
      sourcemap: production,
      banner,
      // Code splitting enabled by default for ESM
    },
    plugins: [
      stringPlugin(),
      replace({
        __DV_VERSION__: JSON.stringify(pkg.version),
        preventAssignment: true,
      }),
      babel(babelConfig),
    ],
  },
];
