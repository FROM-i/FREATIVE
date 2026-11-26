// 보고서(.md) — 두괄식. 결론(통합 인사이트)이 먼저, 근거(사슬·판단)는 뒤에.
import { cellItems } from './course.js';
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
    if (st.v >= 2) {
      const d = st.direction; const v3 = st.v >= 3; const area = (id) => (st.areas || []).find((a) => a.id === id)?.name || id;
      L.push('## 전략 한 장', '', '### 1. 방향', '', `**${d.name}** — ${d.line}`, '', `기준: ${d.standard}`, '');
      if (d.lenses?.length) L.push(`근거 노드: ${d.lenses.map(lensName).join(' · ')}`, d.spine ? `푼 충돌: ${lensName(d.spine.a)} ↔ ${lensName(d.spine.b)}${d.how ? ` — ${d.how}` : ''}` : d.proposal && d.how ? `도출 논리: ${d.how}` : '', d.swap ? `차별성 근거: ${d.swap}` : '', '');
      if (d.covers?.length) L.push(...d.covers.map((c) => `- ${area(c.area)}: ${c.line}`), '');
      L.push(d.from || d.to ? `지금 ${d.from} → 바뀌는 것 ${d.to}` : '', d.keeps ? `강화 요소: ${d.keeps}` : '', d.drops.length ? `제외 범위: ${d.drops.join(' / ')}` : '', '');
      if (st.rivals?.length) {
        L.push(st.v >= 6 ? `방향안 ${st.rivals.length}개 — 추천안 기준으로 영역별 전략과 전술을 작성했다:` : '경쟁 방향안:', '');
        for (const id of st.judge.order) { const r = st.rivals.find((x) => x.id === id); const it = st.judge.items.find((x) => x.id === id); L.push(id === 'BASE' ? `- 기본 방향 — ${st.base?.line || ''}` : `- ${id}${id === d.id ? (st.v >= 6 ? (st.picked ? ' (선택안)' : ' (추천안)') : ' (채택)') : ''} ${r.name} — ${r.line}${r.proposal ? ` · 가설 ${r.proposal.readings}개 · 뒷받침 근거 ${r.proposal.evidence}개` : ''}${it?.level && it.level !== '방향' ? ` [${it.level}으로 판정]` : it?.own === '범용' ? ' [범용 문장으로 판정]' : ''}${it?.weak ? ` · 약점: ${it.weak}` : ''}`); }
        if (st.judge.why) L.push('', `선정 사유: ${st.judge.why}`);
        L.push('');
      }
      if (!st.check.ok) L.push(`> 확인 필요: ${st.check.problems.join(' / ')}`, '');
      const hi = run.course;
      if (hi?.signals?.length && st.v >= 6) { const n = st.net || {}; const reads = hi.signals.filter((x) => x.type === '해석').sort((a, b) => b.act - a.act);
        L.push(`분석 포인트 ${hi.signals.length}개를 종합 검증했다 — 뒷받침 ${n.support ?? 0}건 · 상충 ${n.contradict ?? 0}건 · 채택 ${hi.signals.filter((x) => x.act > 0).length}개 · 기각 ${hi.signals.filter((x) => x.act <= 0).length}개.`, '', '핵심 가설(과제를 무엇으로 볼 것인가) — 근거 강도 순:', '', ...reads.slice(0, 12).map((x) => `- ${d.signals.includes(x.id) ? '**' : ''}${lensName(x.lens)}${d.signals.includes(x.id) ? '**' : ''} (${x.act > 0 ? '+' : ''}${x.act.toFixed(2)}) — ${x.claim}`), ''); }
      else if (hi?.signals?.length && st.v >= 4 && hi.edges) { const hs = new Map(hi.signals.map((x) => [x.id, x])); L.push('과제 전체를 본 노드 판단(통합):', '', ...hi.signals.filter((x) => x.scope === 'ALL').map((x) => `- ${d.signals.includes(x.id) ? '**' : ''}${lensName(x.lens)}${d.signals.includes(x.id) ? '**' : ''} — ${x.claim}`), '', '통합 판단 사이의 충돌:', '', ...hi.edges.filter((e) => e.type === 'tension').map((e) => `- ${lensName(hs.get(e.from).lens)} ↔ ${lensName(hs.get(e.to).lens)}: ${e.why}`), ''); }
      if (v3) L.push('### 2. 영역별 전략', '', ...st.pillars.map((p) => `- **${p.label} · ${p.name}** — ${p.guide}${p.facts.length ? ` [${p.facts.join(' ')}]` : ''}${p.thin ? ' (근거 부족)' : ''}`), '');
      else L.push('### 2. 축과 단계', '', ...st.axes.map((a) => `- **${a.id} ${a.name}** — ${a.rule}${a.facts.length ? ` [${a.facts.join(' ')}]` : ''}`), '');
      L.push(`### 3. ${v3 ? '전술 — 영역 × 단계' : '파트별 × 단계별 할 일'}`, '', ...st.phases.map((p) => `- **${p.when}** — ${p.line}`), '',
        `| ${v3 ? '영역' : '파트'} | ${st.phases.map((p) => p.when).join(' | ')} |`, `| --- | ${st.phases.map(() => '---').join(' | ')} |`,
        ...st.pillars.map((p) => `| **${p.label || p.name}** | ${st.phases.map((ph) => cellItems(st, p, ph).map((x) => `${x.insight ? '◆' : ''}${x.move}${x.parts?.length ? ` (${x.parts.map((c) => categoryById(c)?.name).filter(Boolean).join('·')})` : ''}${x.lenses?.length ? ` ← ${x.lenses.map(lensName).join('·')}` : ''}`).join('<br>')).join(' | ')} |`), '');
      const off = st.insights.filter((x) => x.fit !== '맞음');
      if (off.length) L.push(`방향에 맞지 않아 놓지 않은 인사이트: ${off.map((x) => `${x.id} ${x.name}`).join(', ')}`, '');
    } else {
      L.push('## 전략 한 장', '', `**${st.concept.name}** — ${st.concept.line}`, st.principle ? `\n${st.principle}` : '', '');
      st.pillars.forEach((p) => L.push(`- **${p.label || '축'} · ${p.name}** — ${p.guide}${p.moves.length ? ` (${p.moves.join(' / ')})` : ''}${p.facts.length ? ` [${p.facts.join(' ')}]` : ''}`));
      L.push('');
    }
    L.push(`팩트 ${st.coverage.facts.used}/${st.coverage.facts.total}건, 판단 ${st.coverage.signals.used}/${st.coverage.signals.total}건(인사이트에 쓰이지 않던 것 ${st.coverage.signals.fresh}건)을 썼다.`, '');
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
    if (d.conflicts.length) L.push('### 관점이 상충하는 지점', '', ...d.conflicts.map((c) => `- ${c.between.map(name).join(' ↔ ')}: ${c.what} → ${c.resolve}`), '');
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
    L.push('## 경쟁 기록', '', `후보 ${c.candidates}개(노드의 완성안 ${c.node} · 그룹 통합안 ${c.cluster} · 충돌 교배 ${c.cross}). 사유가 있어 탈락 ${c.screened}개, 나머지는 점수 없이 ${c.duels}회 비교 평가했다. 결선에서 판정이 엇갈린 비교 ${c.splits}건. 기본안에 없는 해법인데 탈락한 후보 ${c.different}개. 보완안이 채택된 경우 ${c.revised}건.`, '');
    if (c.groups != null) L.push(`결선 ${c.finalists}개를 재검토한 결과 서로 다른 해법은 ${c.groups}개였다. 중복 해법으로 제외된 안 ${c.merged}개, 예비에서 승격된 안 ${c.reserve}개.`, '');
    if (run.scope?.gap) L.push(`근본 이슈가 덮지 못하는 것: ${run.scope.gap}`, '');
    if (run.frames?.length) L.push('다시 정의한 문제', ...run.frames.map((f) => `- ${f.id} ${f.frame}${f.success ? ' [성공 기준을 겨눔]' : ''} — ${f.why}`), '');
    L.push('| 후보 | 출처 | 기본안 대조 | 해법 그룹 | 결선 자리 | 조별 승 | 결선 승 | 결과 | 제목 |', '|---|---|---|---|---|---|---|---|---|', ...[...run.arena.candidates].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99) || (y.swiss ?? -1) - (x.swiss ?? -1)).map((k) => `| ${k.id} | ${k.from} | ${k.screen?.verdict || '-'} | ${k.family || '-'} | ${k.seat || '-'} | ${k.swiss ?? '-'} | ${k.wins ?? '-'} | ${k.status}${k.contested ? ' · 판정 갈림' : ''} | ${k.title} |`), '');
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
    if (n.stance?.bet) L.push(`- 기조: ${n.stance.bet}${n.stance.givesUp ? ` (포기한 것: ${n.stance.givesUp})` : ''}${n.kept ? ` — 고친 뒤 ${n.kept}` : ''}`, ...(n.costs || []).map((x) => `  - 감수한 대가: ${x.note}`), ...(n.refused || []).map((x) => `  - 수용하지 않은 반론: ${x.hit} — ${x.note}`));
    if (n.from) { const v = n.from; const ans = (o) => Object.entries(o).filter(([k, x]) => !['level', 'confidence'].includes(k) && x).map(([, x]) => x).join(' '); L.push(`- 더프롬 판정: ${v.verdict}${v.push ? ` — 더 밀 곳: ${v.push}` : ''}`, `- 차별화: ${v.differentiation.level || '판단 보류'} — ${ans(v.differentiation)}`, `- 실효성: ${v.effectiveness.level || '판단 보류'} (${v.effectiveness.confidence}) — ${ans(v.effectiveness)}`, `- 확인 항목: ${v.checks.map((c) => `${c.item} ${c.result}`).join(' · ')}`, ...(v.held.length ? [`- 판단을 미룬 것: ${v.held.join(' / ')}`] : [])); }
    if (n.attacks?.length) L.push(`- 제기된 반론 ${n.attacks.length}건: ${n.attacks.map((x) => `[${x.from}] ${x.hit}`).join(' / ')}`, ...(n.fixed?.length ? [`- 보완 내용: ${n.fixed.map((f) => f.fix).join(' / ')}`] : []));
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
  L.push('| 노드군 | 도출 판단 | 인사이트에 쓰인 판단 |', '|---|---|---|');
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
  if (st.v >= 2) return courseHtml(project);
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
* { box-sizing: border-box; } body { margin: 0; padding: 24px 28px; font-family: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #15181C; font-size: 12px; font-weight: 300; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; } b, strong, th, h2, h3 { font-weight: 500; } h1 { font-weight: 200; letter-spacing: -.01em; }
.top { display: flex; justify-content: space-between; align-items: baseline; font-size: 10.5px; color: #6B7280; border-bottom: 1px solid #15181C; padding-bottom: 6px; }
h1 { font-size: 34px; line-height: 1.15; margin: 14px 0 4px; letter-spacing: -.01em; } h1 mark { background: #FFD200; padding: 0 6px; }
.line { font-size: 18px; font-weight: 500; margin: 0; } .principle { margin: 6px 0 0; color: #3F4650; font-size: 13px; }
h2 { font-size: 10.5px; letter-spacing: .1em; color: #6B7280; margin: 0 0 6px; font-weight: 500; }
.grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 22px; margin-top: 16px; }
.pillar { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; padding: 7px 0; border-top: 1px solid #D6DAE0; break-inside: avoid; }
.pillar .part { font-weight: 500; color: #6B7280; font-size: 11px; padding-top: 2px; } .pillar h3 { margin: 0; font-size: 14px; } .pillar p { margin: 1px 0 0; color: #3F4650; }
.pillar ul { margin: 3px 0 0; padding: 0; list-style: none; } .pillar li::before { content: '→ '; color: #9AA1AB; }
.ev { font-family: ui-monospace, Consolas, monospace; font-size: 9.5px; color: #8A919B; } .ins { font-size: 10.5px; color: #3F4650; } .ins::before { content: '◆ '; color: #E0B400; }
.phases { display: grid; gap: 0; border: 1px solid #15181C; margin-bottom: 14px; } .phases div { padding: 7px 9px; border-left: 1px solid #D6DAE0; } .phases div:first-child { border-left: 0; }
.phases b { font-size: 10.5px; display: block; } .phases p { margin: 2px 0 0; font-weight: 500; } .phases small { color: #8A919B; font-size: 9.5px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; } td { padding: 5px 0; border-top: 1px solid #D6DAE0; vertical-align: top; } td.from { color: #6B7280; width: 42%; } td.arrow { width: 18px; color: #9AA1AB; }
.cov { display: flex; gap: 18px; font-size: 11px; color: #3F4650; margin-top: 10px; } .cov b { font-size: 15px; color: #15181C; }
.gaps { margin: 0; padding-left: 16px; color: #3F4650; }
.foot { margin-top: 14px; border-top: 1px solid #15181C; padding-top: 6px; font-size: 9.5px; color: #6B7280; columns: 2; column-gap: 22px; } .foot p { margin: 0 0 2px; break-inside: avoid; } .foot b { font-family: ui-monospace, Consolas, monospace; color: #15181C; }
.note { font-size: 9.5px; color: #8A919B; margin-top: 8px; }
</style></head><body>
<div class="top"><span>${esc(project.title)}</span><span>THE FROM BRAIN · ${esc((run.at || '').slice(0, 10))} · AI의 판단은 예비 판정입니다</span></div>
<h1><mark>${esc(st.concept.name)}</mark></h1>
<p class="line">${esc(st.concept.line)}</p>${st.principle ? `<p class="principle">${esc(st.principle)}</p>` : ''}
<div class="cov"><span><b>${cv.facts.used}</b>/${cv.facts.total} 팩트</span><span><b>${cv.signals.used}</b>/${cv.signals.total} 판단 (추가 반영 ${cv.signals.fresh})</span><span><b>${cv.nodes.used}</b>/${cv.nodes.total} 노드</span></div>
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

// 한 장 보고서 — 위에서 아래로: 방향 → 영역별 전략 → 전술(영역 × 단계)
function courseHtml(project) {
  const run = project.run; const st = run.strategy; const d = st.direction; const cv = st.coverage; const v3 = st.v >= 3;
  const facts = new Map((project.facts || []).map((f) => [f.id, f]));
  const usedFacts = [...new Set([...d.facts, ...st.axes.flatMap((a) => a.facts), ...st.pillars.flatMap((p) => p.facts), ...st.fixes.flatMap((x) => x.facts), ...st.boosts.flatMap((x) => x.facts)])].filter((id) => facts.has(id)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const ev = (ids) => (ids.length ? `<span class="ev">${ids.map((id) => `#${esc(id)}`).join(' ')}</span>` : '');
  const pair = (a, b, f) => `<tr><td class="from">${esc(a)}</td><td class="arrow">→</td><td><b>${esc(b)}</b> ${ev(f)}</td></tr>`;
  const axisNo = (id) => st.axes.findIndex((a) => a.id === id) + 1;
  const area = (id) => (st.areas || []).find((a) => a.id === id)?.name || id;
  const rivalRow = (id) => {
    if (id === 'BASE') return st.base ? `<tr class="base"><td class="tag">기본</td><td>${esc(st.base.line || st.base.name)}</td><td class="why">대조안 — 노드 미적용</td></tr>` : '';
    const r = st.rivals.find((x) => x.id === id); const it = st.judge.items.find((x) => x.id === id) || {};
    return `<tr class="${id === d.id ? 'won' : ''}"><td class="tag">${id === d.id ? (st.v >= 6 ? (st.picked ? '선택안' : '추천안') : '채택') : it.level && it.level !== '방향' ? esc(it.level) : it.own === '범용' ? '범용' : st.v >= 6 ? '대안' : '후보'}</td><td><b>${esc(r.name)}</b> ${esc(r.line)}</td><td class="why">${r.proposal ? `가설 ${r.proposal.readings} · 근거 ${r.proposal.evidence}<br>` : ''}${esc(id === d.id ? st.judge.why : it.weak || '')}</td></tr>`;
  };
  const cell = (p, ph) => `<td>${cellItems(st, p, ph).map((x) => `<p class="tac${x.insight ? ' won' : ''}">${x.axis ? `<i class="ax">${axisNo(x.axis)}</i>` : ''}${esc(x.move)}${x.parts?.length ? ` <small>${esc(x.parts.map((c) => categoryById(c)?.name).filter(Boolean).join(' · '))}</small>` : ''}</p>`).join('')}</td>`;
  const off = st.insights.filter((x) => x.fit !== '맞음');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.title)} — 전략 한 장</title>
<style>
@page { size: A4 landscape; margin: 9mm; }
* { box-sizing: border-box; } body { margin: 0; padding: 22px 26px; font-family: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #15181C; font-size: 11.5px; font-weight: 300; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; } b, strong, th, h2, h3 { font-weight: 500; } h1 { font-weight: 200; letter-spacing: -.01em; }
.top { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; color: #6B7280; border-bottom: 1px solid #15181C; padding-bottom: 5px; }
.layer { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 14px; padding: 12px 0; border-bottom: 1px solid #15181C; break-inside: avoid; }
.layer > .no { font-size: 10px; letter-spacing: .04em; color: #6B7280; font-weight: 500; } .layer > .no b { display: block; font-size: 22px; color: #15181C; letter-spacing: 0; line-height: 1; margin-bottom: 3px; }
h1 { font-size: 30px; line-height: 1.15; margin: 0 0 4px; letter-spacing: -.01em; } h1 mark { background: #FFD200; padding: 0 6px; }
.line { font-size: 16px; font-weight: 500; margin: 0; } .standard { margin: 5px 0 0; color: #3F4650; font-size: 12.5px; }
.l1 { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 22px; }
.covers { margin: 9px 0 0; } .covers td:first-child { width: 30%; color: #6B7280; font-weight: 500; font-size: 10.5px; } .covers td { font-weight: 500; }
.shift { display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr); gap: 6px; align-items: start; margin-top: 9px; } .shift span { color: #6B7280; } .shift b { font-weight: 500; } .shift i { color: #9AA1AB; font-style: normal; }
.kv { margin: 5px 0 0; color: #3F4650; } .kv b { color: #6B7280; font-weight: 500; font-size: 10px; margin-right: 6px; }
h2 { font-size: 10px; letter-spacing: .1em; color: #6B7280; margin: 0 0 5px; font-weight: 500; }
table { width: 100%; border-collapse: collapse; } td, th { padding: 4px 6px 4px 0; border-top: 1px solid #D6DAE0; vertical-align: top; text-align: left; }
.rivals td.tag { width: 46px; font-size: 9.5px; font-weight: 500; color: #6B7280; } .rivals tr.won td.tag { color: #15181C; } .rivals tr.won td { background: #FFF6BF; } .rivals td.why { width: 38%; color: #6B7280; font-size: 10.5px; } .rivals tr.base td { color: #8A919B; }
.axes { display: grid; gap: 14px; } .axis { border-top: 2px solid #15181C; padding-top: 5px; } .axis small { display: block; font-size: 10px; font-weight: 500; color: #6B7280; } .axis h3 { margin: 0; font-size: 14px; } .axis p { margin: 2px 0 0; color: #3F4650; }
.ax { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center; border-radius: 50%; background: #15181C; color: #fff; font-size: 9px; font-style: normal; font-weight: 500; margin-right: 5px; vertical-align: 1px; }
.matrix th { font-size: 10.5px; border-top: 0; border-bottom: 1px solid #15181C; padding-bottom: 5px; } .matrix th small { display: block; font-weight: 400; color: #6B7280; font-size: 10px; }
.matrix td { padding: 6px 8px 6px 0; } .matrix td.part { width: 17%; } .matrix td.part b { display: block; font-size: 12.5px; } .matrix td.part span { color: #6B7280; font-size: 10.5px; }
.tac { margin: 0 0 3px; } .tac small { color: #8A919B; font-size: 9.5px; white-space: nowrap; } .tac.won { font-weight: 500; } .tac.won::before { content: '◆ '; color: #E0B400; }
.ev { font-family: ui-monospace, Consolas, monospace; font-size: 9px; color: #8A919B; }
.tail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; padding-top: 10px; } td.from { color: #6B7280; width: 44%; } td.arrow { width: 16px; color: #9AA1AB; } .gaps { margin: 0; padding-left: 15px; color: #3F4650; }
.cov { display: flex; gap: 16px; font-size: 10.5px; color: #3F4650; margin-top: 8px; } .cov b { font-size: 13px; color: #15181C; }
.warn { margin: 8px 0 0; padding: 5px 8px; background: #FFF1F0; color: #B42318; font-size: 10.5px; }
.foot { margin-top: 10px; border-top: 1px solid #15181C; padding-top: 5px; font-size: 8.5px; color: #6B7280; columns: 4; column-gap: 14px; } .foot p { margin: 0 0 1px; break-inside: avoid; } .foot b { font-family: ui-monospace, Consolas, monospace; color: #15181C; }
.note { font-size: 9px; color: #8A919B; margin-top: 6px; }
</style></head><body>
<div class="top"><span>${esc(project.title)}</span><span>THE FROM BRAIN · ${esc((run.at || '').slice(0, 10))} · AI의 판단은 예비 판정입니다</span></div>
<section class="layer"><div class="no"><b>1</b>방향</div><div class="l1">
<div><h1><mark>${esc(d.name)}</mark></h1><p class="line">${esc(d.line)}</p><p class="standard">${esc(d.standard)}</p>
${d.lenses?.length ? `<p class="kv"><b>근거 노드</b>${esc(d.lenses.map(lensName).join(' · '))}</p>` : ''}${d.spine ? `<p class="kv"><b>푼 충돌</b>${esc(`${lensName(d.spine.a)} ↔ ${lensName(d.spine.b)}${d.how ? ` — ${d.how}` : ''}`)}</p>` : d.proposal && d.how ? `<p class="kv"><b>도출 논리</b>${esc(d.how)}</p>` : ''}${d.swap ? `<p class="kv"><b>차별성 근거</b>${esc(d.swap)}</p>` : ''}
${d.covers?.length ? `<table class="covers">${d.covers.map((c) => `<tr><td>${esc(area(c.area))}</td><td>${esc(c.line)}</td></tr>`).join('')}</table>` : ''}
${d.from || d.to ? `<div class="shift"><span>${esc(d.from)}</span><i>→</i><b>${esc(d.to)}</b></div>` : ''}
${d.keeps ? `<p class="kv"><b>강화 요소</b>${esc(d.keeps)}</p>` : ''}${d.drops.length ? `<p class="kv"><b>제외 범위</b>${esc(d.drops.join(' · '))}</p>` : ''}
<div class="cov"><span><b>${cv.facts.used}</b>/${cv.facts.total} 팩트</span><span><b>${cv.signals.used}</b>/${cv.signals.total} 판단</span><span><b>${cv.nodes.used}</b>/${cv.nodes.total} 노드</span>${st.net ? `<span>분석 포인트 <b>${st.net.atoms}</b>개 종합 · 뒷받침 ${st.net.support} · 상충 ${st.net.contradict}</span>` : cv.high ? `<span>과제 전체를 본 노드 판단 <b>${cv.high.used}</b>/${cv.high.total} · 충돌 ${cv.high.tensions}</span>` : ''}${cv.tactics ? `<span>전술에 쓰인 노드 <b>${cv.tactics.lenses}</b>/${cv.tactics.lensTotal}</span>` : ''}</div></div>
<div>${st.rivals?.length ? `<h2>${st.v >= 6 ? `방향안 ${st.rivals.length}개와 기본 방향` : `경쟁 방향안 ${st.rivals.length}개와 기본 방향`}</h2><table class="rivals">${st.judge.order.map(rivalRow).join('')}</table>` : ''}
${st.check.ok ? '' : `<p class="warn">확인 필요 — ${esc(st.check.problems.join(' / '))}</p>`}</div>
</div></section>
${v3 ? `<section class="layer"><div class="no"><b>2</b>영역별 전략</div><div class="axes" style="grid-template-columns: repeat(${Math.max(1, st.pillars.length)}, minmax(0, 1fr))">
${st.pillars.map((p) => `<div class="axis"><small>${esc(p.label)}</small><h3>${esc(p.name)}</h3><p>${esc(p.guide)}</p>${ev(p.facts)}${p.thin ? ' <span class="ev">근거 부족</span>' : ''}</div>`).join('')}
</div></section>` : `<section class="layer"><div class="no"><b>2</b>축</div><div class="axes" style="grid-template-columns: repeat(${Math.max(1, st.axes.length)}, minmax(0, 1fr))">
${st.axes.map((a, i) => `<div class="axis"><h3><i class="ax">${i + 1}</i>${esc(a.name)}</h3><p>${esc(a.rule)}</p>${ev(a.facts)}</div>`).join('')}
</div></section>`}
<section class="layer"><div class="no"><b>3</b>${v3 ? '전술<br>영역 × 단계' : '파트 × 단계'}</div><div>
<table class="matrix"><thead><tr><th></th>${st.phases.map((ph) => `<th>${esc(ph.when)}<small>${esc(ph.line)}</small></th>`).join('')}</tr></thead><tbody>
${st.pillars.map((p) => `<tr><td class="part"><b>${esc(p.label || p.name)}</b><span>${esc(v3 ? p.name : p.guide)}</span></td>${st.phases.map((ph) => cell(p, ph)).join('')}</tr>`).join('\n')}
</tbody></table>
${off.length ? `<p class="note">방향에 맞지 않아 놓지 않은 인사이트: ${esc(off.map((x) => x.name || x.id).join(', '))}</p>` : ''}
</div></section>
<div class="tail">
<div>${st.fixes.length ? `<h2>푸는 것</h2><table>${st.fixes.map((x) => pair(x.pain, x.answer, x.facts)).join('')}</table>` : ''}</div>
<div>${st.boosts.length ? `<h2>키우는 것</h2><table>${st.boosts.map((x) => pair(x.strength, x.answer, x.facts)).join('')}</table>` : ''}</div>
<div>${st.gaps.length ? `<h2>확인할 것</h2><ul class="gaps">${st.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>
</div>
<div class="foot">${usedFacts.map((id) => { const t = String(facts.get(id).text || ''); return `<p><b>${esc(id)}</b> ${esc(t.length > 58 ? `${t.slice(0, 56)}…` : t)}</p>`; }).join('')}</div>
<p class="note">◆는 경쟁 평가에서 채택된 인사이트를 전술로 배치한 자리입니다. 팩트의 전문과 출처는 팩트북과 전체 기록(.md)에 있습니다.${v3 ? ' 전술 뒤의 작은 글씨는 맡는 파트입니다.' : ' 동그라미 숫자는 그 할 일이 따르는 축입니다.'} 근거 번호(#F)는 팩트북의 번호이며, 사람이 확인하지 않은 팩트는 제출 전에 원문을 대조합니다.</p>
</body></html>`;
}
