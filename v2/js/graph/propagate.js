// 전파와 수렴 — AI를 부르지 않는 결정적 계산.
// 같은 신호와 엣지를 넣으면 언제나 같은 묶음이 나온다. 사람이 엣지를 고치면 이 계산만 다시 돈다.

export const POSITIVE = new Set(['cause', 'condition', 'reinforce']);
export const DIRECTED = new Set(['cause', 'condition']);
const FAMILY_COUNT = 3;
const COVERAGE = { 0: 0, 1: 0.2, 2: 0.6, 3: 1 };

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : lo));
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 에너지 — 신호가 다른 노드의 신호와 얼마나 맞물리는가.
 * e = (1-d)·자기 강도 + d·(1 - exp(-받은 지지)).
 * 원인·조건은 결과 쪽으로 온전히, 전제 쪽으로는 절반이 흐른다(많은 판단의 전제가 되는 신호도 중요하다). 강화는 양쪽으로 흐른다.
 * 다른 노드군에서 온 지지는 온전히, 같은 노드군은 절반만 센다. 긴장은 에너지를 주지 않는다.
 */
export function energies(signals, edges, { damping = 0.5, rounds = 24, identityWeight = 1 } = {}) {
  const live = signals.filter((s) => !s.muted);
  const fam = new Map(live.map((s) => [s.id, s.family]));
  const base = new Map(live.map((s) => [s.id, clamp(s.strength)]));
  const incoming = new Map(live.map((s) => [s.id, []]));
  for (const e of edges) {
    if (!POSITIVE.has(e.type) || !fam.has(e.from) || !fam.has(e.to)) continue;
    const cross = fam.get(e.from) === fam.get(e.to) ? 0.5 : 1;
    const w = clamp(e.weight) * cross;
    // 아이덴티티 판단이 주는 지지는 더 무겁다 — 더프롬의 관점과 이어진 판단이 앞에 선다
    const lift = (id) => (fam.get(id) === 'identity' ? identityWeight : 1);
    incoming.get(e.to).push({ src: e.from, w: w * lift(e.from) });
    incoming.get(e.from).push({ src: e.to, w: (DIRECTED.has(e.type) ? w * 0.5 : w) * lift(e.to) });
  }
  let cur = new Map(base);
  for (let r = 0; r < rounds; r++) {
    const next = new Map();
    for (const s of live) {
      const support = incoming.get(s.id).reduce((sum, i) => sum + i.w * cur.get(i.src), 0);
      next.set(s.id, (1 - damping) * base.get(s.id) + damping * (1 - Math.exp(-support)));
    }
    cur = next;
  }
  return cur;
}

function neighbors(edges, live) {
  const map = new Map([...live].map((id) => [id, []]));
  for (const e of edges) {
    if (!live.has(e.from) || !live.has(e.to) || e.from === e.to) continue;
    map.get(e.from).push({ id: e.to, w: clamp(e.weight), type: e.type });
    map.get(e.to).push({ id: e.from, w: clamp(e.weight), type: e.type });
  }
  return map;
}

/**
 * 수렴한 묶음 찾기.
 * 씨앗 신호에서 시작해, 지금 묶음과 가장 굳게 이어진 신호를 하나씩 더한다(이어진 엣지 무게의 합 · 같은 이슈면 1.25배).
 * 한 신호에 이웃이 많다고 다 데려오지 않는다 — 묶음 전체와 이어진 것만 들어온다.
 * 빠진 노드군이 있으면 묶음과 이어진 신호 중에서 그 노드군을 먼저 데려온다.
 * 점수 = 에너지 합 × 노드군 범위(1군 0.2 · 2군 0.6 · 3군 1) × (1 + 0.2 × 안에 든 긴장 수).
 * 서로 절반 이상 겹치는 묶음은 하나만 남긴다.
 */
export function clusters(signals, edges, energy, { count = 3, size = 7, minGain = 0.5, overlap = 0.5 } = {}) {
  const live = signals.filter((s) => !s.muted);
  const sig = new Map(live.map((s) => [s.id, s]));
  const nb = neighbors(edges, new Set(sig.keys()));
  const en = (id) => energy.get(id) || 0;
  const candidates = [];

  for (const seed of live) {
    const members = new Set([seed.id]);
    const families = () => new Set([...members].map((id) => sig.get(id).family));
    const gains = () => {
      const g = new Map();
      for (const m of members) for (const n of nb.get(m)) if (!members.has(n.id)) g.set(n.id, (g.get(n.id) || 0) + n.w);
      return [...g].map(([id, w]) => ({ id, gain: w * (sig.get(id).issue === seed.issue ? 1.25 : 1) }))
        .sort((x, y) => y.gain - x.gain || en(y.id) - en(x.id) || byId(x.id, y.id));
    };
    while (members.size < size) {
      const ranked = gains();
      // 빠진 노드군이 있고 들어올 자리가 얼마 남지 않았으면 그 노드군을 먼저 데려온다
      const missing = FAMILY_COUNT - families().size;
      const need = missing > 0 && size - members.size <= missing ? ranked.find((r) => !families().has(sig.get(r.id).family)) : null;
      const best = need || ranked[0];
      if (!best || best.gain < minGain) break;
      members.add(best.id);
    }
    if (members.size < 3) continue;

    const ids = [...members].sort(byId);
    const inside = edges.filter((e) => members.has(e.from) && members.has(e.to));
    const fams = [...new Set(ids.map((id) => sig.get(id).family))].sort();
    const tensions = inside.filter((e) => e.type === 'tension').length;
    const sum = ids.reduce((t, id) => t + en(id), 0);
    candidates.push({
      seed: seed.id, members: ids, families: fams,
      lenses: [...new Set(ids.map((id) => sig.get(id).lens))].sort(),
      issues: [...new Set(ids.map((id) => sig.get(id).issue))].sort(),
      edges: inside.map((e) => e.id), tensions,
      score: sum * COVERAGE[fams.length] * (1 + 0.2 * tensions),
      light: fams.length / FAMILY_COUNT,
    });
  }

  candidates.sort((a, b) => b.score - a.score || byId(a.seed, b.seed));
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => {
      const inter = c.members.filter((m) => p.members.includes(m)).length;
      return inter / Math.min(c.members.length, p.members.length) >= overlap;
    });
    if (!tooClose) picked.push(c);
  }
  return picked.map((c, i) => ({ id: `C${i + 1}`, ...c, score: +c.score.toFixed(3) }));
}

/** 연결 통계 — 유실을 숫자로 본다 */
export function linkStats(signals, edges) {
  const live = signals.filter((s) => !s.muted);
  const fam = new Map(live.map((s) => [s.id, s.family]));
  const ok = edges.filter((e) => fam.has(e.from) && fam.has(e.to));
  const touched = new Set(ok.flatMap((e) => [e.from, e.to]));
  const byType = { cause: 0, condition: 0, reinforce: 0, tension: 0 };
  for (const e of ok) byType[e.type] = (byType[e.type] || 0) + 1;
  return {
    signals: live.length,
    edges: ok.length,
    crossFamily: ok.filter((e) => fam.get(e.from) !== fam.get(e.to)).length,
    isolated: live.filter((s) => !touched.has(s.id)).map((s) => s.id),
    byType,
  };
}

export function propagate(signals, edges, opts = {}) {
  const energy = energies(signals, edges, opts);
  return { energy, clusters: clusters(signals, edges, energy, opts), stats: linkStats(signals, edges) };
}
