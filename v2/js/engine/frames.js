// 프레임 — 경쟁에서 이긴 안을 기획 틀(JTBD → … → Concept Theme)과 디자인 틀(FoR · PoP · PoD → Creative 방향)로 정리한다.
// 틀은 칸이다. 모델은 재료로 칸을 채우고, 코드는 근거 id가 실제로 있는지와 형식을 확인한다. 근거 없는 칸은 비운다.
import { categoriesOf } from '../../knowledge/tags.js';
import { planPrompt, knowhowPullPrompt, creativePrompt } from '../../knowledge/prompts-frames.js';
import { KNOWHOW, knowhowById } from '../../knowledge/knowhow.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

/** 디자인 틀까지 가는 과제인가 — 분류가 디자인 · 통합 · 서비스이거나 디자인 태그가 붙은 이슈가 있을 때 */
export function needsCreative(project) {
  return categoriesOf(project).some((c) => ['design', 'integrated', 'service'].includes(c)) || project.issues.some((i) => (i.tags || []).some((t) => String(t).startsWith('ds-')));
}

/** 근거 id 모음 — 칸의 from은 이 안에 있어야 한다 */
function sources(project, run) {
  return new Set([...run.insights.map((n) => n.id), ...(run.frames || []).map((f) => f.id), ...(run.baseline?.concepts || []).map((c) => c.id), ...(project.facts || []).map((f) => f.id), ...run.signals.map((s) => s.id)]);
}

/** 기획 틀 정리 — 근거가 없는 칸은 비우고 problems에 적는다 */
export function shapePlan(raw, ok) {
  const from = (v) => list(v).map(text).filter((id) => ok.has(id));
  const problems = [];
  const slot = (name, body, f) => { const src = from(f); if (!body) { problems.push(`${name} 칸이 비었다`); return null; } if (!src.length) { problems.push(`${name} 칸에 근거가 없다`); return null; } return src; };
  const j = raw?.jtbd || {};
  const jtbd = { situation: text(j.situation), motivation: text(j.motivation), outcome: text(j.outcome) };
  jtbd.from = slot('JTBD', jtbd.situation && jtbd.motivation && jtbd.outcome, j.from) || [];
  const competition = list(raw?.competition).map((c) => ({ who: text(c.who), does: text(c.does), gap: text(c.gap), from: from(c.from) })).filter((c) => c.who && c.from.length);
  if (!competition.length) problems.push('경쟁 구도 칸에 근거 있는 항목이 없다');
  const p = raw?.positioning || {};
  const positioning = { axis: text(p.axis), crowd: text(p.crowd), place: text(p.place) };
  positioning.from = slot('포지셔닝', positioning.place, p.from) || [];
  const ksf = list(raw?.ksf).map((k) => ({ factor: text(k.factor), from: from(k.from) })).filter((k) => k.factor && k.from.length);
  if (ksf.length < 2) problems.push('KSF가 2개보다 적다');
  const c = raw?.claim || {};
  const claim = { claim: text(c.claim), rtb: list(c.rtb).map(text).filter(Boolean) };
  claim.from = slot('Key Claim', claim.claim, c.from) || [];
  if (claim.claim && !claim.rtb.length) problems.push('Key Claim을 믿게 하는 근거(RTB)가 없다');
  const t = raw?.theme || {};
  const theme = { theme: text(t.theme), why: text(t.why) };
  theme.from = slot('Concept Theme', theme.theme, t.from) || [];
  if (raw?.baseline_same === true) problems.push('Key Claim이나 Theme이 기본안과 같다고 스스로 판정했다');
  return { ok: problems.length === 0, problems, plan: { jtbd, competition, positioning, ksf, claim, theme, covers: list(raw?.covers).map((x) => ({ insight: text(x.insight), role: text(x.role) })).filter((x) => ok.has(x.insight)), need: list(raw?.need).map(text).filter(Boolean) } };
}

