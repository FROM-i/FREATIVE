// 경쟁 — 분석해서 하나로 종합하는 대신, 여러 안을 만들어 겨루게 하고 이긴 안을 고친다.
//
//   후보 모으기   노드가 자기 기준을 끝까지 민 완성안 + 묶음 통합안 + 충돌하는 두 안의 교배안
//   기본안 대조   기본안과 같은 해법은 탈락
//   비교 선별     점수로 자르지 않는다. 사유(기본안과 같음 · 얻는 것 없음)가 있을 때만 떨어뜨리고, 나머지는 1:1로 겨룬다
//   결선 자리     승수 상위 + 기본안과 가장 다른 안 + 한 가지가 뚜렷한 안 + 상위를 이긴 안. 같은 해법은 2개까지
//   결선          모두 한 번씩, 두 번 판정한다. 두 판정이 갈리면 무승부로 두고 "갈림"으로 표시한다
//   공격 · 보완   이긴 안의 약점을 찾아 고친다. 실현 조건은 탈락 사유가 아니라 고칠 대상이다
//   재대결        고친 안과 고치기 전 안이 겨뤄 이긴 쪽을 남긴다
//
// 선별의 잣대는 모두 더프롬의 관점(knowledge/viewpoint.js)이다. 순위 계산은 코드가 한다.
import { crossPrompt, screenPrompt, duelPrompt, attackPrompt, revisePrompt } from '../../knowledge/prompts-arena.js';
import { FAMILIES } from '../../knowledge/nodes.js';
import { lensName } from '../graph/model.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const SCREEN = ['같음', '일부', '다름'];

/** 노드가 낸 완성안을 정리한다 (발화 단계에서 부른다) */
export function shapeProposal(raw, lens, frames) {
  const p = raw?.proposal;
  if (!p || !text(p.concept)) return null;
  const ids = new Set(['R0', ...frames.map((f) => f.id)]);
  return { lens: lens.id, family: lens.family, frame: ids.has(text(p.frame)) ? text(p.frame) : 'R0', title: text(p.title) || lens.name, concept: text(p.concept), visual: text(p.visual), gain: text(p.gain) };
}

/** 문제 정의 정리 */
export function shapeFrames(raw, facts = []) {
  const ok = new Set(facts.map((f) => f.id));
  return (Array.isArray(raw?.frames) ? raw.frames : []).map((f) => ({ frame: text(f.frame), why: text(f.why), risk: text(f.risk), facts: (Array.isArray(f.facts) ? f.facts : []).map(text).filter((id) => ok.has(id)) }))
    .filter((f) => f.frame).slice(0, 4).map((f, i) => ({ id: `R${i + 1}`, ...f }));
}

/** 교배할 짝 — 충돌 연결 중 무게가 큰 것부터, 두 노드가 모두 완성안을 냈고 같은 노드 짝은 한 번만 */
export function crossPairs(run, count) {
  const byLens = new Map((run.proposals || []).map((p) => [p.lens, p]));
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const seen = new Set(); const out = [];
  const tensions = run.edges.filter((e) => e.type === 'tension').sort((a, b) => (b.weight * ((run.energy[b.from] || 0) + (run.energy[b.to] || 0))) - (a.weight * ((run.energy[a.from] || 0) + (run.energy[a.to] || 0))) || a.id.localeCompare(b.id));
  for (const e of tensions) {
    const a = sig.get(e.from); const b = sig.get(e.to);
    if (!a || !b || a.lens === b.lens || !byLens.has(a.lens) || !byLens.has(b.lens)) continue;
    const key = [a.lens, b.lens].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key); out.push({ edge: e, a: byLens.get(a.lens), b: byLens.get(b.lens) });
    if (out.length >= count) break;
  }
  return out;
}

/** 모두 한 번씩 겨루는 대진 — 순서와 자리(안 1 · 안 2)는 id로 정해 언제나 같다 */
export function roundRobin(ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) pairs.push(hash(`${ids[i]}|${ids[k]}`) < 0.5 ? [ids[i], ids[k]] : [ids[k], ids[i]]);
  return pairs.sort((x, y) => hash(x.join('>')) - hash(y.join('>'))).map(([a, b], n) => ({ id: `D${n + 1}`, a, b }));
}

