/**
 * Builds the browser test site in a temp folder and serves it over HTTP.
 * Playwright starts this through webServer in playwright.config.js.
 *
 * The site keeps the repo layout so relative paths in the pages still work:
 *   dist/                            the local build
 *   demo/                            demo pages, unpkg diagview tags pointed at ../dist
 *   tests/e2e/                       repro.html and fixtures/
 *   node_modules/@panzoom/panzoom/   Panzoom for the test pages
 *
 *   node tests/e2e/serve.mjs [port]   (default 9340, or E2E_PORT)
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.argv[2] || process.env.E2E_PORT || 9340);

if (!fs.existsSync(path.join(root, "dist", "diagview.umd.js"))) {
  console.error("dist/diagview.umd.js not found, run `npm run build` first");
  process.exit(1);
}

// One folder per port, rebuilt on every start, so a killed server leaves at
// most one stale copy behind
const site = path.join(os.tmpdir(), `diagview-e2e-site-${port}`);
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
const copy = (from, to = from) =>
  fs.cpSync(path.join(root, from), path.join(site, to), { recursive: true });
copy("dist");
copy("demo");
copy("tests/e2e/repro.html");
copy("tests/e2e/fixtures");
copy("node_modules/@panzoom/panzoom/dist");

// Load the local build instead of the published one from unpkg
const UNPKG =
  /<script([^>]*)src="https:\/\/unpkg\.com\/diagview@[^/]+\/dist\/diagview\.umd(\.min)?\.js"/g;
for (const name of fs.readdirSync(path.join(site, "demo"))) {
  if (!name.endsWith(".html")) continue;
  const file = path.join(site, "demo", name);
  const html = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, html.replace(UNPKG, '<script$1src="../dist/diagview.umd.js"'));
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.join(site, path.normalize(decodeURIComponent(url.pathname)));
  if (!file.startsWith(site + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
});

const stop = () => {
  server.close();
  fs.rmSync(site, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

server.listen(port, "127.0.0.1", () => {
  console.log(`diagview test site ${site} on http://127.0.0.1:${port}/`);
});
