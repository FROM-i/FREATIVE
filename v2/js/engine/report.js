// 보고서(.md) — 두괄식. 결론(통합 인사이트)이 먼저, 근거(사슬·판단)는 뒤에.
import { FAMILIES } from '../../knowledge/nodes.js';
import { lensName } from '../graph/model.js';
import { PERSPECTIVES, tagById, categoryById, categoriesOf } from '../../knowledge/tags.js';

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
  const st = run.strategy;
  if (st) {
    L.push('## 전략 한 장', '', `**${st.concept.name}** — ${st.concept.line}`, st.principle ? `\n${st.principle}` : '', '');
    st.pillars.forEach((p) => L.push(`- **${p.label || '축'} · ${p.name}** — ${p.guide}${p.moves.length ? ` (${p.moves.join(' / ')})` : ''}${p.facts.length ? ` [${p.facts.join(' ')}]` : ''}`));
    L.push('', `팩트 ${st.coverage.facts.used}/${st.coverage.facts.total}건, 판단 ${st.coverage.signals.used}/${st.coverage.signals.total}건(인사이트에 쓰이지 않던 것 ${st.coverage.signals.fresh}건)을 썼다.`, '');
  }
  L.push('## 결론', '');
  L.push(`통합 인사이트 ${run.insights.length}건. 판단 ${u.signals}건 중 ${u.used}건(${pct(u.used, u.signals)}%)이 인사이트에 쓰였다.`, '');
  run.insights.forEach((n, i) => L.push(`${i + 1}. **${n.title}** — ${n.insight}`));
  L.push('');
  if (root) L.push(`근본 이슈: ${root.title}`, root.test ? `판정 질문: ${root.test}` : '', '');
  if (categoriesOf(project).length) L.push(`분류: ${categoriesOf(project).map((c) => categoryById(c).name).join(' · ')} · 분석한 이슈 ${(run.setup?.issues || []).map((i) => `${i.id}[${i.tags.map((t) => tagById(t)?.name).join(', ')}${i.auto ? ' · 자동' : ''}]`).join(' ')}`, '');

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

  if (run.plan) {
    const p = run.plan; const src = (ids) => (ids?.length ? ` (${ids.join(', ')})` : '');
    L.push('## 기획 틀', '', `**Concept Theme: ${p.theme.theme || '—'}**${p.confirmed ? ' — 확정' : ' — 사람 확정 전'}`, '', p.theme.why + src(p.theme.from), '');
    if (!p.check.ok) L.push(`> 채우지 못한 칸: ${p.check.problems.join(' / ')}`, '');
    L.push(`- JTBD: ${[p.jtbd.situation, p.jtbd.motivation, p.jtbd.outcome].filter(Boolean).join(' → ')}${src(p.jtbd.from)}`, ...p.competition.map((c) => `- 경쟁: ${c.who} — ${c.does} / 못 하는 것: ${c.gap}${src(c.from)}`), `- 포지셔닝: ${p.positioning.axis} — 모두가 선 자리: ${p.positioning.crowd} / 빈자리: ${p.positioning.place}${src(p.positioning.from)}`, ...p.ksf.map((k) => `- KSF: ${k.factor}${src(k.from)}`), `- Key Claim: ${p.claim.claim} — 근거: ${p.claim.rtb.join(' / ')}${src(p.claim.from)}`, ...(p.need.length ? [`- 확인할 것: ${p.need.join(' / ')}`] : []), '');
  }
  if (run.creative) {
    const c = run.creative; const src = (ids) => (ids?.length ? ` (${ids.join(', ')})` : '');
    L.push('## 디자인 틀', '', `**Creative 방향: ${c.direction || '—'}**${c.confirmed ? ' — 확정' : ' — 사람 확정 전'}`, '', `- FoR: ${c.for.frame}${src(c.for.from)}`, ...c.pop.map((x) => `- PoP: ${x.point}${src(x.from)}`), ...c.pod.map((x) => `- PoD${x.core ? '(코어)' : ''}: ${x.point} — ${x.matters} · 근거: ${x.rtb.join(' / ')}${src(x.from)}`), `- 지킬 것: ${c.look.keep}`, `- 바꿀 것: ${c.look.change}`, `- 하지 않을 것: ${c.look.not}`, ...c.isms.map((x) => `- 사조: ${x.signal} · ${x.strand} · ${x.layer} — ${x.changed}`), ...c.knowhow.map((k) => `- 노하우: ${c.chapters.find((x) => x.id === k.chapter)?.name || k.chapter} · ${k.operation} — ${k.from} → ${k.to} (빼면: ${k.without})`), ...(c.held.length ? [`- 시안에서 정할 것: ${c.held.join(' / ')}`] : []), '');
  }
  if (run.arena) {
    const c = run.arena.counts;
    L.push('## 경쟁 기록', '', `후보 ${c.candidates}개(노드의 완성안 ${c.node} · 묶음 통합안 ${c.cluster} · 충돌 교배 ${c.cross}). 사유가 있어 탈락 ${c.screened}개, 나머지는 점수 없이 ${c.duels}번 겨뤘다. 결선에서 판정이 갈린 대결 ${c.splits}건. 기본안에 없는 해법인데 떨어진 후보 ${c.different}개. 고친 안이 채택된 것 ${c.revised}건.`, '');
    if (c.groups != null) L.push(`결선 ${c.finalists}개를 다시 견주니 서로 다른 해법은 ${c.groups}개였다. 같은 해법이라 빠진 안 ${c.merged}개, 예비에서 올린 안 ${c.reserve}개.`, '');
    if (run.scope?.gap) L.push(`근본 이슈가 덮지 못하는 것: ${run.scope.gap}`, '');
    if (run.frames?.length) L.push('다시 정의한 문제', ...run.frames.map((f) => `- ${f.id} ${f.frame}${f.success ? ' [성공 기준을 겨눔]' : ''} — ${f.why}`), '');
    L.push('| 후보 | 출처 | 기본안 대조 | 해법 묶음 | 결선 자리 | 조별 승 | 결선 승 | 결과 | 제목 |', '|---|---|---|---|---|---|---|---|---|', ...[...run.arena.candidates].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99) || (y.swiss ?? -1) - (x.swiss ?? -1)).map((k) => `| ${k.id} | ${k.from} | ${k.screen?.verdict || '-'} | ${k.family || '-'} | ${k.seat || '-'} | ${k.swiss ?? '-'} | ${k.wins ?? '-'} | ${k.status}${k.contested ? ' · 판정 갈림' : ''} | ${k.title} |`), '');
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
    if (n.stance?.bet) L.push(`- 기조: ${n.stance.bet}${n.stance.givesUp ? ` (포기한 것: ${n.stance.givesUp})` : ''}${n.kept ? ` — 고친 뒤 ${n.kept}` : ''}`, ...(n.costs || []).map((x) => `  - 감수한 대가: ${x.note}`), ...(n.refused || []).map((x) => `  - 받지 않은 공격: ${x.hit} — ${x.note}`));
    if (n.from) { const v = n.from; const ans = (o) => Object.entries(o).filter(([k, x]) => !['level', 'confidence'].includes(k) && x).map(([, x]) => x).join(' '); L.push(`- 더프롬 판정: ${v.verdict}${v.push ? ` — 더 밀 곳: ${v.push}` : ''}`, `- 차별화: ${v.differentiation.level || '판단 보류'} — ${ans(v.differentiation)}`, `- 실효성: ${v.effectiveness.level || '판단 보류'} (${v.effectiveness.confidence}) — ${ans(v.effectiveness)}`, `- 확인 항목: ${v.checks.map((c) => `${c.item} ${c.result}`).join(' · ')}`, ...(v.held.length ? [`- 판단을 미룬 것: ${v.held.join(' / ')}`] : [])); }
    if (n.attacks?.length) L.push(`- 받은 공격 ${n.attacks.length}건: ${n.attacks.map((x) => `[${x.from}] ${x.hit}`).join(' / ')}`, ...(n.fixed?.length ? [`- 고친 것: ${n.fixed.map((f) => f.fix).join(' / ')}`] : []));
    if (n.facts?.length) L.push(`- 근거 팩트: ${n.facts.join(', ')}`);
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

