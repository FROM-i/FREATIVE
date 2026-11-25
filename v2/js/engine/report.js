// 보고서(.md) — 두괄식. 결론(통합 인사이트)이 먼저, 근거(사슬·판단)는 뒤에.
import { FAMILIES } from '../../knowledge/nodes.js';
import { lensName } from '../graph/model.js';
import { PERSPECTIVES, tagById, categoryById } from '../../knowledge/tags.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const TYPE = { cause: '원인', condition: '조건', reinforce: '강화', tension: '충돌' };

export function reportMarkdown(project) {
  const run = project.run;
  const L = [];
  L.push(`# ${project.title}`, '');
  if (!run) { L.push('아직 사고 기록이 없습니다.'); return L.join('\n'); }
  const u = run.usage || { signals: run.signals.length, used: 0, unused: [], byFamily: {} };
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const root = project.issues.find((i) => i.root) || project.issues[0];

  L.push(`> THE FROM BRAIN · ${run.at.slice(0, 10)} · 공급자 ${run.provider} · AI의 판단은 모두 예비 판정이다. 방향의 결정은 사람이 한다.`, '');
  L.push('## 결론', '');
  L.push(`통합 인사이트 ${run.insights.length}건. 판단 ${u.signals}건 중 ${u.used}건(${pct(u.used, u.signals)}%)이 인사이트에 쓰였다.`, '');
  run.insights.forEach((n, i) => L.push(`${i + 1}. **${n.title}** — ${n.insight}`));
  L.push('');
  if (root) L.push(`근본 이슈: ${root.title}`, root.test ? `판정 질문: ${root.test}` : '', '');
  if (categoryById(project.category)) L.push(`분류: ${categoryById(project.category).name} · 분석한 이슈 ${(run.setup?.issues || []).map((i) => `${i.id}[${i.tags.map((t) => tagById(t)?.name).join(', ')}${i.auto ? ' · 자동' : ''}]`).join(' ')}`, '');

  const d = run.direction;
  if (d) {
    const name = (id) => PERSPECTIVES.find((v) => v.id === id)?.name || id;
    L.push('## 통합 디렉션', '', `**${d.headline}**`, '');
    if (!d.check.ok) L.push(`> 검증 미통과: ${d.check.problems.join(' / ')}`, '');
    for (const v of PERSPECTIVES) {
      const x = d.perspectives[v.id];
      if (!x) { if (v.id === 'development') L.push(`### ${v.name}`, '', `이 과제에서는 뺐다 — ${d.developmentReason}`, ''); continue; }
      L.push(`### ${v.name}`, '', x.direction, '', ...x.actions.map((a) => `- ${a}`), ...(x.need.length ? [`- 확인할 것: ${x.need.join(' / ')}`] : []), `- 근거: ${x.from.join(', ')}`, '');
    }
    if (d.conflicts.length) L.push('### 관점이 부딪히는 자리', '', ...d.conflicts.map((c) => `- ${c.between.map(name).join(' ↔ ')}: ${c.what} → ${c.resolve}`), '');
    L.push('### 먼저 할 일', '', ...d.priority.map((x, i) => `${i + 1}. ${x.what} (${name(x.owner)}${x.from ? ` · ${x.from}` : ''})`), '');
  }

  if (run.baseline?.concepts?.length) {
    const ov = d?.overlap || [];
    const cnt = (v) => ov.filter((o) => o.verdict === v).length;
    L.push('## 기본안 대조', '');
    if (ov.length) L.push(`통합 인사이트 ${ov.length}건 중 기본안에 없는 해법 ${cnt('다름')}건, 기본안에 장치를 더한 것 ${cnt('일부')}건, 기본안과 같은 것 ${cnt('같음')}건.`, '');
    L.push('| 기본안 | 내용 |', '|---|---|', ...run.baseline.concepts.map((c) => `| ${c.id} ${c.title} | ${c.concept} |`), '');
    if (ov.length) L.push('| 인사이트 | 가까운 기본안 | 판정 | 이유 |', '|---|---|---|---|', ...ov.map((o) => `| ${o.insight} | ${o.baseline || '-'} | ${o.verdict} | ${o.why} |`), '');
  }

  for (const n of run.insights) {
    const c = n.check;
    L.push(`## ${n.id}. ${n.title}`, '', n.insight, '');
    if (!c.ok) L.push(`> 검증 미통과: ${c.problems.join(' / ')}`, '');
    L.push(`- 컨셉 방향: ${n.concept}`, `- 보이는 표현: ${n.visual}`, `- 지킬 관성: ${n.keep}`, `- 바꿀 해석: ${n.change}`);
    L.push(`- 근본 이슈에 적용하면: ${n.substitute.who} — ${n.substitute.changes}`, `- 판정 질문의 답: ${n.verdict}`, `- 문(N7): ${n.gate}`);
    if (n.without?.baseline) L.push(`- 노드 없이 냈을 안: ${n.without.baseline}`, `- 이 안의 차이: ${n.without.difference}`);
    L.push('');
    L.push(`근거 판단 ${c.used.length}건 — ${Object.keys(FAMILIES).map((f) => `${FAMILIES[f].short} ${c.byFamily[f]}건`).join(' · ')}`, '');
    L.push('| 순서 | 역할 | 사슬 | 노드 | 판단 |', '|---|---|---|---|---|');
    n.chain.forEach((s, i) => L.push(`| ${i + 1} | ${s.role} | ${s.says} | ${lensName(sig.get(s.signal)?.lens)} | ${s.signal} |`));
    L.push('');
    if (n.tension) L.push(`충돌: ${n.tension.a} ↔ ${n.tension.b} — ${n.tension.resolve}`, '');
    if (n.open.length) L.push('사람이 확인할 것', ...n.open.map((o) => `- ${o}`), '');
  }

  L.push('## 연결', '');
  const k = run.link || {};
  L.push(`판단 ${k.signals}건 · 연결 ${k.edges}건 (노드군 사이 ${k.crossFamily}건, ${pct(k.crossFamily, k.edges)}%) · 충돌 ${k.byType?.tension || 0}건`, '');
  L.push('| 노드군 | 낸 판단 | 인사이트에 쓰인 판단 |', '|---|---|---|');
  for (const f of Object.keys(FAMILIES)) { const b = u.byFamily[f] || { signals: 0, used: 0 }; L.push(`| ${FAMILIES[f].short} | ${b.signals}건 | ${b.used}건 (${pct(b.used, b.signals)}%) |`); }
  L.push('');
  if (u.unused.length) {
    L.push(`### 쓰이지 않은 판단 ${u.unused.length}건`, '');
    for (const id of u.unused) L.push(`- ${id} (${lensName(sig.get(id).lens)}) ${sig.get(id).claim}`);
    L.push('');
  }
  L.push('### 엣지', '', '| from | 관계 | to | 이유 | 판단 |', '|---|---|---|---|---|');
  for (const e of run.edges) L.push(`| ${e.from} | ${TYPE[e.type]} ${e.weight} | ${e.to} | ${e.why} | ${e.by === 'human' ? '사람' : 'AI'} |`);
  L.push('', '### 판단 — 판단에 이른 단계', '');
  for (const s of run.signals) {
    L.push(`**${s.id}** · ${lensName(s.lens)} · ${s.issue} · ${s.source}`, '', ...(s.ladder || []).map((x, i) => `${i + 1}. ${x}`), '');
    if (s.origin) L.push(`- 사조가 겨눈 것: ${s.origin}`, `- 이 이슈의 같은 구조: ${s.parallel}`, `- 다루는 방식: ${s.treatment}`, `- 이 사조여야 하는 이유: ${s.swap}`, `- 두고 올 것: ${s.leave}`);
    if (s.against) L.push(`- 통념의 틀린 점: ${s.against}`);
    L.push(`- 판단: ${s.claim}`, `- 달라지는 것: ${s.effect}`, '');
  }
  if (run.notes?.length || run.failed?.length) {
    L.push('', '### 실행 기록', '');
    for (const f of run.failed || []) L.push(`- 응답하지 못한 노드: ${lensName(f.lens)} — ${f.error}`);
    for (const n of run.notes || []) L.push(`- ${n}`);
  }
  return L.filter((x) => x !== undefined).join('\n');
}