/** 승수로 순위 — 같으면 채점 점수, 그래도 같으면 id */
export function standings(ids, duels, scores) {
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const d of duels) { if (d.split) { if (d.a in wins) wins[d.a] += 0.5; if (d.b in wins) wins[d.b] += 0.5; } else if (d.winner in wins) wins[d.winner]++; }
  return ids.slice().sort((a, b) => wins[b] - wins[a] || (scores[b] || 0) - (scores[a] || 0) || a.localeCompare(b, undefined, { numeric: true })).map((id, i) => ({ id, wins: wins[id], rank: i + 1 }));
}

/** 조별 대진 — 승수가 비슷한 후보끼리, 이미 만난 짝은 피해서 붙인다. 남는 하나는 쉰다. */
export function swissPairs(ids, wins, met, round) {
  const order = ids.slice().sort((a, b) => (wins[b] || 0) - (wins[a] || 0) || hash(`${a}#${round}`) - hash(`${b}#${round}`));
  const pairs = []; const used = new Set();
  for (let i = 0; i < order.length; i++) {
    const a = order[i]; if (used.has(a)) continue;
    const b = order.slice(i + 1).find((x) => !used.has(x) && !met.has([a, x].sort().join('|'))) || order.slice(i + 1).find((x) => !used.has(x));
    if (!b) break;
    used.add(a); used.add(b);
    pairs.push(hash(`${a}|${b}|${round}`) < 0.5 ? { id: `S${round + 1}-${pairs.length + 1}`, a, b } : { id: `S${round + 1}-${pairs.length + 1}`, a: b, b: a });
  }
  return pairs;
}

/**
 * 결선 자리 — 점수 합이 아니라 자리로 채운다. 무난한 안만 올라가지 않게 한다.
 *   상위      조별 대결 승수 상위 3
 *   다른 안   기본안과 "다름" 판정을 받았고, 아직 올라온 적 없는 문제 정의에 답한 안
 *   뚜렷한 안 대결 판정에서 "한 가지가 뚜렷하다"고 가장 많이 짚인 안
 *   상위를 이긴 안  상위 자리의 안을 이긴 적 있는 안
 * 같은 해법 묶음(family)은 결선에 2개까지만 올린다.
 */