// ---------- 한 장 보고서 (.html) — 전략 한 장을 그대로 인쇄할 수 있는 한 쪽으로 낸다 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function strategyHtml(project) {
  const run = project.run; const st = run?.strategy;
  if (!st) return `<!doctype html><meta charset="utf-8"><title>${esc(project.title)}</title><p>전략 한 장이 아직 없습니다.</p>`;
  const facts = new Map((project.facts || []).map((f) => [f.id, f]));
  const usedFacts = [...new Set([...st.pillars.flatMap((p) => p.facts), ...st.fixes.flatMap((x) => x.facts), ...st.boosts.flatMap((x) => x.facts)])].filter((id) => facts.has(id));
  const ev = (ids) => (ids.length ? `<span class="ev">${ids.map((id) => `#${esc(id)}`).join(' ')}</span>` : '');
  const short = (id) => st.insights.find((x) => x.id === id)?.name || id;
  const partName = (id) => { const p = st.pillars.find((x) => x.part === id); return p ? p.label || p.name : ''; };
  const cv = st.coverage;
  const pair = (a, b, f) => `<tr><td class="from">${esc(a)}</td><td class="arrow">→</td><td><b>${esc(b)}</b> ${ev(f)}</td></tr>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.title)} — 전략 한 장</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; } body { margin: 0; padding: 24px 28px; font-family: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #15181C; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.top { display: flex; justify-content: space-between; align-items: baseline; font-size: 10.5px; color: #6B7280; border-bottom: 1px solid #15181C; padding-bottom: 6px; }
h1 { font-size: 34px; line-height: 1.15; margin: 14px 0 4px; letter-spacing: -.01em; } h1 mark { background: #FFD200; padding: 0 6px; }
.line { font-size: 18px; font-weight: 700; margin: 0; } .principle { margin: 6px 0 0; color: #3F4650; font-size: 13px; }
h2 { font-size: 10.5px; letter-spacing: .1em; color: #6B7280; margin: 0 0 6px; font-weight: 700; }
.grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 22px; margin-top: 16px; }
.pillar { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; padding: 7px 0; border-top: 1px solid #D6DAE0; break-inside: avoid; }
.pillar .part { font-weight: 700; color: #6B7280; font-size: 11px; padding-top: 2px; } .pillar h3 { margin: 0; font-size: 14px; } .pillar p { margin: 1px 0 0; color: #3F4650; }
.pillar ul { margin: 3px 0 0; padding: 0; list-style: none; } .pillar li::before { content: '→ '; color: #9AA1AB; }
.ev { font-family: ui-monospace, Consolas, monospace; font-size: 9.5px; color: #8A919B; } .ins { font-size: 10.5px; color: #3F4650; } .ins::before { content: '◆ '; color: #E0B400; }
.phases { display: grid; gap: 0; border: 1px solid #15181C; margin-bottom: 14px; } .phases div { padding: 7px 9px; border-left: 1px solid #D6DAE0; } .phases div:first-child { border-left: 0; }
.phases b { font-size: 10.5px; display: block; } .phases p { margin: 2px 0 0; font-weight: 600; } .phases small { color: #8A919B; font-size: 9.5px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; } td { padding: 5px 0; border-top: 1px solid #D6DAE0; vertical-align: top; } td.from { color: #6B7280; width: 42%; } td.arrow { width: 18px; color: #9AA1AB; }
.cov { display: flex; gap: 18px; font-size: 11px; color: #3F4650; margin-top: 10px; } .cov b { font-size: 15px; color: #15181C; }
.gaps { margin: 0; padding-left: 16px; color: #3F4650; }
.foot { margin-top: 14px; border-top: 1px solid #15181C; padding-top: 6px; font-size: 9.5px; color: #6B7280; columns: 2; column-gap: 22px; } .foot p { margin: 0 0 2px; break-inside: avoid; } .foot b { font-family: ui-monospace, Consolas, monospace; color: #15181C; }
.note { font-size: 9.5px; color: #8A919B; margin-top: 8px; }
</style></head><body>
<div class="top"><span>${esc(project.title)}</span><span>THE FROM BRAIN · ${esc((run.at || '').slice(0, 10))} · AI의 판단은 예비 판정입니다</span></div>
<h1><mark>${esc(st.concept.name)}</mark></h1>
<p class="line">${esc(st.concept.line)}</p>${st.principle ? `<p class="principle">${esc(st.principle)}</p>` : ''}
<div class="cov"><span><b>${cv.facts.used}</b>/${cv.facts.total} 팩트</span><span><b>${cv.signals.used}</b>/${cv.signals.total} 판단 (새로 끌어온 것 ${cv.signals.fresh})</span><span><b>${cv.nodes.used}</b>/${cv.nodes.total} 노드</span></div>
<div class="grid">
<section><h2>축</h2>
${st.pillars.map((p) => `<div class="pillar"><span class="part">${esc(p.label || '축')}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.guide)}</p>${p.moves.length ? `<ul>${p.moves.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}<div>${ev(p.facts)} ${p.insights.map((id) => `<span class="ins">${esc(short(id))}</span>`).join(' ')}</div></div></div>`).join('\n')}
</section>
<section>
${st.phases.length ? `<h2>흐름</h2><div class="phases" style="grid-template-columns: repeat(${st.phases.length}, minmax(0, 1fr))">${st.phases.map((ph) => `<div><b>${esc(ph.when)}</b><p>${esc(ph.line)}</p><small>${esc(ph.pillars.map(partName).filter(Boolean).join(' · '))}</small></div>`).join('')}</div>` : ''}
${st.fixes.length ? `<h2>푸는 것</h2><table>${st.fixes.map((x) => pair(x.pain, x.answer, x.facts)).join('')}</table>` : ''}
${st.boosts.length ? `<h2>키우는 것</h2><table>${st.boosts.map((x) => pair(x.strength, x.answer, x.facts)).join('')}</table>` : ''}
${st.gaps.length ? `<h2>확인할 것</h2><ul class="gaps">${st.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
</section></div>
<div class="foot">${usedFacts.map((id) => `<p><b>${esc(id)}</b> ${esc(facts.get(id).text)} <i>(${esc(facts.get(id).source)})</i></p>`).join('')}</div>
<p class="note">근거 번호(#F)는 팩트북의 번호입니다. 사람이 확인하지 않은 팩트는 제출 전에 원문을 대조합니다.</p>
</body></html>`;
}
