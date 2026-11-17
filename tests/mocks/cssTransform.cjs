// Jest transform for CSS imports. The module's default export is the file's
// text, as in the build, so injected <style> tags hold the real rules.
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
