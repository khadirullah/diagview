// Loads the built package the way consumers do, through the "exports" map in
// package.json, and fails if require() or import() does not return the API.
// Run after `npm run build`.
const assert = require("node:assert/strict");

const required = require("diagview");
assert.equal(typeof required.init, "function", 'require("diagview").init is not a function');
assert.ok(!Object.keys(required).includes("default"), 'require("diagview") lists a default key');

import("diagview").then((mod) => {
  assert.equal(typeof mod.init, "function", 'import("diagview") has no init export');
  assert.equal(typeof mod.default.init, "function", 'import("diagview") default has no init');
  console.log("require and import of diagview both return the API");
});
