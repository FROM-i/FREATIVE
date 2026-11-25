// 목업 공급자 — API 키 없이 구조와 화면을 확인한다.
// 예시 프로젝트에는 미리 써 둔 답(FIXTURE)을, 그 밖의 프로젝트에는 "[목업]" 표시가 붙은 틀 문장을 돌려준다.
// 목업 문장은 판단이 아니다. 실제 판단은 실제 모델이 한다.
import { SAMPLE, SAMPLE_ID, FIXTURE } from '../../knowledge/sample-project.js';
import { OPPOSITIONS } from '../../knowledge/nodes.js';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const short = (s, n = 18) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));
const STANCE = ['change', 'keep', 'limit', 'open'];
const ROLES = ['전제', '원인', '조건', '전환', '결과'];
const TYPE_KO = { cause: '원인', condition: '조건', reinforce: '강화', tension: '긴장' };

function issues(project) {
  if (project.id === SAMPLE_ID) return { roots: SAMPLE.issues.filter((i) => i.root), issues: SAMPLE.issues.filter((i) => !i.root) };
  const b = project.brief;
  return {
    roots: [{ title: `[목업] ${short(b.target || '타겟', 14)}의 무엇이 바뀌어야 하는가`, detail: `과업 "${short(b.what, 24)}" → 목적 "${short(b.purpose, 24)}" 아래의 근본 이슈. 실제 모델이 채운다.`, test: '[목업] 이 안이 있으면 타겟의 행동이 달라지는가?', covers: '[목업] 목적', misses: '' }],
    issues: [{ title: '[목업] 타겟이 지금 망설이는 지점', detail: '실제 모델이 채운다.' }],
  };
}

function route({ project, isms, count }) {
  const offered = new Set(isms.map((i) => i.id));
  if (project.id === SAMPLE_ID) return { picks: FIXTURE.picks.filter((p) => offered.has(p.id)).slice(0, count) };
  // 모든 사조를 대 본 결과 — 목업은 제목으로 정한 값으로 흉내 낸다. 셋 중 하나는 걸리는 자리가 없다
  return { probes: isms.map((x) => { const h = hash(project.title + x.id); return { id: x.id, hit: h < 0.3 ? '' : `[목업] ${x.summary}`, pressure: +h.toFixed(2) }; }) };
}

const isSampleIssue = (i) => SAMPLE.issues.some((s) => s.id === i.id && s.title === i.title);

function activate({ project, lens }) {
  // 예시 프로젝트라도 사람이 고치거나 더한 이슈에는 틀 문장을 낸다
  const fixed = project.id === SAMPLE_ID && FIXTURE.signals[lens.id] ? project.issues.filter(isSampleIssue) : [];
  const fixedIds = new Set(fixed.map((i) => i.id));
  const fromFixture = fixedIds.size ? FIXTURE.signals[lens.id].filter((s) => fixedIds.has(s.issue)) : [];
  const templated = project.issues.filter((i) => !fixedIds.has(i.id)).map((i) => {
    const h = hash(lens.id + i.id + i.title);
    return {
      issue: i.id,
      ladder: ['[목업] 현상', '[목업] 왜', '[목업] 본질 — 실제 모델이 원문을 읽고 쓴다.'],
      claim: `[목업] ${lens.name} → "${short(i.title)}": ${lens.ask.split('.')[0]}.`,
      basis: lens.criteria,
      stance: STANCE[Math.floor(h * 4) % 4],
      effect: '[목업] 누구의 무엇이 달라지는지는 실제 모델이 쓴다.',
      strength: +(0.5 + h * 0.4).toFixed(2),
      source: '추론',
      ...(lens.family === 'airplane' ? { origin: `[목업] ${short(lens.summary, 60)}`, parallel: '[목업] 이 이슈에서 같은 압력', strand: '[목업] 고른 갈래', paradox: '[목업] 사조의 모순', reading: '[목업] 이 사조의 눈으로 읽은 해석 — 실제 모델이 쓴다.', layer: ['태도', '원리', '방법', '표현'][Math.floor(h * 4) % 4], degree: +(0.4 + h * 0.5).toFixed(2), swap: '[목업] 이 사조여야 하는 이유' } : { against: '[목업] 통념의 틀린 점' }),
      ...(lens.family === 'tunnel' && project.facts?.length ? { facts: [project.facts[Math.floor(h * project.facts.length) % project.facts.length].id] } : {}),
    };
  });
  const out = { signals: [...fromFixture, ...templated] };
  // 경쟁 구조 — 노드의 완성안. 목업은 틀 문장만 낸다
  if (Array.isArray(project.frames)) out.proposal = { frame: project.frames.length ? `R${Math.floor(hash(lens.id) * (project.frames.length + 1))}` : 'R0', title: `[목업] ${lens.name}의 완성안`, concept: `[목업] ${lens.name} 기준을 끝까지 민 안 — 실제 모델이 쓴다.`, visual: '[목업] 보이는 모습', gain: '[목업] 사용자가 얻는 것' };
  return out;
}

