// Loads the built package the way consumers do, through the "exports" map in
// package.json, and fails if require() or import() does not return the API.
// Also checks that each bundle starts with the license notice.
// Run after `npm run build`.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { version } = require("../package.json");
const dist = path.join(__dirname, "..", "dist");
const bundles = ["diagview.umd.js", "diagview.umd.cjs", "diagview.umd.min.js"];
for (const file of fs.readdirSync(path.join(dist, "esm"))) {
  if (file.endsWith(".js")) bundles.push(`esm/${file}`);
}
for (const file of bundles) {
  const head = fs.readFileSync(path.join(dist, file), "utf8").slice(0, 200);
  assert.match(
    head,
    new RegExp(`^/\\*! DiagView v${version} \\| \\(c\\) .+ \\| MIT License`),
    `${file} has no license notice`,
  );
}

const required = require("diagview");
assert.equal(typeof required.init, "function", 'require("diagview").init is not a function');
assert.ok(!Object.keys(required).includes("default"), 'require("diagview") lists a default key');

import("diagview").then((mod) => {
  assert.equal(typeof mod.init, "function", 'import("diagview") has no init export');
  assert.equal(typeof mod.default.init, "function", 'import("diagview") default has no init');
  console.log("require and import of diagview both return the API");
});
