// 동시 정합 — 조각(관찰 · 제약 · 해석 · 지렛대)을 단위로 놓고, 지지는 서로 올리고 모순은 서로 누르며 한꺼번에 수렴시킨다.
// 사람이 여러 가지를 한꺼번에 놓고 "맞물리는 것"을 찾는 방식(병렬 제약 충족)을 계산으로 옮긴 것이다.
// AI를 부르지 않는다. 같은 조각과 관계를 넣으면 언제나 같은 결과가 나온다. 사람이 조각을 고정하거나 빼면 이 계산만 다시 돈다.
//
// 방법론이 여기서는 프롬프트의 문구가 아니라 네트워크의 구조다:
//   팩트와 사람이 쓴 목표는 값이 고정된 근거다 — 기댄 조각을 올린다
//   제약은 지켜야 한다 · 구조에 관한 조각은 지킨다(관성은 구조에서)
//   과제 전체를 무엇으로 볼 것인가(전체 범위의 해석)는 서로 겨루는 가설이다 — 서로 받치지 않으면 서로 누른다(새로움은 해석에서)
//   더프롬의 기준(아이덴티티)과 이어진 지지는 더 무겁다 · 목표나 약속을 깨는 조각은 눌린다
export const COHERE = { excite: 0.04, inhibit: 0.06, fact: 0.025, goal: 0.025, breaks: 0.09, decay: 0.05, start: 0.01, rounds: 400, eps: 1e-4,
  identityWeight: 1.5, constraint: 0.06, structure: 0.02, rivalry: 0.06, grain: 0.05 };

const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const whole = (a) => a.type === '해석' && (a.scopes || [a.scope]).includes('ALL');

/** 두 사람이 따로 매긴 관계를 합친다 — 둘 다 본 것은 온전히, 한 사람만 본 것은 절반으로 센다. 종류가 엇갈린 것은 뺀다 */
export function mergeRelations(list, atoms) {
  const by = new Map(atoms.map((a) => [a.id, a]));
  const maps = list.map((l) => { const m = new Map(); for (const e of l?.edges || []) { const a = by.get(e.a); const b = by.get(e.b); if (!a || !b || a.id === b.id || a.lens === b.lens) continue; m.set(pair(a.id, b.id), { kind: e.kind === 'contradict' ? 'contradict' : 'support', s: Math.max(1, Math.min(3, +e.s || 1)) }); } return m; });
  const edges = []; let both = 0; let clash = 0;
  for (const k of [...new Set(maps.flatMap((m) => [...m.keys()]))].sort()) {
    const seen = maps.map((m) => m.get(k)).filter(Boolean); const [a, b] = k.split('|');
    if (seen.length > 1 && seen.some((x) => x.kind !== seen[0].kind)) { clash++; continue; }
    if (seen.length > 1) both++;
    edges.push({ a, b, kind: seen[0].kind, s: +(seen.length > 1 ? seen.reduce((n, x) => n + x.s, 0) / seen.length : seen[0].s * (list.length > 1 ? 0.5 : 1)).toFixed(2), n: seen.length });
  }
  const ids = (key) => list.map((l) => new Set((l?.[key] || []).map((x) => (typeof x === 'string' ? x : x?.atom)).filter((x) => by.has(x))));
  const inAny = (sets) => [...new Set(sets.flatMap((s) => [...s]))];
  return { edges, breaks: inAny(ids('goalConflicts')), agree: { both, single: edges.length - both, clash } };
}

