// 사고 패스 — 1.x의 직렬 파이프라인을 대신한다.
//   ① 여행지 고르기   Airplane에서 발화할 사조를 고른다 (호출 1)
//   ② 발화            모든 기준 노드가 같은 원문(미션·이슈)을 받고 동시에 신호를 낸다 (노드당 호출 1)
//   ③ 연결            신호 사이의 인과·조건·강화·긴장을 엣지로 판단한다 (호출 1)
//   ④ 전파·수렴       에너지와 묶음을 계산한다 (AI 없음 · 결정적)
//   ⑤ 통합            묶음마다 통합 인사이트 하나 (묶음당 호출 1)
//   ⑥ 가드            인사이트가 여러 노드군의 신호를 실제로 지났는지 코드로 확인한다
import { issuesPrompt, routePrompt, activatePrompt, linkPrompt, integratePrompt } from '../../knowledge/prompts.js';
import { AIRPLANE, OPPOSITIONS, GATES, FAMILIES } from '../../knowledge/nodes.js';
import { activeLenses, signalPrefix, hints, lensName } from '../graph/model.js';
import { propagate } from '../graph/propagate.js';

const STANCES = new Set(['keep', 'change', 'limit', 'open']);
const TYPES = new Set(['cause', 'condition', 'reinforce', 'tension']);
const SOURCES = ['브리프', '일반 관찰', '추론', '확인 필요'];
const clamp = (v, d = 0.5) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
  return out;
}

/** 브리프 → 근본 이슈 후보. 고르는 것은 사람이다. */
export async function proposeIssues(project, provider, { signal } = {}) {
  const p = issuesPrompt(project);
  const { json } = await provider.json({ role: 'director', ...p, signal, task: { kind: 'issues', project } });
  const tidy = (list, root) => (Array.isArray(list) ? list : [])
    .map((i) => ({ title: text(i.title), detail: text(i.detail), test: text(i.test), root }))
    .filter((i) => i.title);
  return [...tidy(json.roots, true), ...tidy(json.issues, false)];
}

function normalizeSignals(raw, lens, project, max, startAt, hinted) {
  const issues = new Map(project.issues.map((i) => [String(i.id).toLowerCase(), i.id]));
  const perIssue = new Map();
  const out = [];
  let dropped = 0;
  for (const s of Array.isArray(raw?.signals) ? raw.signals : []) {
    const issue = issues.get(String(s.issue || '').toLowerCase());
    const claim = text(s.claim);
    const effect = text(s.effect);
    // 누구의 무엇이 달라지는지 쓰지 못한 신호는 버린다 (thinking.md 3.3)
    if (!issue || !claim || !effect) { dropped++; continue; }
    const n = perIssue.get(issue) || 0;
    if (n >= max) { dropped++; continue; }
    perIssue.set(issue, n + 1);
    const hint = hinted.has(`${issue}|${lens.id}`);
    out.push({
      id: `${signalPrefix(lens.id)}-${startAt + out.length + 1}`,
      lens: lens.id, family: lens.family, issue, claim, effect,
      basis: text(s.basis), leave: text(s.leave) || undefined,
      stance: STANCES.has(s.stance) ? s.stance : 'change',
      strength: Math.min(1, clamp(s.strength) + (hint ? 0.15 : 0)),
      source: SOURCES.includes(text(s.source)) ? text(s.source) : '추론',
      hinted: hint || undefined,
    });
  }
  return { signals: out, dropped };
}