/** 디자인 틀 정리 — 노하우는 무엇을 어떻게 바꾸는지 쓰지 못하면 뺀다 */
export function shapeCreative(raw, ok, chapters) {
  const from = (v) => list(v).map(text).filter((id) => ok.has(id));
  const called = new Set(chapters.map((k) => k.id));
  const problems = [];
  const pod = list(raw?.pod).map((x) => ({ point: text(x.point), core: x.core === true, matters: text(x.matters), rtb: list(x.rtb).map(text).filter(Boolean), from: from(x.from) })).filter((x) => x.point && x.from.length);
  if (!pod.length) problems.push('PoD에 근거 있는 항목이 없다');
  else if (pod.filter((x) => x.core).length !== 1) { pod.forEach((x, i) => { x.core = i === 0; }); problems.push('코어 PoD가 하나가 아니어서 첫 항목을 코어로 두었다'); }
  const all = list(raw?.knowhow).map((k) => ({ chapter: text(k.chapter), solves: text(k.solves), operation: text(k.operation), from: text(k.from), to: text(k.to), without: text(k.without) }));
  const knowhow = all.filter((k) => called.has(k.chapter) && k.operation && k.from && k.to);
  if (all.length > knowhow.length) problems.push(`무엇을 어떻게 바꾸는지 쓰지 못한 노하우 ${all.length - knowhow.length}건을 뺐다`);
  const f = raw?.for || {};
  if (!text(f.frame)) problems.push('FoR 칸이 비었다');
  if (!text(raw?.direction)) problems.push('Creative 방향이 비었다');
  return { ok: !problems.some((p) => p.includes('비었다') || p.includes('없다')), problems, creative: {
    for: { frame: text(f.frame), from: from(f.from) }, pop: list(raw?.pop).map((x) => ({ point: text(x.point), from: from(x.from) })).filter((x) => x.point), pod,
    direction: text(raw?.direction), look: { keep: text(raw?.look?.keep), change: text(raw?.look?.change), not: text(raw?.look?.not) },
    isms: list(raw?.isms).map((x) => ({ signal: text(x.signal), strand: text(x.strand), layer: text(x.layer), changed: text(x.changed) })).filter((x) => ok.has(x.signal) && x.changed),
    knowhow, held: list(raw?.held).map(text).filter(Boolean),
  } };
}

/**
 * 프레임 단계를 돌린다. 기획 틀은 언제나, 디자인 틀은 디자인까지 가는 과제에서만.
 * 틀을 채우지 못하면 이유를 붙여 한 번 다시 쓴다. 그래도 안 되면 표시해서 남긴다. 확정은 사람이 한다.
 */
export async function frames({ project, run, call, emit }) {
  const ok = sources(project, run);
  emit('stage', { stage: 'plan' });
  let planned;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = planPrompt(project, run);
    if (attempt) p.user += `\n\n## 다시 쓰는 이유\n앞서 쓴 틀은 다음 이유로 받지 않았다: ${planned.problems.join(' / ')}`;
    planned = shapePlan(await call({ role: 'director', ...p, task: { kind: 'plan', project, run, attempt } }), ok);
    if (planned.ok) break;
  }
  run.plan = { ...planned.plan, check: { ok: planned.ok, problems: planned.problems }, confirmed: false };
  emit('planned');
  if (!needsCreative(project)) { run.creative = null; return; }

  emit('stage', { stage: 'creative' });
  const pp = knowhowPullPrompt(project, run, run.plan);
  const praw = await call({ role: 'brain', ...pp, task: { kind: 'pull', project, run } });
  const ins = new Set(run.insights.map((n) => n.id));
  const pulled = list(praw?.problems).map((x) => ({ insight: ins.has(text(x.insight)) ? text(x.insight) : '', problem: text(x.problem), chapters: list(x.chapters).map(text).filter((id) => knowhowById(id)), why: text(x.why) })).filter((x) => x.problem && x.chapters.length);
  const chapters = [...new Set(pulled.flatMap((x) => x.chapters))].slice(0, 5).map(knowhowById);
  const cp = creativePrompt(project, run, run.plan, pulled, chapters);
  const made = shapeCreative(await call({ role: 'director', ...cp, task: { kind: 'creative', project, run, pulled, chapters } }), ok, chapters);
  run.creative = { ...made.creative, problems: pulled, chapters: chapters.map((k) => ({ id: k.id, name: k.name })), check: { ok: made.ok, problems: made.problems }, confirmed: false };
  emit('created');
}

export { KNOWHOW };