// ---------- 경쟁 ----------
const mockScore = (title) => (String(title).startsWith('[목업]') ? 0.1 + hash(title) * 0.3 : 0.6 + hash(title) * 0.4);
const reframe = ({ project }) => ({ gap: '', frames: [1, 2, 3].map((n) => ({ frame: `[목업] 문제 정의 ${n} — 실제 모델이 쓴다.`, why: '[목업] 브리프의 정의와 다른 점', success: n === 2, risk: '', facts: project.facts?.[0] && n === 1 ? [project.facts[0].id] : [] })) });
const cross = ({ a, b }) => ({ keeps: { a: '[목업]', b: '[목업]' }, title: `[목업] ${short(a.title.replace('[목업] ', ''), 10)} × ${short(b.title.replace('[목업] ', ''), 10)}`, concept: '[목업] 두 안을 모두 살린 세 번째 안 — 실제 모델이 쓴다.', visual: '[목업] 보이는 모습', gain: '[목업] 사용자가 얻는 것', how: '[목업] 충돌을 푸는 장치' });
const screen = ({ project, candidates, baseline }) => ({ screens: candidates.map((c) => { const h = hash(`screen${c.id}${c.title}`); return { id: c.id, nearest: baseline.concepts[Math.floor(h * baseline.concepts.length) % baseline.concepts.length].id, verdict: String(c.title).startsWith('[목업]') ? (h < 0.2 ? '같음' : h < 0.6 ? '일부' : '다름') : (h < 0.5 ? '일부' : '다름'), why: '[목업] 기본안과의 비교는 실제 모델이 쓴다.', family: String(c.title).startsWith('[목업]') ? `[목업] 해법 ${Math.floor(hash(`fam${c.title}`) * 5) + 1}` : c.title, empty: false, success: project?.brief?.success ? (h < 0.35 ? '직접' : h < 0.75 ? '간접' : '없음') : '', breaks: '' }; }) });
// 고친 안(id가 r로 끝난다)과 고치기 전 안이 겨루면 목업에서는 고치기 전 안이 이긴다 — 예시 문장을 그대로 보여 주기 위해서다
const duel = ({ pairs }) => ({ duels: pairs.map((p) => ({ pair: p.id, winner: p.a.id.endsWith('r') ? p.b.id : p.b.id.endsWith('r') ? p.a.id : (mockScore(p.a.title) >= mockScore(p.b.title) ? p.a.id : p.b.id), why: '[목업] 이긴 이유는 실제 모델이 쓴다.', notable: hash(`not${p.a.id}${p.b.id}`) < 0.25 ? p.b.id : '', notable_why: '[목업] 뚜렷한 점', unsure: false })) });
const attack = () => ({ attacks: [{ from: '제약', hit: '[목업] 약점은 실제 모델이 찾는다.', severity: 2 }], keep: '[목업] 지켜야 할 대담한 부분' });
const revise = ({ cand }) => ({ title: cand.title, concept: cand.concept, visual: cand.visual, gain: cand.gain, keep: '[목업]', change: '[목업]', verdict: '[목업]', fixed: [{ hit: '[목업] 받은 공격', fix: '[목업] 고친 것' }], open: [] });

function link({ project, signals }) {
  if (project.id !== SAMPLE_ID) return { edges: templateEdges(signals, signals) };
  const have = new Set(signals.map((s) => s.id));
  const fixed = FIXTURE.edges.filter((e) => have.has(e.from) && have.has(e.to));
  const touched = new Set(fixed.flatMap((e) => [e.from, e.to]));
  return { edges: [...fixed, ...templateEdges(signals, signals.filter((s) => !touched.has(s.id)))] };
}

/** from 후보마다 다른 노드의 신호 1~2건에 잇는다 — 같은 이슈를 먼저, 다른 노드군을 먼저 */
function templateEdges(all, from) {
  const edges = [];
  for (const a of from) {
    const ranked = all
      .filter((b) => b.lens !== a.lens)
      .map((b) => ({ b, score: (b.issue === a.issue ? 1 : 0) + (b.family !== a.family ? 0.6 : 0) + hash(a.id + b.id) * 0.5 }))
      .sort((x, y) => y.score - x.score)
      .slice(0, hash(a.id) > 0.5 ? 2 : 1);
    for (const { b } of ranked) {
      const h = hash(`${a.id}>${b.id}`);
      const type = h < 0.22 ? 'tension' : h < 0.55 ? 'cause' : h < 0.85 ? 'reinforce' : 'condition';
      edges.push({ from: a.id, to: b.id, type, weight: +(0.45 + hash(b.id + a.id) * 0.45).toFixed(2), why: `[목업] ${TYPE_KO[type]} 관계 — 이유는 실제 모델이 쓴다.` });
    }
  }
  return edges;
}

