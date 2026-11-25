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
    roots: [{ title: `[목업] ${short(b.target || '타겟', 14)}의 무엇이 바뀌어야 하는가`, detail: `과업 "${short(b.what, 24)}" → 목적 "${short(b.purpose, 24)}" 아래의 근본 이슈. 실제 모델이 채운다.`, test: '[목업] 이 안이 있으면 타겟의 행동이 달라지는가?' }],
    issues: [{ title: '[목업] 타겟이 지금 망설이는 지점', detail: '실제 모델이 채운다.' }],
  };
}

function route({ project, isms, count }) {
  const offered = new Set(isms.map((i) => i.id));
  if (project.id === SAMPLE_ID) return { picks: FIXTURE.picks.filter((p) => offered.has(p.id)).slice(0, count) };
  const ranked = [...isms].sort((a, b) => hash(project.title + a.id) - hash(project.title + b.id));
  const picks = ranked.slice(0, Math.max(0, count - 1));
  const ids = new Set(picks.map((p) => p.id));
  const opp = OPPOSITIONS.find((o) => (ids.has(o.a) && offered.has(o.b)) || (ids.has(o.b) && offered.has(o.a)));
  const extra = opp ? isms.find((i) => i.id === (ids.has(opp.a) ? opp.b : opp.a)) : ranked[count - 1];
  if (extra && !ids.has(extra.id)) picks.push(extra);
  return { picks: picks.slice(0, count).map((p) => ({ id: p.id, why: `[목업] ${p.summary}` })) };
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
      claim: `[목업] ${lens.name} → "${short(i.title)}": ${lens.ask.split('.')[0]}.`,
      basis: lens.criteria,
      stance: STANCE[Math.floor(h * 4) % 4],
      effect: '[목업] 누구의 무엇이 달라지는지는 실제 모델이 쓴다.',
      strength: +(0.5 + h * 0.4).toFixed(2),
      source: '추론',
      ...(lens.family === 'airplane' ? { leave: `[목업] ${short(lens.leave[0], 40)}` } : {}),
    };
  });
  return { signals: [...fromFixture, ...templated] };
}

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
    insight: `[목업] 신호 ${sigs.length}건이 수렴한 자리다. 통합 인사이트 문장은 실제 모델이 쓴다.`,
    chain: sigs.map((s, i) => ({ signal: s.id, role: t && (s.id === t.from || s.id === t.to) ? '긴장' : ROLES[Math.min(i, ROLES.length - 1)], says: short(s.claim.replace('[목업] ', ''), 48) })),
    tension: t ? { a: t.from, b: t.to, resolve: '[목업] 긴장을 푸는 방법은 실제 모델이 쓴다.' } : null,
    keep: '[목업] 지킬 관성', change: '[목업] 바꿀 해석', concept: '[목업] 컨셉 방향', visual: '[목업] 보이는 표현 방향',
    substitute: { who: '[목업] 타겟', changes: '[목업] 근본 이슈에 넣은 결과는 실제 모델이 쓴다.' },
    verdict: '[목업]', gate: '통과', open: [],
  };
}

const HANDLERS = { issues: ({ project }) => issues(project), route, activate, link, integrate };

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
