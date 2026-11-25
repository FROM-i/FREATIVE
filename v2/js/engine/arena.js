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
import { crossPrompt, screenPrompt, duelPrompt, distinctPrompt, stancePrompt, holdPrompt, attackPrompt, revisePrompt } from '../../knowledge/prompts-arena.js';
import { FAMILIES } from '../../knowledge/nodes.js';
import { lensName } from '../graph/model.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const SCREEN = ['같음', '일부', '다름'];
const REACH = ['직접', '간접', '없음'];

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
  return (Array.isArray(raw?.frames) ? raw.frames : []).map((f) => ({ frame: text(f.frame), why: text(f.why), success: f.success === true, risk: text(f.risk), facts: (Array.isArray(f.facts) ? f.facts : []).map(text).filter((id) => ok.has(id)) }))
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
 *   성공 기준  위 자리에 성공 기준에 직접 닿는 안이 하나도 없으면, 닿는 안 가운데 승수가 가장 높은 안
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
  if (!seats.some((x) => x.c.screen?.success === '직접')) take(order.find((c) => c.screen?.success === '직접'), '성공 기준에 닿는 안');
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
    const raw = await call({ role: 'judge', ...p, task: { kind: 'screen', project, candidates: cands, baseline: run.baseline } });
    const bids = new Set(run.baseline.concepts.map((c) => c.id));
    for (const x of Array.isArray(raw?.screens) ? raw.screens : []) {
      const c = cands.find((k) => k.id === text(x.id));
      if (c && SCREEN.includes(text(x.verdict))) c.screen = { nearest: bids.has(text(x.nearest)) ? text(x.nearest) : '', verdict: text(x.verdict), why: text(x.why), family: text(x.family), empty: x.empty === true, success: REACH.includes(text(x.success)) ? text(x.success) : '', breaks: text(x.breaks) };
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
    const p = duelPrompt(project, pairs, tag);
    const raw = await call({ role: 'judge', ...p, task: { kind: 'duel', project, pairs, tag } });
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
  // 최종안은 서로 다른 해법이어야 한다 — 결선에 오른 안과 예비 안을 다시 견주어 같은 해법을 묶는다.
  // 기본안 대조 때 붙인 묶음 이름만으로는 같은 해법이 다른 이름으로 올라온다.
  emit('stage', { stage: 'distinct' });
  const reserves = live.filter((c) => !finalists.includes(c)).sort((x, y) => (swiss[y.id] || 0) - (swiss[x.id] || 0) || x.id.localeCompare(y.id, undefined, { numeric: true })).slice(0, 4);
  const groupOf = new Map(); const groups = [];
  {
    const set = [...finalists, ...reserves];
    const p = distinctPrompt(project, set);
    const raw = await call({ role: 'judge', ...p, task: { kind: 'distinct', project, candidates: set } });
    for (const g of Array.isArray(raw?.groups) ? raw.groups : []) {
      const ids = (Array.isArray(g.ids) ? g.ids : []).map(text).filter((id) => set.some((c) => c.id === id) && !groupOf.has(id));
      if (!ids.length) continue;
      groups.push({ name: text(g.name) || byId.get(ids[0]).title, ids, why: text(g.why) });
      for (const id of ids) groupOf.set(id, groups.length - 1);
    }
    // 답에서 빠진 안은 기본안 대조 때의 묶음 이름으로 가른다
    for (const c of set) { if (groupOf.has(c.id)) continue; const f = c.screen?.family || c.id; let k = groups.findIndex((g) => g.fallback === f); if (k < 0) { groups.push({ name: f, ids: [], why: '', fallback: f }); k = groups.length - 1; } groups[k].ids.push(c.id); groupOf.set(c.id, k); }
    for (const c of set) c.group = groups[groupOf.get(c.id)].name;
  }
  const winners = []; const taken = new Set();
  for (const t of table) {
    const c = byId.get(t.id); c.wins = t.wins; c.rank = t.rank; c.contested = finals.filter((d) => d.split && (d.a === c.id || d.b === c.id)).length >= 2;
    const g = groupOf.get(c.id);
    if (winners.length < s.insightCount && !taken.has(g)) { winners.push(c); taken.add(g); c.status = '결선 통과'; }
    else c.status = taken.has(g) ? '탈락 — 같은 해법이 이미 뽑힘' : '탈락 — 결선';
  }
  // 자리가 비면 같은 해법으로 채우지 않는다. 결선에 못 오른 안 가운데 다른 해법을 올리고, 그것도 없으면 비워 둔다.
  for (const c of reserves) { const g = groupOf.get(c.id); if (winners.length < s.insightCount && !taken.has(g)) { winners.push(c); taken.add(g); c.seat = '예비 — 다른 해법'; c.status = '결선 통과 — 예비'; } }
  if (winners.length < s.insightCount) run.notes.push(`서로 다른 해법이 ${winners.length}개뿐이라 인사이트를 ${winners.length}건만 낸다`);

  // 5) 공격 · 보완 — 이긴 안을 고친다
  emit('stage', { stage: 'forge' });
  const where = (c) => (c.origin.type === 'node' ? `${lensName(c.origin.lens)}의 완성안${c.origin.frame && c.origin.frame !== 'R0' ? ` · ${c.origin.frame}` : ''}` : c.origin.type === 'cross' ? `${c.origin.lenses.map(lensName).join(' × ')} 교배` : `묶음 통합안 ${c.origin.insight}`);
  // 기조 — 공격을 받기 전에, 안마다 끝까지 지킬 것(거는 것 · 핵심 장치 · 포기한 것)을 정한다.
  // 받은 공격을 전부 고치게 하면 안이 무난해지고 서로 닮는다. 기조가 있어야 고치면서도 구분이 남는다.
  emit('stage', { stage: 'stance' });
  {
    const p = stancePrompt(project, winners.map((c) => ({ ...c, where: where(c) })));
    const raw = await call({ role: 'director', ...p, task: { kind: 'stance', project, candidates: winners } });
    const got = new Map((Array.isArray(raw?.stances) ? raw.stances : []).map((x) => [text(x.id), x]));
    for (const c of winners) { const x = got.get(c.id); c.stance = { bet: text(x?.bet) || c.concept, device: text(x?.device), givesUp: text(x?.gives_up) }; }
  }

  // 공격은 한꺼번에 받고, 보완은 순위대로 하나씩 한다 — 뒤에 고치는 안이 앞 안의 장치를 가져다 쓰면 최종안이 다시 같아진다.
  const HOW = ['고침', '대가', '받지 않음'];
  const attacked = await pool(winners, s.concurrency, async (c) => {
    const ap = attackPrompt(project, c, run.baseline, c.stance);
    const araw = await call({ role: 'judge', ...ap, task: { kind: 'attack', project, cand: c } });
    return { cand: c, attack: { attacks: (Array.isArray(araw?.attacks) ? araw.attacks : []).map((a) => ({ from: text(a.from), hit: text(a.hit), severity: Math.min(3, Math.max(1, Math.round(+a.severity || 1))) })).filter((a) => a.hit), keep: text(araw?.keep) } };
  });
  const forged = [];
  // 한 안을 고친다. note가 있으면 앞서 고친 것이 받아들여지지 않은 이유를 붙여 다시 고친다
  const reviseOne = async (c, attack, note = '') => {
    // 다른 최종안의 지금 모습과 기조 — 이미 고친 안은 고친 모습으로
    const others = winners.filter((w) => w !== c).map((w) => { const f = forged.find((x) => x.cand === w); const v = (f?.adopted !== false && f?.revised) || w; return { title: v.title, concept: v.concept, bet: w.stance.bet, device: w.stance.device }; });
    const rp = revisePrompt(project, c, attack, run.baseline, others, c.stance, note);
    const rraw = await call({ role: 'director', ...rp, task: { kind: 'revise', project, cand: c, attack, others, again: !!note } });
    if (!text(rraw?.concept)) return null;
    // 공격마다 고침 · 대가 · 받지 않음 가운데 하나. 예전 형식(fixed)도 받는다
    const responses = (Array.isArray(rraw.responses) ? rraw.responses : (Array.isArray(rraw.fixed) ? rraw.fixed.map((f) => ({ hit: f.hit, how: '고침', note: f.fix })) : []))
      .map((r) => ({ hit: text(r.hit), how: HOW.includes(text(r.how)) ? text(r.how) : '고침', note: text(r.note) })).filter((r) => r.note);
    return { id: `${c.id}r`, title: text(rraw.title) || c.title, concept: text(rraw.concept), visual: text(rraw.visual) || c.visual, gain: text(rraw.gain) || c.gain, keep: text(rraw.keep), change: text(rraw.change), verdict: text(rraw.verdict),
      responses, fixed: responses.filter((r) => r.how === '고침').map((r) => ({ hit: r.hit, fix: r.note })), costs: responses.filter((r) => r.how === '대가'), refused: responses.filter((r) => r.how === '받지 않음'), open: (Array.isArray(rraw.open) ? rraw.open : []).map(text).filter(Boolean) };
  };
  for (const { cand: c, attack } of attacked) forged.push({ cand: c, attack, revised: attack.attacks.length ? await reviseOne(c, attack) : null });

  // 6) 재대결 — 고친 안과 고치기 전 안
  const rematch = forged.filter((f) => f.revised).map((f) => { byId.set(f.revised.id, f.revised); return hash(f.cand.id) < 0.5 ? { id: `X${f.cand.id}`, a: f.cand.id, b: f.revised.id } : { id: `X${f.cand.id}`, a: f.revised.id, b: f.cand.id }; });
  const rres = rematch.length ? await judge(rematch, 'rematch') : [];
  duels.push(...rres.map((d) => ({ ...d, stage: '재대결' })));
  for (const f of forged) { const r = rres.find((x) => x.id === `X${f.cand.id}`); f.adopted = !!(f.revised && r && r.winner === f.revised.id); f.rematch = r ? r.why : ''; }

  // 기조 확인 — 고친 안이 기조를 버렸거나 다른 안과 같아졌으면, 이유를 붙여 한 번 다시 고친다.
  // 다시 고쳐도 같으면 고치기 전으로 되돌린다(고치기 전에는 서로 달랐다). 되돌린 안은 공격이 고쳐지지 않은 채 남는다.
  let reverted = 0; let redone = 0;
  const KEPT = ['지킴', '약해짐', '버림'];
  for (let pass = 0; pass < 2 && forged.some((f) => f.adopted); pass++) {
    const items = forged.map((f) => ({ id: f.cand.id, stance: { 거는_것: f.cand.stance.bet, 핵심_장치: f.cand.stance.device }, before: f.cand, after: f.adopted ? f.revised : f.cand }));
    const p = holdPrompt(project, items);
    const raw = await call({ role: 'judge', ...p, task: { kind: 'hold', project, items, pass } });
    const bad = new Map();
    for (const x of Array.isArray(raw?.checks) ? raw.checks : []) {
      const f = forged.find((y) => y.cand.id === text(x.id)); if (!f || !f.adopted) continue;
      f.kept = KEPT.includes(text(x.kept)) ? text(x.kept) : ''; f.keptWhy = text(x.why);
      if (f.kept === '버림') bad.set(f, `고친 안이 기조를 버렸다 — ${f.keptWhy}`);
    }
    for (const g of Array.isArray(raw?.groups) ? raw.groups : []) {
      const same = forged.filter((f) => (Array.isArray(g.ids) ? g.ids : []).map(text).includes(f.cand.id));
      // 순위가 가장 높은 안은 그대로 두고, 나머지 가운데 고친 안을 다시 본다
      for (const f of same.slice(1)) if (f.adopted && !bad.has(f)) bad.set(f, `고친 안이 ${same[0].cand.id}(${same[0].adopted ? same[0].revised.title : same[0].cand.title})와 같은 해법이 됐다`);
    }
    if (!bad.size) break;
    for (const [f, why] of bad) {
      const again = pass === 0 ? await reviseOne(f.cand, f.attack, `앞서 고친 안은 받아들이지 않았다: ${why}. 기조와 핵심 장치로 돌아가서, 다른 최종안이 쓰지 않는 방법으로 다시 고친다.`) : null;
      if (again) { f.revised = again; f.redone = true; redone++; f.rematch = `${why} → 다시 고쳤다`; }
      else { f.adopted = false; f.reverted = true; reverted++; f.rematch = `${why} → 고치기 전 안을 남겼다`; }
    }
  }
  if (reverted) run.notes.push(`고친 뒤 기조를 버렸거나 다른 안과 같아진 안 ${reverted}개를 고치기 전으로 되돌렸다. 그 안이 받은 공격은 고쳐지지 않은 채 남는다`);

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
      origin: c.origin, wins: c.wins ?? null, seat: c.seat, family: c.group || c.screen?.family || '', reach: c.screen?.success || '', contested: !!c.contested, attacks: f.attack.attacks, bold: f.attack.keep, fixed: f.adopted ? f.revised.fixed : [], revised: f.adopted, reverted: !!f.reverted, redone: !!f.redone, rematch: f.rematch, stance: c.stance, kept: f.kept || '', keptWhy: f.keptWhy || '', costs: f.adopted ? f.revised.costs : [], refused: f.adopted ? f.revised.refused : [],
    };
  });

  run.arena = {
    candidates: cands.map((c) => ({ id: c.id, title: c.title, concept: c.concept, from: where(c), type: c.origin.type, screen: c.screen || null, family: c.group || c.screen?.family || '', reach: c.screen?.success || '', seat: c.seat || '', swiss: c.swiss ?? null, wins: c.wins ?? null, rank: c.rank ?? null, notable: c.notable || '', contested: !!c.contested, status: c.status })),
    duels: duels.map((d) => ({ stage: d.stage, a: d.a, b: d.b, winner: d.winner, split: !!d.split, unsure: !!d.unsure, why: d.why })),
    counts: { candidates: cands.length, node: cands.filter((c) => c.origin.type === 'node').length, cluster: cands.filter((c) => c.origin.type === 'cluster').length, cross: cands.filter((c) => c.origin.type === 'cross').length, screened: cands.filter((c) => c.status.startsWith('탈락 — 기본안') || c.status.startsWith('탈락 — 얻는')).length, finalists: finalists.length, duels: duels.length, splits: finals.filter((d) => d.split).length, groups: new Set(finalists.map((c) => groupOf.get(c.id))).size, merged: finalists.filter((c) => c.status === '탈락 — 같은 해법이 이미 뽑힘').length, reserve: winners.filter((c) => c.status === '결선 통과 — 예비').length, different: cands.filter((c) => c.screen?.verdict === '다름' && c.status.startsWith('탈락')).length, revised: forged.filter((f) => f.adopted).length, reverted, redone },
    groups: groups.map((g) => ({ name: g.name, ids: g.ids, why: g.why })),
    calls: run.calls - before,
  };
  return run.arena;
}