function integrate({ project, cluster }) {
  const members = new Set(cluster.members);
  if (project.id === SAMPLE_ID) {
    const best = FIXTURE.insights
      .map((ins) => ({ ins, hit: ins.chain.filter((c) => members.has(c.signal)).length }))
      .sort((a, b) => b.hit - a.hit)[0];
    if (best && best.hit >= 3) return best.ins;
  }
  const order = { tunnel: 0, identity: 1, airplane: 2 };
  const sigs = [...cluster.signals].sort((a, b) => order[a.family] - order[b.family]);
  const t = cluster.edges.find((e) => e.type === 'tension');
  return {
    title: `[목업] 묶음 ${cluster.id}`,
    insight: `[목업] 판단 ${sigs.length}건을 묶은 자리다. 통합 인사이트 문장은 실제 모델이 쓴다.`,
    chain: sigs.map((s, i) => ({ signal: s.id, role: t && (s.id === t.from || s.id === t.to) ? '긴장' : ROLES[Math.min(i, ROLES.length - 1)], says: short(s.claim.replace('[목업] ', ''), 48) })),
    tension: t ? { a: t.from, b: t.to, resolve: '[목업] 충돌 해결 방법은 실제 모델이 쓴다.' } : null,
    keep: '[목업] 지킬 관성', change: '[목업] 바꿀 해석', concept: '[목업] 컨셉 방향', visual: '[목업] 보이는 표현 방향',
    substitute: { who: '[목업] 타겟', changes: '[목업] 근본 이슈에 넣은 결과는 실제 모델이 쓴다.' },
    verdict: '[목업]', gate: '통과', open: [], without: { nearest: 'B1', baseline: '[목업] 노드를 빼면 나왔을 안', difference: '[목업] 지금 안과의 차이' },
  };
}

function baseline({ project }) {
  if (project.id === SAMPLE_ID && FIXTURE.baseline) return FIXTURE.baseline;
  return { concepts: [1, 2, 3].map((n) => ({ title: `[목업] 기본안 ${n}`, concept: '[목업] 브리프만 읽고 낸 안 — 실제 모델이 쓴다.', visual: '[목업] 보이는 모습' })), common: '[목업] 세 안의 공통 해법' };
}

function verdict({ project, insights }) {
  // 예시 프로젝트 — 미리 써 둔 판정은 제목으로 찾는다 (경쟁 뒤에는 번호가 달라진다)
  const fixed = (i) => (project.id === SAMPLE_ID ? (FIXTURE.verdict || []).find((v) => v.title === i.title) : null);
  const M = '[목업] 실제 모델이 쓴다.';
  return { verdicts: insights.map((i) => fixed(i) ? { ...fixed(i), insight: i.id } : {
    insight: i.id,
    checks: ['브리프의 제약', '성공 기준', '접근성', '팩트 근거', '사람이 얻는 것', '자사 색 배제(N7)'].map((item) => ({ item, result: '확인 필요', why: M })),
    differentiation: { level: '구분됨', against: M, matters: M, only: '', place: M, lasting: '', meaning: '' },
    effectiveness: { level: '목적 달성', confidence: '추정', purpose: M, success: project.brief?.success ? M : '', society: '', behavior: M, cost: '', feasibility: M, issues: '', beyond: '' },
    held: ['[목업] 새로 읽히는 느낌 — 시안을 봐야 안다'], verdict: '보류', safe: '', push: '[목업] 더 밀 곳', precedent: '',
  }) };
}

function direct({ project, insights, needDev }) {
  const ids = insights.map((i) => i.id);
  if (project.id === SAMPLE_ID && FIXTURE.direction) {
    // 예시 디렉션은 N1 · N2 · N3을 제목으로 가리킨다 — 경쟁 뒤에 번호가 바뀌어도 같은 인사이트를 가리키게 옮긴다
    const TITLE = { N1: '친근한 안내 문구로 재방문 습관 유도', N2: '분량을 먼저 보여 줘 읽기 부담 완화', N3: '입구에서 동선을 나눠 기존 이용자 보호' };
    const now = Object.fromEntries(Object.entries(TITLE).map(([old, t]) => [old, insights.find((i) => i.title === t)?.id || old]));
    const d = JSON.parse(JSON.stringify(FIXTURE.direction).replace(/"N([123])"/g, (m, n) => `"@${n}"`).replace(/"@([123])"/g, (m, n) => `"${now[`N${n}`]}"`));
    return { ...d, overlap: (d.overlap || []).filter((o) => ids.includes(o.insight)) };
  }
  const one = (n) => ({ direction: '[목업] 이 관점의 방향은 실제 모델이 쓴다.', actions: ['[목업] 바로 할 일 1', '[목업] 바로 할 일 2'], from: [ids[n % ids.length]], need: [] });
  return {
    headline: '[목업] 총괄 디렉션 한 문장',
    perspectives: { planning: one(0), design: one(1), development: needDev ? one(2) : null, service: one(2) },
    development_reason: needDev ? '' : '[목업] 구현이 필요한 과제가 아니다',
    conflicts: [], priority: [{ what: '[목업] 먼저 할 일', owner: 'planning', from: ids[0] }, { what: '[목업] 다음 할 일', owner: 'design', from: ids[0] }],
    overlap: ids.map((id) => ({ insight: id, baseline: 'B1', verdict: '일부', why: '[목업] 기본안과의 비교는 실제 모델이 쓴다.' })),
  };
}

