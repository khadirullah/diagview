import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

function updateFile(filePath, regex, replacement) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const newContent = content.replace(regex, replacement);
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated version in ${filePath}`);
  }
}

// 1. Update demo-runtime.js version string
updateFile(
  'demo/demo-runtime.js',
  /var DV_VERSION = '[^']+';/,
  `var DV_VERSION = '${version}';`
);

// 2. Update version strings in README.md and docs/*.md (e.g. diagview@1.0.4)
updateFile(
  'README.md',
  /diagview@[0-9.]+/g,
  `diagview@${version}`
);
if (fs.existsSync('docs')) {
  for (const file of fs.readdirSync('docs')) {
    if (file.endsWith('.md')) {
      updateFile(
        `docs/${file}`,
        /diagview@[0-9]+\.[0-9]+\.[0-9]+/g,
        `diagview@${version}`
      );
    }
  }
}

// 3. Fix README duplicate keys in configuration example
const readmePath = 'README.md';
if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');

  // Remove the redundant 'rememberZoom' and 'animateOpen' under 'Feature toggles'
  // as they are already defined under 'Features'.
  const redundantBlock = /  \/\/ Feature toggles\n  showMinimap: true,            \/\/ Toggle minimap visibility\n  rememberZoom: false,         \/\/ Remember zoom per diagram\n  animateOpen: true,\n\n/g;
  const cleanBlock = '  // Feature toggles\n  showMinimap: true,            // Toggle minimap visibility\n\n';

  const newReadme = readme.replace(redundantBlock, cleanBlock);
  if (readme !== newReadme) {
    fs.writeFileSync(readmePath, newReadme);
    console.log('Fixed duplicate keys in README.md');
  }
}

// 4. Sync the jest global __DV_VERSION__ in package.json itself.
// Without this it silently drifts every release (it sat at 1.0.6 through
// three releases) and tests assert DiagView.version against a stale value.
if (pkg.jest?.globals && pkg.jest.globals.__DV_VERSION__ !== version) {
  pkg.jest.globals.__DV_VERSION__ = version;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Updated jest global __DV_VERSION__ in package.json');
}

// 5. Update CDN script tags in all demo HTML files
const demoDir = 'demo';
if (fs.existsSync(demoDir)) {
  const files = fs.readdirSync(demoDir);
  for (const file of files) {
    if (file.endsWith('.html')) {
      updateFile(
        `${demoDir}/${file}`,
        /unpkg\.com\/diagview@[0-9.]+/g,
        `unpkg.com/diagview@${version}`
      );
    }
  }
}