/** 네트워크를 짓는다 */
export function buildNet(atoms, rel, opts = {}) {
  const P = { ...COHERE, ...opts }; const n = atoms.length; const idx = new Map(atoms.map((a, i) => [a.id, i]));
  const W = Array.from({ length: n }, () => new Float64Array(n)); const bias = new Float64Array(n);
  const allied = new Set();
  for (const e of rel.edges || []) {
    const i = idx.get(e.a); const j = idx.get(e.b); if (i == null || j == null || i === j) continue;
    const A = atoms[i]; const B = atoms[j];
    let w = e.kind === 'contradict' ? -P.inhibit * e.s : P.excite * e.s * (A.family === B.family ? 0.5 : 1);
    if (e.kind !== 'contradict' && (A.family === 'identity' || B.family === 'identity')) w *= P.identityWeight;
    if (e.kind !== 'contradict') allied.add(pair(e.a, e.b));
    W[i][j] += w; W[j][i] += w;
  }
  const breaks = new Set(rel.breaks || []); const off = new Set(opts.off || []);
  atoms.forEach((a, i) => {
    bias[i] += P.fact * Math.min(3, (a.facts || []).length) + P.goal * Math.min(3, (a.goals || []).length);
    if (breaks.has(a.id)) bias[i] -= P.breaks;
    if (a.type === '제약') bias[i] += P.constraint;
    if (a.layer === '구조') bias[i] += P.structure;
  });
  const reads = atoms.filter(whole);
  for (const x of reads) for (const y of reads) { if (x.id >= y.id || allied.has(pair(x.id, y.id))) continue; const i = idx.get(x.id); const j = idx.get(y.id); W[i][j] -= P.rivalry; W[j][i] -= P.rivalry; }
  return { atoms, idx, W, bias, n, P, off };
}

/** 한꺼번에 수렴시킨다. clamp: Map(조각 id → 고정값) — 사람이 고정한 조각(1)이나 뺀 조각(-1) */
export function settle(net, clamp = new Map()) {
  const { W, bias, n, P, idx } = net; const fixed = new Map([...clamp].map(([id, v]) => [idx.get(id), v]).filter(([i]) => i != null));
  if (!net.adj) net.adj = W.map((row) => { const out = []; for (let j = 0; j < n; j++) if (row[j]) out.push(j, row[j]); return out; });
  let a = new Float64Array(n).fill(P.start); for (const [i, v] of fixed) a[i] = v;
  let rounds = 0; let delta = 1;
  for (; rounds < P.rounds && delta > P.eps; rounds++) {
    const next = new Float64Array(n); delta = 0;
    for (let i = 0; i < n; i++) {
      if (fixed.has(i)) { next[i] = fixed.get(i); continue; }
      let net_i = bias[i]; const row = net.adj[i]; for (let k = 0; k < row.length; k += 2) net_i += row[k + 1] * a[row[k]];
      const v = Math.max(-1, Math.min(1, a[i] * (1 - P.decay) + (net_i > 0 ? net_i * (1 - a[i]) : net_i * (a[i] + 1))));
      next[i] = v; delta = Math.max(delta, Math.abs(v - a[i]));
    }
    a = next;
  }
  return { act: a, rounds, settled: delta <= P.eps };
}

/** 정합도 — 켜진 것끼리 지지하고 모순이 함께 켜지지 않을수록 높다 */
export function harmony(net, act) { let h = 0; for (let i = 0; i < net.n; i++) { h += net.bias[i] * act[i]; for (let j = i + 1; j < net.n; j++) if (net.W[i][j]) h += net.W[i][j] * act[i] * act[j]; } return h; }

/**
 * 제안 — 서로를 살리는 해석의 묶음. 하나로 모으지 않는다.
 * 해석 두 개의 가까움은 네트워크에 물어서 잰다: 한 해석을 빼고 다시 수렴시켰을 때 다른 해석이 얼마나 내려가는가(같이 꺼지면 한 편, 살아나면 맞수).
 * 직접 이어지지 않아도 근거와 근거의 사슬로 이어진 사이가 잡힌다 — 수렴과 묶기가 같은 네트워크 하나에서 나온다. 직접 모순되는 해석은 한 묶음에 들지 않는다.
 * 묶음 두 개를 합쳐서 얻는 것(둘 사이 가까움의 합 − grain × 두 묶음의 크기의 곱)이 가장 큰 쌍부터 합치고, 얻는 것이 없으면 멈춘다. grain이 클수록 잘게 나뉜다.
 * 순서: 과제 전체를 읽은 해석이 살아 있는 묶음이 먼저다(한 영역만 읽은 묶음은 영역 전략의 재료다). 그 안에서는
 * 점수 = 받치는 근거의 세기 − 살아남은 조각과의 부딪힘 × 1.5 − 약속을 깨는 조각 × 3 (근거와 부딪힘은 상대의 수렴한 활성으로 가중 — 눌린 조각과 부딪히는 것은 흠이 아니다).
 * 수렴에서 눌린 해석만으로 된 묶음은 맨 뒤다.
 */
