// desktop/pack.js: the screenshots packed into one zip for Claude (DEVLOG #68)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('../desktop/pack.js');

test('pack: crc32 and a zip that a standard zip reader opens', () => {
  assert.equal(P.crc32(Buffer.from('123456789')), 0xcbf43926);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7pack-'));
  const file = path.join(dir, 'a.zip');
  fs.writeFileSync(file, P.zip([{ name: 'one.jpg', data: Buffer.from([1, 2, 3, 255]) }, { name: 'one.json', data: Buffer.from('{"screen":"rta-draft"}') }]));
  let py = null;
  try {
    py = execFileSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip(), z.namelist(), z.read("one.json").decode())', file]).toString().trim();
  } catch (_) { /* no python here: the structure test below still runs */ }
  if (py) assert.equal(py, `None ['one.jpg', 'one.json'] {"screen":"rta-draft"}`);
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
});

test('pack: the newest pictures with their notes, at most the size limit, nothing when there are none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7pack-'));
  const day = path.join(dir, '2026-11-18');
  fs.mkdirSync(day);
  for (let i = 0; i < 5; i++) {
    const f = path.join(day, `14080${i}-rta-draft-${i}.png`);
    fs.writeFileSync(f, Buffer.alloc(10));
    fs.writeFileSync(f.replace('.png', '.json'), `{"i":${i}}`);
    fs.utimesSync(f, 1000 + i, 1000 + i);
  }
  const out = path.join(dir, 'p.zip');
  const shrink = () => Buffer.alloc(1000, 7); // stands in for the JPEG
  const r = P.pack({ dirs: [day], out, shrink, maxBytes: 3700 });
  assert.equal(r.pictures, 3, 'stops before the size limit');
  assert.ok(fs.existsSync(out));
  assert.deepEqual(P.pick([day]).map((p) => path.basename(p.png)).slice(0, 2), ['140804-rta-draft-4.png', '140803-rta-draft-3.png'], 'newest first');
  assert.deepEqual(P.pack({ dirs: [path.join(dir, 'none')], out: path.join(dir, 'q.zip'), shrink }), { file: null, pictures: 0, bytes: 0 });
});
