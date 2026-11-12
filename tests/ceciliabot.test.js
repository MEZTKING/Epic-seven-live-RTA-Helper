const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/ceciliabot.js');
const L = require('../js/logic.js');

test('effect ids -> tags (facts from game effect data)', () => {
  // Arbiter Vildred's effects as returned by the CeciliaBot API (checked 2026-11-12)
  const av = { buff: ['stic_att_up', 'stic_demonpower_keep'], debuff: ['stic_blind'], common: ['cmn_multiple_targets', 'cmn_debuff_transfer', 'cmn_ignore_res', 'cmn_skill_cd_down', 'cmn_revive', 'cmn_ab_up', 'cmn_aoe', 'cmn_focus', 'cmn_passive_skill'] };
  assert.deepEqual(C.tagsFromEffects(av), ['aoe', 'attack buff', 'cr push', 'revive']);
  assert.deepEqual(C.tagsFromEffects({ debuff: ['stic_stun', 'stic_def_dn'] }), ['control', 'debuffer', 'defense break', 'stun']);
  assert.deepEqual(C.tagsFromEffects(null), []);
});

test('every mapped tag exists in the app tag list', () => {
  for (const tags of Object.values(C.EFFECT_TAGS)) for (const t of tags) assert.ok(L.TAGS.includes(t), t);
  assert.ok(L.TAGS.includes('debuffer'));
});

test('skill text: escaped, only **bold** allowed', () => {
  assert.equal(C.renderText('Hits **two** enemies <script>'), 'Hits <b>two</b> enemies &lt;script&gt;');
  const s = C.skillsOf({ skills: [{ skill: 1, name: 'Sweep', description: 'a', awakened: { description: 'b' } }, { name: 'X', description: 'c', passive: true, awakened: { description: 'c' } }] });
  assert.deepEqual(s.map((x) => [x.n, x.name, x.awakenedText, x.passive]), [[1, 'Sweep', 'b', false], [2, 'X', '', true]]);
});

test('team check can use automatic tags as their own source', () => {
  const tags = { e1: ['debuffer'], e2: ['debuffer'], m1: ['aoe'], m2: ['aoe'], m3: ['nuker'], m4: ['aoe'] };
  const w = L.compositionWarnings(['m1', 'm2', 'm3', 'm4'], ['e1', 'e2'], null, { tags, source: 'ceciliabot' });
  assert.ok(w.some((x) => /No cleanse/.test(x.text) && x.source === 'ceciliabot'));
});

test('placeholders filled at max enhancement; buff/debuff markup', () => {
  assert.equal(C.renderText('revives to {{variable}} Health', [[0.07, 0.01, 0.01, 0.01]]), 'revives to <b>10%</b> Health');
  assert.equal(C.renderText('deals {{variable}} damage', [[150, 50]]), 'deals <b>200</b> damage');
  assert.equal(C.renderText('++increasing Attack++ then --decreased Hit Chance--'), '<b class="cb-buff">increasing Attack</b> then <b class="cb-debuff">decreased Hit Chance</b>');
  assert.equal(C.renderText('a {{variable}} b'), 'a <b>?</b> b');
});
