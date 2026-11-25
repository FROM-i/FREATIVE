// 그래프 모델 — 프로젝트 하나가 볼트 하나다.
// 노드: 허브 · 기준 노드(렌즈) · 문 · 프로젝트 · 이슈 · 신호 · 통합 인사이트
// 엣지: 구조(hub·issue) · 발화(emit) · 대입(target) · 판단(cause·condition·reinforce·tension) · 사용(use) · 지목(hint)
import { FAMILIES, HUBS, IDENTITY, TUNNEL, AIRPLANE, GATES, LENSES, DEFAULTS } from '../../knowledge/nodes.js';
import { COMMON_INPUT, SEED_INPUT, TAGS, tagById, categoryById, recommendTags } from '../../knowledge/tags.js';

export const VERSION = 1;

let seq = 0;
export const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newProject(seed = {}) {
  return {
    v: VERSION,
    id: seed.id || uid('P'),
    title: seed.title || '새 프로젝트',
    category: seed.category || null,                       // 여섯 분류 중 하나 (knowledge/tags.js)
    brief: { what: '', purpose: '', target: '', product: '', channel: '', note: '', ...(seed.brief || {}) },   // 공통 인풋
    seed: { ...(seed.seed || {}) },                        // 분류별 인풋 — { [분류]: { [칸]: 값 } }
    facts: (seed.facts || []).map((f) => ({ ...f })),      // 팩트북 — 출처가 있는 실제 자료 (knowledge/facts.js)
    issues: (seed.issues || []).map((i, n) => ({ id: i.id || `I${n + 1}`, title: '', detail: '', test: '', root: false, tags: [], ...i })),
    settings: { ...DEFAULTS, muted: [], pinned: [], ...(seed.settings || {}) },
    run: seed.run || null,
    example: !!seed.example,
    updated: seed.updated || new Date().toISOString(),
  };
}

export function nextIssueId(project) {
  const max = project.issues.reduce((m, i) => Math.max(m, +(String(i.id).replace(/\D/g, '')) || 0), 0);
  return `I${max + 1}`;
}

// ---------- 노드의 틀 ----------
// 사람마다 다르게 세팅하지 않도록, 이슈 노드는 정해진 칸을 채워야 발화에 들어간다.
//   이슈: 제목(누구의 무엇이 바뀌는가) · 태그 1개 이상 · (근본 이슈면) 판정 질문
// 태그가 비어 있으면 규칙 기반 추천을 그대로 붙인다 — 같은 글이면 누구에게나 같은 태그다.

/** 이슈에 붙일 태그 — 사람이 고른 것이 있으면 그것, 없으면 추천 */
export function issueTags(project, issue) {
  const own = (issue.tags || []).filter((id) => tagById(id));
  if (own.length) return { tags: own, auto: false };
  const rec = recommendTags(`${issue.title} ${issue.detail}`, { category: project.category, limit: 3 }).map((r) => r.id);
  return { tags: rec, auto: true };
}

/** 세팅 점검 — 빠진 칸을 사람의 말로 돌려준다. ready는 발화에 들어갈 수 있는 이슈다. */
export function validateProject(project) {
  const problems = [];
  const miss = (where, what) => problems.push({ where, what });
  for (const f of COMMON_INPUT) if (f.required && !String(project.brief[f.id] || '').trim()) miss('공통 인풋', `"${f.label}"이 비어 있다`);
  if (!categoryById(project.category)) miss('분류', '분류를 고르지 않았다');
  else for (const f of SEED_INPUT[project.category]) if (f.required && !String(project.seed?.[project.category]?.[f.id] || '').trim()) miss(`${categoryById(project.category).name} 인풋`, `"${f.label}"이 비어 있다`);
  const ready = [];
  for (const i of project.issues) {
    const where = `이슈 ${i.id}`;
    if (!String(i.title || '').trim()) { miss(where, '제목이 비어 있다'); continue; }
    if (i.root && !String(i.test || '').trim()) { miss(where, '근본 이슈에 판정 질문이 없다'); continue; }
    const { tags, auto } = issueTags(project, i);
    if (!tags.length) { miss(where, '태그가 없고, 글에서 추천할 태그도 찾지 못했다'); continue; }
    ready.push({ ...i, tags, autoTags: auto });
  }
  if (!ready.some((i) => i.root)) miss('이슈', '판정 질문을 가진 근본 이슈가 하나 필요하다');
  return { ok: problems.length === 0, problems, ready, blocking: !ready.some((i) => i.root) };
}

/** 개발 관점이 필요한 과제인가 — 분류가 개발이거나 개발 태그가 하나라도 붙었으면 그렇다 */
export function needsDevelopment(project, issues = project.issues) {
  return project.category === 'dev' || issues.some((i) => (i.tags || []).some((id) => tagById(id)?.category === 'dev'));
}

/** 신호 ID — 노드 이름에서 만든다. 실행 순서와 무관하게 같다. */
export const signalPrefix = (lensId) => lensId.replace(/^(ID|ISM|TN)-/, '');

// ---------- 위키링크 ----------
// 이슈 설명에 [[자메뷰]] · [[타겟]] · [[브루탈리즘]]처럼 쓰면, 사람이 그 노드를 이 이슈에 지목한 것이다.
const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const norm = (s) => String(s).toLowerCase().replace(/[\s·—\-_]/g, '');

export function lensIndex() {
  const idx = new Map();
  for (const l of [...LENSES, ...GATES]) {
    idx.set(norm(l.id), l.id);
    idx.set(norm(l.name), l.id);
    idx.set(norm(l.name.split('—')[0]), l.id);
    idx.set(norm(signalPrefix(l.id)), l.id);
  }
  return idx;
}

