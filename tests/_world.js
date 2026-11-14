// A made-up world with planted effects, shared by the model and planner tests (the idea of E7DaT's tests/fake_world.py).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 40 heroes, 150 players. Planted: c1001 strong (+0.6), c1002 + c1003 strong together (+0.9), c1004 beats c1005
 * (+0.9), first pick +0.15, c1006 is an AVERAGE hero that the 12 best players love (skill +1.0), c1009 is pre-banned
 * a lot by the second-pick player, c1010 is the usual opener of the first-pick side when c1002 follows.
 */
function world(games, seed = 1) {
  const R = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const codes = Array.from({ length: 40 }, (_, i) => `c${1001 + i}`);
  const strength = Object.fromEntries(codes.map((c) => [c, gauss() * 0.15]));
  strength.c1001 = 0.6;
  strength.c1006 = 0;
  const players = Array.from({ length: 150 }, (_, i) => ({ nick: 1000 + i, world: ['world_kor', 'world_asia', 'world_global'][i % 3], grade: i < 100 ? 'legend' : i < 140 ? 'emperor' : 'warlord', skill: i < 12 ? 1.0 : gauss() * 0.35, fan: i < 12 }));
  const teamZ = (team, other) => {
    let z = 0;
    for (const h of team) z += strength[h];
    if (team.includes('c1002') && team.includes('c1003')) z += 0.9;
    if (team.includes('c1004') && other.includes('c1005')) z += 0.9;
    return z;
  };
  // turn order (DEVLOG #51), from its own random stream: c1008 is the fastest hero by far, c1010 the next; c1007 is
  // strong with the first turn (+0.8) and weak without it (−0.4); the side that moves first gets +0.2
  const R2 = rng(seed + 1000);
  const speed = Object.fromEntries(codes.map((c) => [c, 180 + R2() * 120]));
  speed.c1008 = 330;
  speed.c1010 = 312;
  const rows = [];
  for (let g = 0; g < games; g++) {
    const A = players[Math.floor(R() * players.length)];
    let B = A;
    while (B === A) B = players[Math.floor(R() * players.length)];
    const aFirst = R() < 0.5;
    const pre = (second) => {
      const out = [];
      if (second && R() < 0.6) out.push('c1009');
      while (out.length < 2) {
        const c = codes[20 + Math.floor(R() * 20)];
        if (!out.includes(c)) out.push(c);
      }
      return out;
    };
    const preA = pre(!aFirst);
    const preB = pre(aFirst);
    const gone = new Set([...preA, ...preB]);
    const draft = (p, first) => {
      const picks = [];
      const want = [];
      if (first && R() < 0.5) want.push('c1010', 'c1002'); // the usual opening of the first side
      if (p.fan) want.push('c1006');
      if (R() < 0.35) want.push('c1001');
      if (R() < 0.3) want.push('c1002', 'c1003');
      if (R() < 0.25) want.push('c1004');
      if (R() < 0.25) want.push('c1005');
      for (const c of want) if (!gone.has(c) && !picks.includes(c) && picks.length < 5) picks.push(c);
      while (picks.length < 5) {
        const c = codes[Math.floor(R() * 20)];
        if (!gone.has(c) && !picks.includes(c) && (c !== 'c1006' || R() < 0.3)) picks.push(c); // c1006: mostly its fans play it
      }
      for (const c of picks) gone.add(c);
      return picks;
    };
    const pa = draft(A, aFirst);
    const pb = draft(B, !aFirst);
    const banA = pa[[0, 1, 3, 4][Math.floor(R() * 4)]];
    const banB = pb[[0, 1, 3, 4][Math.floor(R() * 4)]];
    const ta = pa.filter((h) => h !== banA);
    const tb = pb.filter((h) => h !== banB);
    const gear = [(R2() - 0.5) * 20, (R2() - 0.5) * 20];
    const raw = [ta, tb].map((team, k) => Object.fromEntries(team.map((h) => [h, speed[h] + gear[k] + (R2() - 0.5) * 16])));
    const top = Math.max(...Object.values(raw[0]), ...Object.values(raw[1]));
    const energy = raw.map((m) => Object.fromEntries(Object.entries(m).map(([h, v]) => [h, Math.round((v / top) * 1000) / 10])));
    const turn = Math.max(...Object.values(raw[0])) > Math.max(...Object.values(raw[1])) ? 1 : -1;
    const dep = (team, mine) => (team.includes('c1007') ? (mine ? 0.8 : -0.4) : 0);
    const z = teamZ(ta, tb) - teamZ(tb, ta) + A.skill - B.skill + (aFirst ? 0.15 : -0.15) + 0.2 * turn + dep(ta, turn > 0) - dep(tb, turn < 0);
    const day = `2026-11-${String(1 + Math.floor((g / games) * 12)).padStart(2, '0')}`;
    rows.push({ seq: String(g), day, date: day + 'T10:00:00Z', season: 'pvp_rta_ss21', rule: '', aGrade: A.grade, bGrade: B.grade, aFirst, aWin: R() < 1 / (1 + Math.exp(-z)), aNick: A.nick, aWorld: A.world, bNick: B.nick, bWorld: B.world, a: { picks: pa, ban: banA, prebans: preA, energy: energy[0] }, b: { picks: pb, ban: banB, prebans: preB, energy: energy[1] } });
  }
  return rows;
}

module.exports = { rng, world };