export function proposals(net, rel, act, { count = 3, grain = COHERE.grain, clamp = new Map() } = {}) {
  const atoms = net.atoms; const by = new Map(atoms.map((a) => [a.id, a])); const A = new Map(atoms.map((a, i) => [a.id, act[i]]));
  const isR = (id) => by.get(id)?.type === '해석';
  const reads = atoms.filter((a) => a.type === '해석').map((a) => a.id).sort();
  const near = new Map(); const cap = (v) => Math.max(-1, Math.min(1, v));
  for (const r of reads) {
    if (clamp.has(r)) continue;
    const off = settle(net, new Map([...clamp, [r, -1]])).act;
    for (const o of reads) if (o !== r) near.set(pair(r, o), (near.get(pair(r, o)) || 0) + cap(A.get(o) - off[net.idx.get(o)]));
  }
  for (const e of rel.edges || []) if (e.kind === 'contradict' && isR(e.a) && isR(e.b)) near.set(pair(e.a, e.b), -1);
  let groups = reads.map((id) => [id]);
  const gain = (X, Y) => { let w = 0; for (const x of X) for (const y of Y) w += near.get(pair(x, y)) || 0; return w - grain * X.length * Y.length; };
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++) for (let k = i + 1; k < groups.length; k++) { const g = gain(groups[i], groups[k]); if (g > 1e-9 && (!best || g > best.g + 1e-9)) best = { g, i, k }; }
    if (!best) break;
    groups[best.i] = [...groups[best.i], ...groups[best.k]].sort(); groups.splice(best.k, 1);
  }
  const breaks = new Set(rel.breaks || []);
  const out = groups.map((g) => {
    const set = new Set(g); const ev = new Map(); const hit = new Map(); let sup = 0; let con = 0;
    for (const e of rel.edges || []) {
      const o = set.has(e.a) ? e.b : set.has(e.b) ? e.a : null; if (!o || set.has(o) || !by.has(o)) continue;
      if (e.kind === 'contradict') { con += e.s * Math.max(0, A.get(o)); hit.set(o, (hit.get(o) || 0) + e.s); } else if (!isR(o)) { const w = e.s * Math.max(0, A.get(o)); sup += w; ev.set(o, (ev.get(o) || 0) + w); }
    }
    const all = [...g, ...ev.keys()].map((id) => by.get(id)); const u = (f) => [...new Set(all.flatMap(f))].sort();
    const live = g.filter((id) => A.get(id) > 0).length;
    const whole = g.some((id) => A.get(id) > 0 && (by.get(id).scopes || [by.get(id).scope]).includes('ALL'));
    return { readings: [...g].sort((x, y) => A.get(y) - A.get(x) || (x < y ? -1 : 1)), evidence: [...ev].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([id]) => id), against: [...hit].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([id]) => id),
      facts: u((a) => a.facts || []), goals: u((a) => a.goals || []), scopes: u((a) => a.scopes || [a.scope]), lenses: [...new Set(g.map((id) => by.get(id).lens))], families: [...new Set(g.map((id) => by.get(id).family))],
      broken: g.filter((id) => breaks.has(id)), live, whole, score: +(sup - con * 1.5 - g.filter((id) => breaks.has(id)).length * 3).toFixed(2) };
  }).sort((x, y) => (y.live > 0) - (x.live > 0) || y.whole - x.whole || y.score - x.score || y.readings.length - x.readings.length || (x.readings[0] < y.readings[0] ? -1 : 1));
  return out.slice(0, count).map((p, i) => ({ id: `P${i + 1}`, ...p }));
}