function normalizeEdges(raw, signals, keep = []) {
  const sig = new Map(signals.map((s) => [s.id, s]));
  const pair = (a, b) => [a, b].sort().join('|');
  const seen = new Map(keep.filter((e) => sig.has(e.from) && sig.has(e.to)).map((e) => [pair(e.from, e.to), e]));
  let rejected = 0;
  for (const e of Array.isArray(raw?.edges) ? raw.edges : []) {
    const a = sig.get(e.from); const b = sig.get(e.to);
    const why = text(e.why);
    // 이유 없는 연결 · 같은 노드 안의 연결은 받지 않는다
    if (!a || !b || a.id === b.id || a.lens === b.lens || !TYPES.has(e.type) || !why) { rejected++; continue; }
    const key = pair(a.id, b.id);
    const prev = seen.get(key);
    if (prev && (prev.by === 'human' || prev.weight >= clamp(e.weight))) continue;
    seen.set(key, { from: a.id, to: b.id, type: e.type, weight: clamp(e.weight), why, by: 'ai' });
  }
  const edges = [...seen.values()].map((e, i) => ({ ...e, id: e.id && e.by === 'human' ? e.id : `E${i + 1}` }));
  return { edges, rejected };
}

/** 가드 — 통합 인사이트가 묶음의 신호를 실제로 지났는지 확인한다. 문장이 아니라 ID로 센다. */
export function checkInsight(raw, cluster, signals, settings) {
  const sig = new Map(signals.map((s) => [s.id, s]));
  const members = new Set(cluster.members);
  const chainRaw = Array.isArray(raw?.chain) ? raw.chain : [];
  const chain = chainRaw.filter((c) => members.has(c.signal)).map((c) => ({ signal: c.signal, role: text(c.role) || '전제', says: text(c.says) }));
  const used = [...new Set(chain.map((c) => c.signal))];
  const byFamily = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, used.filter((id) => sig.get(id).family === f).length]));
  const families = Object.keys(byFamily).filter((f) => byFamily[f] > 0);
  const lenses = [...new Set(used.map((id) => sig.get(id).lens))];
  const problems = [];
  if (!text(raw?.insight)) problems.push('통합 인사이트 문장이 없다');
  if (used.length < 3) problems.push(`인과 사슬이 지난 신호가 ${used.length}건뿐이다 (3건 이상)`);
  if (cluster.families.length < settings.minFamilies) problems.push(`이 묶음은 노드군 ${cluster.families.length}개에만 걸쳐 있다 (${settings.minFamilies}개 이상)`);
  const missing = cluster.families.filter((f) => !families.includes(f));
  if (missing.length) problems.push(`사슬이 ${missing.map((f) => FAMILIES[f].short).join(' · ')} 신호를 지나지 않았다`);
  const needLenses = Math.min(settings.minLenses, cluster.lenses.length);
  if (lenses.length < needLenses) problems.push(`근거 노드가 ${lenses.length}개뿐이다 (${needLenses}개 이상)`);
  if (!text(raw?.substitute?.changes)) problems.push('근본 이슈에 넣었을 때 달라지는 것을 쓰지 않았다');
  const t = raw?.tension;
  const tension = t && members.has(t.a) && members.has(t.b) && text(t.resolve) ? { a: t.a, b: t.b, resolve: text(t.resolve) } : null;
  if (cluster.tensions > 0 && !tension) problems.push('묶음 안의 긴장을 어떻게 푸는지 쓰지 않았다');
  return {
    ok: problems.length === 0, problems, chain, tension, used, byFamily, families, lenses,
    foreign: chainRaw.length - chain.length,
  };
}

function shapeInsight(raw, check, cluster, n) {
  return {
    id: `N${n}`, cluster: cluster.id,
    title: text(raw.title) || `통합 인사이트 ${n}`, insight: text(raw.insight),
    chain: check.chain, tension: check.tension,
    keep: text(raw.keep), change: text(raw.change), concept: text(raw.concept), visual: text(raw.visual),
    substitute: { who: text(raw.substitute?.who), changes: text(raw.substitute?.changes) },
    verdict: text(raw.verdict), gate: text(raw.gate) || '통과',
    open: (Array.isArray(raw.open) ? raw.open : []).map(text).filter(Boolean),
    check: { ok: check.ok, problems: check.problems, used: check.used, byFamily: check.byFamily, families: check.families, lenses: check.lenses, foreign: check.foreign },
  };
}

