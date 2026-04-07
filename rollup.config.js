/**
 * Rollup Configuration for DiagView
 * Optimized for production with proper tree-shaking and minification
 */

import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import fs from "fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const production = !process.env.ROLLUP_WATCH;

function stringPlugin() {
  return {
    name: "string",
    transform(code, id) {
      if (id.endsWith(".css")) {
        return {
          code: `export default ${JSON.stringify(code)};`,
          map: { mappings: "" },
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
        targets: {
          browsers: ["> 1%", "last 2 versions", "not dead", "not ie 11"],
        },
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
    unsafe: true,
    unsafe_comps: true,
    warnings: false,
    drop_console: production,
    passes: 2,
  },
  mangle: {
    properties: {
      regex: /^_/,
    },
  },
  format: {
    comments: false,
  },
};

export default [
  // UMD build (browser <script> tag) - NO CODE SPLITTING
  {
    input: "src/index.js",
    output: {
      file: "dist/diagview.umd.js",
      format: "umd",
      name: "DiagView",
      exports: "named",
      globals: {
        "@panzoom/panzoom": "Panzoom",
      },
      banner:
        `/*! DiagView v${pkg.version} | MIT License | github.com/khadirullah/diagview */`,
      inlineDynamicImports: true, // FIX: Inline dynamic imports for UMD
    },
    external: ["@panzoom/panzoom"],
    plugins: [
      stringPlugin(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      babel(babelConfig),
    ],
  },

  // UMD minified (production) - NO CODE SPLITTING
  {
    input: "src/index.js",
    output: {
      file: "dist/diagview.umd.min.js",
      format: "umd",
      name: "DiagView",
      exports: "named",
      globals: {
        "@panzoom/panzoom": "Panzoom",
      },
      sourcemap: production,
      banner: `/*! DiagView v${pkg.version} | MIT License */`,
      inlineDynamicImports: true, // FIX: Inline dynamic imports for UMD
    },
    external: ["@panzoom/panzoom"],
    plugins: [
      stringPlugin(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      babel(babelConfig),
      production && terser(terserConfig),
    ],
  },

  // ESM build (for bundlers like Webpack, Vite, etc.) - SUPPORTS CODE SPLITTING
  {
    input: "src/index.js",
    output: {
      dir: "dist/esm", // Changed from file to dir for code splitting
      format: "esm",
      sourcemap: production,
      banner: `/*! DiagView v${pkg.version} | MIT License */`,
      // Code splitting enabled by default for ESM
    },
    external: ["@panzoom/panzoom"],
    plugins: [
      stringPlugin(),
      babel({
        ...babelConfig,
        presets: [
          [
            "@babel/preset-env",
            {
              targets: {
                esmodules: true,
              },
              modules: false,
              loose: true,
            },
          ],
        ],
      }),
    ],
  },
];
