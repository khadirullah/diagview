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

// 2. Update README.md version strings (e.g. diagview@1.0.4)
updateFile(
  'README.md',
  /diagview@[0-9.]+/g,
  `diagview@${version}`
);

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
