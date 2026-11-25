// 보고서(.md) — 두괄식. 결론(통합 인사이트)이 먼저, 근거(사슬·신호)는 뒤에.
import { FAMILIES } from '../../knowledge/nodes.js';
import { lensName } from '../graph/model.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const TYPE = { cause: '원인', condition: '조건', reinforce: '강화', tension: '긴장' };

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
  L.push(`통합 인사이트 ${run.insights.length}건. 신호 ${u.signals}건 중 ${u.used}건(${pct(u.used, u.signals)}%)이 인사이트까지 이어졌다.`, '');
  run.insights.forEach((n, i) => L.push(`${i + 1}. **${n.title}** — ${n.insight}`));
  L.push('');
  if (root) L.push(`근본 이슈: ${root.title}`, root.test ? `판정 질문: ${root.test}` : '', '');

  for (const n of run.insights) {
    const c = n.check;
    L.push(`## ${n.id}. ${n.title}`, '', n.insight, '');
    if (!c.ok) L.push(`> 가드에 걸림: ${c.problems.join(' / ')}`, '');
    L.push(`- 컨셉 방향: ${n.concept}`, `- 보이는 표현: ${n.visual}`, `- 지킬 관성: ${n.keep}`, `- 바꿀 해석: ${n.change}`);
    L.push(`- 근본 이슈에 넣으면: ${n.substitute.who} — ${n.substitute.changes}`, `- 판정 질문의 답: ${n.verdict}`, `- 문(N7): ${n.gate}`, '');
    L.push(`근거 신호 ${c.used.length}건 — ${Object.keys(FAMILIES).map((f) => `${FAMILIES[f].short} ${c.byFamily[f]}건`).join(' · ')}`, '');
    L.push('| 순서 | 역할 | 사슬 | 노드 | 신호 |', '|---|---|---|---|---|');
    n.chain.forEach((s, i) => L.push(`| ${i + 1} | ${s.role} | ${s.says} | ${lensName(sig.get(s.signal)?.lens)} | ${s.signal} |`));
    L.push('');
    if (n.tension) L.push(`긴장: ${n.tension.a} ↔ ${n.tension.b} — ${n.tension.resolve}`, '');
    if (n.open.length) L.push('사람이 확인할 것', ...n.open.map((o) => `- ${o}`), '');
  }

  L.push('## 연결', '');
  const k = run.link || {};
  L.push(`신호 ${k.signals}건 · 연결 ${k.edges}건 (노드군 사이 ${k.crossFamily}건, ${pct(k.crossFamily, k.edges)}%) · 긴장 ${k.byType?.tension || 0}건`, '');
  L.push('| 노드군 | 낸 신호 | 인사이트까지 간 신호 |', '|---|---|---|');
  for (const f of Object.keys(FAMILIES)) { const b = u.byFamily[f] || { signals: 0, used: 0 }; L.push(`| ${FAMILIES[f].short} | ${b.signals}건 | ${b.used}건 (${pct(b.used, b.signals)}%) |`); }
  L.push('');
  if (u.unused.length) {
    L.push(`### 쓰이지 않은 신호 ${u.unused.length}건`, '');
    for (const id of u.unused) L.push(`- ${id} (${lensName(sig.get(id).lens)}) ${sig.get(id).claim}`);
    L.push('');
  }
  L.push('### 엣지', '', '| from | 관계 | to | 이유 | 판단 |', '|---|---|---|---|---|');
  for (const e of run.edges) L.push(`| ${e.from} | ${TYPE[e.type]} ${e.weight} | ${e.to} | ${e.why} | ${e.by === 'human' ? '사람' : 'AI'} |`);
  L.push('', '### 신호', '', '| ID | 노드 | 이슈 | 판단 | 달라지는 것 | 출처 |', '|---|---|---|---|---|---|');
  for (const s of run.signals) L.push(`| ${s.id} | ${lensName(s.lens)} | ${s.issue} | ${s.claim} | ${s.effect} | ${s.source} |`);
  if (run.notes?.length || run.failed?.length) {
    L.push('', '### 실행 기록', '');
    for (const f of run.failed || []) L.push(`- 응답하지 못한 노드: ${lensName(f.lens)} — ${f.error}`);
    for (const n of run.notes || []) L.push(`- ${n}`);
  }
  return L.filter((x) => x !== undefined).join('\n');
}