export function parseLinks(text, idx = lensIndex()) {
  const found = [];
  for (const m of String(text || '').matchAll(LINK)) {
    const id = idx.get(norm(m[1]));
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}

/** 사람이 지목한 연결: [{ issue, lens }] */
export function hints(project) {
  const idx = lensIndex();
  return project.issues.flatMap((i) => parseLinks(`${i.title} ${i.detail}`, idx).map((lens) => ({ issue: i.id, lens })));
}

/** 이번 사고에서 발화할 기준 노드 */
export function activeLenses(project, picks = []) {
  const muted = new Set(project.settings.muted || []);
  const ismIds = new Set([...picks.map((p) => p.id), ...(project.settings.pinned || []), ...hints(project).map((h) => h.lens)]);
  return [...IDENTITY, ...TUNNEL, ...AIRPLANE.filter((a) => ismIds.has(a.id))].filter((l) => !muted.has(l.id));
}

// ---------- 화면용 그래프 ----------
export function buildGraph(project) {
  const nodes = [];
  const links = [];
  const run = project.run;
  const muted = new Set(project.settings.muted || []);
  const fired = new Set((run?.signals || []).map((s) => s.lens));
  const add = (n) => nodes.push(n);
  const link = (source, target, kind, extra = {}) => links.push({ id: extra.id || `${kind}:${source}>${target}`, source, target, kind, ...extra });

  add({ id: project.id, type: 'project', name: project.title, size: 5 });
  for (const h of HUBS) { add({ ...h, size: 4 }); link(project.id, h.id, 'hub'); }
  for (const l of LENSES) {
    add({ id: l.id, type: 'lens', family: l.family, name: l.name, size: 2.25, dormant: !fired.has(l.id), muted: muted.has(l.id) });
    link(FAMILIES[l.family].hub, l.id, 'hub');
  }
  for (const g of GATES) { add({ id: g.id, type: 'gate', family: g.family, name: g.name, size: 2 }); link(FAMILIES[g.family].hub, g.id, 'hub'); }
  for (const i of project.issues) {
    add({ id: i.id, type: 'issue', name: i.title || '(이슈)', root: i.root, size: i.root ? 3.5 : 2.75 });
    link(project.id, i.id, 'issue');
  }
  for (const h of hints(project)) link(h.issue, h.lens, 'hint');

  if (run) {
    const ids = new Set(nodes.map((n) => n.id));
    for (const s of run.signals) {
      add({ id: s.id, type: 'signal', family: s.family, name: s.claim, lens: s.lens, issue: s.issue, size: 1 + (run.energy?.[s.id] || s.strength || 0), energy: run.energy?.[s.id] || 0, muted: !!s.muted });
      link(s.lens, s.id, 'emit');
      if (ids.has(s.issue)) link(s.id, s.issue, 'target');
    }
    // 팩트 — 판단이 기댄 팩트만 브레인 맵에 올린다 (소뇌 자리)
    const cited = new Set(run.signals.flatMap((x) => x.facts || []));
    for (const f of (project.facts || []).filter((x) => cited.has(x.id))) add({ id: f.id, type: 'fact', name: f.text, source: f.source, size: 1.5, unchecked: f.by === 'ai' && !f.checked });
    for (const x of run.signals) for (const fid of x.facts || []) if (cited.has(fid) && nodes.some((n) => n.id === fid)) link(x.id, fid, 'evidence');
    for (const e of run.edges) link(e.from, e.to, e.type, { id: e.id, weight: e.weight, why: e.why, judged: true, by: e.by });
    for (const ins of run.insights || []) {
      add({ id: ins.id, type: 'insight', name: ins.title, size: 4.5, flagged: !ins.check?.ok });
      for (const sid of ins.check?.used || []) link(ins.id, sid, 'use');
    }
  }
  return { nodes, links };
}

/** 노드 하나의 문서 — 본문과 백링크 */
export function describe(project, id) {
  const run = project.run;
  const lens = [...LENSES, ...GATES].find((l) => l.id === id);
  const signals = run?.signals || [];
  const edgesOf = (sid) => (run?.edges || []).filter((e) => e.from === sid || e.to === sid);
  if (lens) return { kind: lens.id.startsWith('ID-N7') ? 'gate' : 'lens', lens, signals: signals.filter((s) => s.lens === id), pick: run?.picks?.find((p) => p.id === id) };
  const hub = HUBS.find((h) => h.id === id);
  if (hub) return { kind: 'hub', hub, lenses: LENSES.filter((l) => l.family === hub.family), signals: signals.filter((s) => s.family === hub.family) };
  const issue = project.issues.find((i) => i.id === id);
  if (issue) return { kind: 'issue', issue, signals: signals.filter((s) => s.issue === id), hints: hints(project).filter((h) => h.issue === id) };
  const signal = signals.find((s) => s.id === id);
  if (signal) return { kind: 'signal', signal, edges: edgesOf(id), insights: (run.insights || []).filter((i) => i.check?.used?.includes(id)) };
  const insight = (run?.insights || []).find((i) => i.id === id);
  if (insight) return { kind: 'insight', insight };
  const fact = (project.facts || []).find((f) => f.id === id);
  if (fact) return { kind: 'fact', fact, signals: signals.filter((x) => (x.facts || []).includes(id)) };
  if (id === project.id) return { kind: 'project' };
  return null;
}

export const lensName = (id) => ([...LENSES, ...GATES].find((l) => l.id === id) || {}).name || id;
export const familyName = (f) => (FAMILIES[f] || {}).short || f;