export function pickSeats(live, wins, notable, duels, size) {
  const order = live.slice().sort((a, b) => (wins[b.id] || 0) - (wins[a.id] || 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const seats = []; const fam = {};
  const famOf = (c) => c.screen?.family || c.id;
  const take = (c, seat) => { if (!c || seats.some((x) => x.c === c) || (fam[famOf(c)] || 0) >= 2 || seats.length >= size) return false; seats.push({ c, seat }); fam[famOf(c)] = (fam[famOf(c)] || 0) + 1; return true; };
  for (const c of order) { if (seats.length >= Math.min(3, size)) break; take(c, '상위'); }
  const frames = () => new Set(seats.map((x) => x.c.origin.frame || 'R0'));
  const diff = order.filter((c) => c.screen?.verdict === '다름');
  take(diff.find((c) => !frames().has(c.origin.frame || 'R0')) || diff.find((c) => !seats.some((x) => x.c === c)), '다른 안');
  take(order.filter((c) => (notable[c.id] || 0) > 0).sort((a, b) => notable[b.id] - notable[a.id])[0], '뚜렷한 안');
  const top = new Set(seats.filter((x) => x.seat === '상위').map((x) => x.c.id));
  take(order.find((c) => duels.some((d) => d.winner === c.id && (top.has(d.a) || top.has(d.b)) && !top.has(c.id))), '상위를 이긴 안');
  for (const c of order) take(c, '승수');
  return seats;
}

/**
 * 경쟁을 돌린다. run.insights(묶음 통합안)를 후보로 넣고, 끝나면 이긴 안으로 run.insights를 바꾼다.
 * @param {{ project, run, call, emit, pool }} ctx
 */
export async function arena({ project, run, call, emit, pool }) {
  const s = project.settings;
  const before = run.calls;
  const sig = new Map(run.signals.map((x) => [x.id, x]));
  const cands = [];
  const add = (c) => { const k = { id: `K${cands.length + 1}`, status: '후보', ...c }; cands.push(k); return k; };

  // 1) 후보 모으기 — 노드의 완성안
  for (const p of run.proposals || []) add({ title: p.title, concept: p.concept, visual: p.visual, gain: p.gain, origin: { type: 'node', lens: p.lens, frame: p.frame, signals: run.signals.filter((x) => x.lens === p.lens).map((x) => x.id) } });
  // 묶음 통합안
  for (const n of run.insights) add({ title: n.title, concept: n.concept || n.insight, visual: n.visual, gain: `${n.substitute.who} ${n.substitute.changes}`.trim(), origin: { type: 'cluster', insight: n.id, signals: n.check.used }, source: n });
  // 충돌 교배
  emit('stage', { stage: 'cross' });
  const pairs = crossPairs(run, s.crossCount ?? 5);
  await pool(pairs, s.concurrency, async (pr) => {
    const a = cands.find((c) => c.origin.type === 'node' && c.origin.lens === pr.a.lens); const b = cands.find((c) => c.origin.type === 'node' && c.origin.lens === pr.b.lens);
    const p = crossPrompt(project, a, b, pr.edge.why, run.baseline);
    const raw = await call({ role: 'director', ...p, task: { kind: 'cross', project, a, b, edge: pr.edge } });
    if (text(raw?.concept)) add({ title: text(raw.title) || `${a.title} × ${b.title}`, concept: text(raw.concept), visual: text(raw.visual), gain: text(raw.gain), how: text(raw.how), origin: { type: 'cross', lenses: [pr.a.lens, pr.b.lens], edge: pr.edge.id, signals: [pr.edge.from, pr.edge.to] } });
  });
  cands.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // 2) 기본안 대조 — 같은 해법은 탈락
  emit('stage', { stage: 'screen' });
  if (run.baseline?.concepts?.length) {
    const p = screenPrompt(project, cands, run.baseline);
    const raw = await call({ role: 'brain', ...p, task: { kind: 'screen', project, candidates: cands, baseline: run.baseline } });
    const bids = new Set(run.baseline.concepts.map((c) => c.id));
    for (const x of Array.isArray(raw?.screens) ? raw.screens : []) {
      const c = cands.find((k) => k.id === text(x.id));
      if (c && SCREEN.includes(text(x.verdict))) c.screen = { nearest: bids.has(text(x.nearest)) ? text(x.nearest) : '', verdict: text(x.verdict), why: text(x.why), family: text(x.family), empty: x.empty === true, breaks: text(x.breaks) };
    }
    // 떨어뜨리는 것은 사유가 있을 때뿐이다 — 기본안과 같거나, 사람이 얻는 것이 없거나
    for (const c of cands) { if (c.screen?.verdict === '같음') c.status = '탈락 — 기본안과 같음'; else if (c.screen?.empty) c.status = '탈락 — 얻는 것 없음'; }
  }
  let live = cands.filter((c) => c.status === '후보');
  if (live.length < 2) { for (const c of cands) c.status = '후보'; live = cands.slice(); run.notes.push('기본안 대조에서 후보가 거의 다 탈락해, 탈락 없이 진행했다'); }

  // 3) 비교 선별 — 점수를 매기지 않는다. 남은 후보끼리 조별로 겨뤄 결선 자리를 정한다.
  emit('stage', { stage: 'duel' });
  const byId = new Map(cands.map((c) => [c.id, c]));
  const duels = [];
  const judge = async (group, tag) => {
    const pairs = group.map((m) => ({ id: m.id, a: byId.get(m.a), b: byId.get(m.b) }));
    const p = duelPrompt(project, pairs);
    const raw = await call({ role: 'director', ...p, task: { kind: 'duel', project, pairs, tag } });
    const got = new Map((Array.isArray(raw?.duels) ? raw.duels : []).map((d) => [text(d.pair), d]));
    return group.map((m) => { const d = got.get(m.id); const w = text(d?.winner); const n = text(d?.notable); return { ...m, winner: w === m.a || w === m.b ? w : '', why: text(d?.why), notable: n === m.a || n === m.b ? n : '', notableWhy: text(d?.notable_why), unsure: d?.unsure === true }; });
  };
  const size = Math.max(s.insightCount, s.finalists ?? 6);
  const swiss = Object.fromEntries(live.map((c) => [c.id, 0]));
  const notable = {}; const met = new Set();
  const rounds = live.length > size ? (s.swissRounds ?? 3) : 0;
  for (let r = 0; r < rounds; r++) {
    const res = (await pool(chunk(swissPairs(live.map((c) => c.id), swiss, met, r), 5), s.concurrency, (g) => judge(g, `round${r + 1}`))).flat();
    for (const d of res) { met.add([d.a, d.b].sort().join('|')); if (d.winner) swiss[d.winner]++; if (d.notable) { notable[d.notable] = (notable[d.notable] || 0) + 1; byId.get(d.notable).notable = d.notableWhy; } duels.push({ ...d, stage: `조별 ${r + 1}` }); }
  }
  const seats = pickSeats(live, swiss, notable, duels, size);
  const finalists = seats.map((x) => { x.c.seat = x.seat; return x.c; });
  for (const c of live) { c.swiss = swiss[c.id]; if (!finalists.includes(c)) c.status = '탈락 — 조별 대결'; }

  // 4) 결선 — 모두 한 번씩, 두 번 판정한다(두 번째는 자리를 바꿔서). 갈리면 무승부로 두고 표시한다.
  const matches = roundRobin(finalists.map((c) => c.id));
  const once = (await pool(chunk(matches, 5), s.concurrency, (g) => judge(g, 'final'))).flat();
  const twice = (await pool(chunk(matches.map((m) => ({ id: m.id, a: m.b, b: m.a })), 5), s.concurrency, (g) => judge(g, 'final-again'))).flat();
  const finals = once.map((d) => { const e = twice.find((x) => x.id === d.id); const split = !!(e && e.winner && d.winner && e.winner !== d.winner); return { ...d, split, winner: split ? '' : d.winner || e?.winner || '', why: split ? `판정이 갈렸다 — ${d.why} / ${e.why}` : d.why, stage: '결선' }; });
  duels.push(...finals);
  const table = standings(finalists.map((c) => c.id), finals, swiss);
  // 최종안은 서로 다른 해법이어야 한다 — 같은 해법 묶음에서는 순위가 가장 높은 하나만
  const winners = []; const taken = new Set();
  for (const t of table) {
    const c = byId.get(t.id); c.wins = t.wins; c.rank = t.rank; c.contested = finals.filter((d) => d.split && (d.a === c.id || d.b === c.id)).length >= 2;
    const f = c.screen?.family || c.id;
    if (winners.length < s.insightCount && !taken.has(f)) { winners.push(c); taken.add(f); c.status = '결선 통과'; }
    else c.status = winners.some((w) => (w.screen?.family || w.id) === f) ? '탈락 — 같은 해법이 이미 뽑힘' : '탈락 — 결선';
  }
  // 해법 묶음이 모자라 자리가 비면 순위대로 채운다
  for (const t of table) { const c = byId.get(t.id); if (winners.length < s.insightCount && !winners.includes(c)) { winners.push(c); c.status = '결선 통과'; } }

  // 5) 공격 · 보완 — 이긴 안을 고친다
  emit('stage', { stage: 'forge' });
  const forged = await pool(winners, s.concurrency, async (c) => {
    const ap = attackPrompt(project, c, run.baseline);
    const araw = await call({ role: 'brain', ...ap, task: { kind: 'attack', project, cand: c } });
    const attack = { attacks: (Array.isArray(araw?.attacks) ? araw.attacks : []).map((a) => ({ from: text(a.from), hit: text(a.hit), severity: Math.min(3, Math.max(1, Math.round(+a.severity || 1))) })).filter((a) => a.hit), keep: text(araw?.keep) };
    if (!attack.attacks.length) return { cand: c, attack, revised: null };
    const rp = revisePrompt(project, c, attack, run.baseline);
    const rraw = await call({ role: 'director', ...rp, task: { kind: 'revise', project, cand: c, attack } });
    if (!text(rraw?.concept)) return { cand: c, attack, revised: null };
    const revised = { id: `${c.id}r`, title: text(rraw.title) || c.title, concept: text(rraw.concept), visual: text(rraw.visual) || c.visual, gain: text(rraw.gain) || c.gain, keep: text(rraw.keep), change: text(rraw.change), verdict: text(rraw.verdict),
      fixed: (Array.isArray(rraw.fixed) ? rraw.fixed : []).map((f) => ({ hit: text(f.hit), fix: text(f.fix) })).filter((f) => f.fix), open: (Array.isArray(rraw.open) ? rraw.open : []).map(text).filter(Boolean) };
    return { cand: c, attack, revised };
  });

  // 6) 재대결 — 고친 안과 고치기 전 안
  const rematch = forged.filter((f) => f.revised).map((f) => { byId.set(f.revised.id, f.revised); return hash(f.cand.id) < 0.5 ? { id: `X${f.cand.id}`, a: f.cand.id, b: f.revised.id } : { id: `X${f.cand.id}`, a: f.revised.id, b: f.cand.id }; });
  const rres = rematch.length ? await judge(rematch, 'rematch') : [];
  duels.push(...rres.map((d) => ({ ...d, stage: '재대결' })));
  for (const f of forged) { const r = rres.find((x) => x.id === `X${f.cand.id}`); f.adopted = !!(f.revised && r && r.winner === f.revised.id); f.rematch = r ? r.why : ''; }

  // 7) 이긴 안을 통합 인사이트의 모양으로 — 근거 판단은 후보가 나온 판단이다
  const fam = (ids) => { const o = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, 0])); for (const id of ids) { const x = sig.get(id); if (x) o[x.family]++; } return o; };
  run.insights = forged.map((f, i) => {
    const c = f.cand; const v = f.adopted ? f.revised : c; const src = c.source;
    const used = c.origin.signals.filter((id) => sig.has(id));
    const byFamily = fam(used);
    const edge = c.origin.type === 'cross' ? run.edges.find((e) => e.id === c.origin.edge) : null;
    return {
      id: `N${i + 1}`, cluster: src?.cluster || null, candidate: c.id,
      title: v.title, insight: v.concept,
      chain: src ? src.chain : used.map((id, n) => ({ signal: id, role: c.origin.type === 'cross' ? '충돌' : n === 0 ? '전제' : '근거', says: sig.get(id).claim })),
      tension: src ? src.tension : edge ? { a: edge.from, b: edge.to, resolve: c.how || '' } : null,
      keep: v.keep || src?.keep || '', change: v.change || src?.change || '', concept: v.concept, visual: v.visual,
      substitute: src && !f.adopted ? src.substitute : { who: '', changes: v.gain }, verdict: v.verdict || src?.verdict || '', gate: src?.gate || '',
      without: { nearest: c.screen?.nearest || src?.without?.nearest || '', baseline: src?.without?.baseline || '', difference: c.screen?.why || src?.without?.difference || '' },
      open: [...(f.adopted ? f.revised.open : []), ...(src?.open || [])],
      check: { ok: true, problems: [], used, byFamily, families: Object.keys(byFamily).filter((k) => byFamily[k]), lenses: [...new Set(used.map((id) => sig.get(id).lens))], foreign: 0 },
      origin: c.origin, wins: c.wins, seat: c.seat, family: c.screen?.family || '', contested: !!c.contested, attacks: f.attack.attacks, kept: f.attack.keep, fixed: f.adopted ? f.revised.fixed : [], revised: f.adopted, rematch: f.rematch,
    };
  });

  const where = (c) => (c.origin.type === 'node' ? `${lensName(c.origin.lens)}의 완성안${c.origin.frame && c.origin.frame !== 'R0' ? ` · ${c.origin.frame}` : ''}` : c.origin.type === 'cross' ? `${c.origin.lenses.map(lensName).join(' × ')} 교배` : `묶음 통합안 ${c.origin.insight}`);
  run.arena = {
    candidates: cands.map((c) => ({ id: c.id, title: c.title, concept: c.concept, from: where(c), type: c.origin.type, screen: c.screen || null, family: c.screen?.family || '', seat: c.seat || '', swiss: c.swiss ?? null, wins: c.wins ?? null, rank: c.rank ?? null, notable: c.notable || '', contested: !!c.contested, status: c.status })),
    duels: duels.map((d) => ({ stage: d.stage, a: d.a, b: d.b, winner: d.winner, split: !!d.split, unsure: !!d.unsure, why: d.why })),
    counts: { candidates: cands.length, node: cands.filter((c) => c.origin.type === 'node').length, cluster: cands.filter((c) => c.origin.type === 'cluster').length, cross: cands.filter((c) => c.origin.type === 'cross').length, screened: cands.filter((c) => c.status.startsWith('탈락 — 기본안') || c.status.startsWith('탈락 — 얻는')).length, finalists: finalists.length, duels: duels.length, splits: finals.filter((d) => d.split).length, different: cands.filter((c) => c.screen?.verdict === '다름' && c.status.startsWith('탈락')).length, revised: forged.filter((f) => f.adopted).length },
    calls: run.calls - before,
  };
  return run.arena;
}