// ---------- 프레임 ----------
const M_ = '[목업] 실제 모델이 재료로 채운다.';
const plan = ({ run }) => { const n = run.insights[0].id; const b = run.baseline?.concepts?.[0]?.id || n; const r = run.frames?.[0]?.id || n; const t = run.signals.find((x) => x.family === 'tunnel')?.id || n;
  return { jtbd: { situation: M_, motivation: M_, outcome: M_, from: [r] }, competition: [{ who: '[목업] 지금 그 일을 대신 해 주는 것', does: M_, gap: M_, from: [t] }], positioning: { axis: M_, crowd: M_, place: '[목업] 빈자리 한 구절', from: [b, n] },
    ksf: [{ factor: M_, from: [n] }, { factor: M_, from: [n] }], claim: { claim: '[목업] Key Claim 한 문장', rtb: ['[목업] 믿게 하는 근거'], from: [n] }, theme: { theme: `[목업] ${short(run.insights[0].title, 16)}`, why: M_, from: [n] }, covers: run.insights.slice(1).map((x) => ({ insight: x.id, role: M_ })), baseline_same: false, need: [] }; };
const pull = ({ run }) => ({ problems: run.insights.slice(0, 2).map((n, i) => ({ insight: n.id, problem: '[목업] 화면에서 벌어질 조형 문제', chapters: [['KH-B4', 'KH-B3'][i]], why: M_ })) });
const creative = ({ run, chapters }) => { const n = run.insights[0].id; const b = run.baseline?.concepts?.[0]?.id || n; const ism = run.signals.find((x) => x.family === 'airplane' && run.insights.some((i) => i.check.used.includes(x.id)));
  return { for: { frame: '[목업] 어느 범주로 읽히게 할 것인가', from: [n] }, pop: [{ point: M_, from: [b] }], pod: [{ point: '[목업] 기본안에 없는 것', core: true, matters: M_, rtb: ['[목업]'], from: [n] }], direction: '[목업] Creative 방향', look: { keep: M_, change: M_, not: M_ },
    isms: ism ? [{ signal: ism.id, strand: M_, layer: '원리', changed: M_ }] : [], knowhow: [...chapters.map((k) => ({ chapter: k.id, solves: M_, operation: '[목업] 항목과 조작', from: '[목업] 무엇을', to: '[목업] 어떻게', without: M_ })), { chapter: chapters[0]?.id, solves: M_, operation: '', from: '', to: '', without: '' }], held: ['[목업] 굵기와 크기 값 — 시안에서 정한다'] }; };

// 같은 해법 묶기 — 목업 후보는 제목으로 만든 묶음 이름이 같으면 한 묶음, 그 밖에는 하나씩
const distinct = ({ candidates }) => { const m = new Map(); for (const c of candidates) { const k = String(c.title).startsWith('[목업]') ? `[목업] 해법 ${Math.floor(hash(`fam${c.title}`) * 5) + 1}` : c.id; m.set(k, [...(m.get(k) || []), c.id]); } return { groups: [...m].map(([name, ids]) => ({ name: name.startsWith('[목업]') ? name : candidates.find((c) => c.id === ids[0]).title, ids, why: ids.length > 1 ? '[목업] 같은 해법' : '' })) }; };
const HANDLERS = { plan, pull, creative, baseline, verdict, direct, reframe, cross, screen, duel, distinct, attack, revise, issues: ({ project }) => issues(project), route, activate, link, integrate };

export function createMock({ delay = 0 } = {}) {
  return {
    name: 'mock',
    label: '목업 (API 없음)',
    async json({ task, signal }) {
      const fn = HANDLERS[task?.kind];
      if (!fn) throw new Error(`목업이 모르는 작업: ${task?.kind}`);
      if (delay) await new Promise((r) => setTimeout(r, delay * (0.5 + hash(JSON.stringify([task.kind, task.lens?.id, task.cluster?.id])))));
      if (signal?.aborted) throw new Error('취소됨');
      return { json: JSON.parse(JSON.stringify(fn(task))), usage: null };
    },
  };
}
