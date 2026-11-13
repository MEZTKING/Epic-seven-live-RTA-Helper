// window.prompt() does nothing in the desktop app (Electron), so no page script may use it (DEVLOG #40: "I can't add a
// new war" was exactly that). Ask through js/ask.js (E7Ask) instead.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
test('no page script calls prompt()', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f.name)) files.push(p);
    }
  };
  walk(path.join(root, 'js'));
  for (const f of fs.readdirSync(root)) if (f.endsWith('.html')) files.push(path.join(root, f));
  const bad = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return; // comments
      if (/(^|[^\w.])(window\.)?prompt\(/.test(line.replace(/\/\/.*$/, ''))) bad.push(`${path.relative(root, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