/** 유실을 숫자로 — 낸 신호 중 몇 건이 인사이트까지 갔는가 */
export function usage(run) {
  const live = run.signals.filter((s) => !s.muted);
  const used = new Set((run.insights || []).flatMap((i) => i.check.used));
  const byFamily = {};
  for (const f of Object.keys(FAMILIES)) {
    const mine = live.filter((s) => s.family === f);
    byFamily[f] = { signals: mine.length, used: mine.filter((s) => used.has(s.id)).length };
  }
  return { signals: live.length, used: live.filter((s) => used.has(s.id)).length, unused: live.filter((s) => !used.has(s.id)).map((s) => s.id), byFamily };
}

/**
 * @param {object} project
 * @param {object} provider  { name, json({role, system, user, signal, task}) → {json, usage?} }
 * @param {object} o
 * @param {'full'|'add'|'relink'} o.mode  full 처음부터 · add 새 이슈만 발화 · relink 신호·엣지는 두고 전파·통합만
 */
export async function think(project, provider, { onEvent = () => {}, signal, mode = 'full' } = {}) {
  if (!project.issues.some((i) => text(i.title))) throw new Error('이슈가 없습니다. 근본 이슈를 하나 이상 넣어 주세요.');
  const s = project.settings;
  const started = Date.now();
  const prev = mode === 'full' ? null : project.run;
  if (mode !== 'full' && !prev) throw new Error('이어서 할 사고 기록이 없습니다.');
  const run = {
    at: new Date().toISOString(), provider: provider.name, mode,
    picks: prev?.picks || [], signals: prev ? prev.signals.map((x) => ({ ...x })) : [],
    edges: prev ? prev.edges.map((x) => ({ ...x })) : [], energy: {}, clusters: [], insights: [],
    failed: [], notes: [], calls: 0, tokens: { in: 0, out: 0 },
  };
  const emit = (type, extra = {}) => onEvent({ type, run, ...extra });
  const call = async (args) => {
    if (signal?.aborted) throw new Error('취소됨');
    const r = await provider.json({ ...args, signal });
    run.calls++;
    if (r.usage) { run.tokens.in += r.usage.in || 0; run.tokens.out += r.usage.out || 0; }
    return r.json;
  };

  if (mode !== 'relink') {
    // ① 여행지 고르기 — 사람이 고정했거나 [[지목]]한 사조는 그대로 넣는다
    if (mode === 'full') {
      emit('stage', { stage: 'route' });
      const fixed = new Set([...(s.pinned || []), ...hints(project).map((h) => h.lens).filter((id) => id.startsWith('ISM-'))]);
      const need = Math.max(0, s.ismCount - fixed.size);
      let picks = [...fixed].map((id) => ({ id, why: '사람이 지목한 사조' }));
      if (need > 0) {
        const pool0 = AIRPLANE.filter((a) => !fixed.has(a.id) && !(s.muted || []).includes(a.id));
        const p = routePrompt(project, pool0, OPPOSITIONS, need);
        const json = await call({ role: 'brain', ...p, task: { kind: 'route', project, isms: pool0, count: need } });
        const valid = new Set(pool0.map((a) => a.id));
        const got = (Array.isArray(json.picks) ? json.picks : []).filter((x) => valid.has(x.id)).slice(0, need).map((x) => ({ id: x.id, why: text(x.why) }));
        picks = [...picks, ...got.filter((g) => !picks.some((q) => q.id === g.id))];
      }
      // 같은 편 사조만 고르지 않는다 — 대립 쌍이 없으면 반대편 하나를 더한다 (catalog A-99)
      const ids = new Set(picks.map((x) => x.id));
      if (ids.size && !OPPOSITIONS.some((o) => ids.has(o.a) && ids.has(o.b))) {
        const o = OPPOSITIONS.find((x) => ids.has(x.a) !== ids.has(x.b));
        if (o) picks.push({ id: ids.has(o.a) ? o.b : o.a, why: `반대 답을 내는 사조 — ${o.issue}` });
      }
      run.picks = picks;
      emit('picked');
    }

    // ② 발화 — 모든 노드가 같은 원문을 받는다. 앞 노드의 요약을 받지 않는다.
    emit('stage', { stage: 'activate' });
    const lenses = activeLenses(project, run.picks);
    const pendingIssues = mode === 'add' ? project.issues.filter((i) => !run.signals.some((x) => x.issue === i.id)) : project.issues;
    if (mode === 'add' && !pendingIssues.length) throw new Error('새로 더한 이슈가 없습니다.');
    const scoped = { ...project, issues: pendingIssues };
    const hinted = new Set(hints(project).map((h) => `${h.issue}|${h.lens}`));
    await pool(lenses, s.concurrency, async (lens) => {
      try {
        emit('firing', { lens: lens.id });
        const p = activatePrompt(scoped, lens, s.signalsPerLens);
        const json = await call({ role: 'sub', ...p, task: { kind: 'activate', project: scoped, lens, max: s.signalsPerLens } });
        const startAt = run.signals.filter((x) => x.lens === lens.id).length;
        const { signals, dropped } = normalizeSignals(json, lens, scoped, s.signalsPerLens, startAt, hinted);
        if (dropped) run.notes.push(`${lens.name}: 대입을 쓰지 못했거나 넘친 신호 ${dropped}건을 버렸다`);
        run.signals.push(...signals);
        emit('fire', { lens: lens.id, signals });
      } catch (e) {
        if (signal?.aborted) throw e;
        run.failed.push({ lens: lens.id, error: e.message });
        emit('fail', { lens: lens.id, error: e.message });
      }
    });
    if (run.failed.length > lenses.length / 2) throw new Error(`노드 ${lenses.length}개 중 ${run.failed.length}개가 응답하지 못했습니다: ${run.failed[0].error}`);
    if (run.signals.length < 3) throw new Error('신호가 3건보다 적어 연결할 수 없습니다.');

    // ③ 연결 — 관계를 문장이 아니라 엣지로 남긴다. 사람이 고친 엣지는 지킨다.
    emit('stage', { stage: 'link' });
    const p = linkPrompt(project, run.signals, lensName);
    const json = await call({ role: 'brain', ...p, task: { kind: 'link', project, signals: run.signals } });
    const { edges, rejected } = normalizeEdges(json, run.signals, run.edges.filter((e) => e.by === 'human'));
    if (rejected) run.notes.push(`이유가 없거나 같은 노드 안의 연결 ${rejected}건을 받지 않았다`);
    run.edges = edges;
    emit('linked');
  }

  // ④ 전파·수렴 — 결정적 계산
  emit('stage', { stage: 'propagate' });
  const result = propagate(run.signals, run.edges, { count: s.insightCount });
  run.energy = Object.fromEntries([...result.energy].map(([k, v]) => [k, +v.toFixed(3)]));
  run.clusters = result.clusters;
  run.link = result.stats;
  emit('clustered');
  if (!run.clusters.length) throw new Error('수렴한 묶음이 없습니다. 신호 사이의 연결이 너무 적습니다.');

  // ⑤ 통합 + ⑥ 가드 — 통과하지 못하면 이유를 붙여 한 번 다시 쓴다. 그래도 안 되면 표시해서 남긴다.
  emit('stage', { stage: 'integrate' });
  const sigMap = new Map(run.signals.map((x) => [x.id, x]));
  await pool(run.clusters, s.concurrency, async (c, i) => {
    const cluster = { ...c, signals: c.members.map((id) => sigMap.get(id)), edges: run.edges.filter((e) => c.edges.includes(e.id)) };
    let raw; let check; let note = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = integratePrompt(project, cluster, lensName, GATES, note);
      raw = await call({ role: 'director', ...p, task: { kind: 'integrate', project, cluster, attempt } });
      check = checkInsight(raw, c, run.signals, s);
      if (check.ok) break;
      note = `앞서 쓴 안은 다음 이유로 받지 않았다: ${check.problems.join(' / ')}`;
    }
    const insight = shapeInsight(raw, check, c, i + 1);
    run.insights = [...run.insights, insight].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    emit('insight', { insight });
    return insight;
  });
  run.usage = usage(run);
  run.ms = Date.now() - started;
  emit('stage', { stage: 'done' });
  return run;
}
