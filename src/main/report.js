'use strict';
const POPK = { 카테고리: '기본 조건', 경쟁: '경쟁 대응', 상관: '약점 보완' };
/** 결과를 .md 보고서와 브리프 .md(thefrom-ux 브리프 양식 호환)로 내보낸다. */
const fs = require('fs');
const path = require('path');
const store = require('./services/storage');
const { formatBrief } = require('./orchestrator');

const list = (arr, f = (x) => x) => (arr || []).map((x) => `- ${f(x)}`).join('\n');
const facts = require('./facts');
const table = (head, rows) => rows && rows.length
  ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')}`
  : '';

/** 맨 앞 한눈에 — 근본 이슈 · 컨셉 · 코어 PoD · 기본안에 없는 것 · 핵심 장면 (모델 호출 없이 결과에서) */
function atAGlance(p) {
  const r = (p.run && p.run.results) || {};
  const root = p.run && p.run.root;
  const c = r.concept, f = r.forpop, cr = r.creative, bp = cr && cr.blueprint;
  if (!c && !bp) return '';
  const lines = ['\n## 한눈에'];
  if (root && root.issue) lines.push(`- **근본 이슈**: ${root.issue}`);
  if (c) lines.push(`- **컨셉**: ${c.theme || ''} — ${c.concept || ''}`);
  if (f && f.core_pod && f.core_pod.item) lines.push(`- **코어 PoD**: ${f.core_pod.item}`);
  if (bp && bp.baseline_gap && (bp.baseline_gap.new || []).length) lines.push(`- **기본안에 없는 것**: ${bp.baseline_gap.new.slice(0, 3).join(' / ')}`);
  if (cr && cr.language && cr.language.thesis) lines.push(`- **설계론**: ${cr.language.thesis}`);
  if (cr && (cr.contents || []).length) lines.push(`- **콘텐츠**: ${cr.contents.map((x) => x.title).join(' · ')}`);
  if (cr && (cr.examples || []).length) lines.push(`- **핵심 장면**: ${cr.examples.map((e) => e.title).join(' · ')}`);
  const vp = verifyItems(p);
  if (vp.length) lines.push(`- **검증할 것**: ${vp.length}가지 (맨 끝 검증 계획)`);
  return lines.join('\n');
}

/** 검증 계획 — 단계마다 흩어진 '확인 필요'·보완점·정할 값·발주처 질문을 한 곳에, 겹치지 않게 */
function verifyItems(p) {
  const r = (p.run && p.run.results) || {};
  const bp = r.creative && r.creative.blueprint;
  const items = [];
  for (const x of (p.run && p.run.verifyPlan) || []) items.push({ what: x.what, how: x.how, pass: x.pass, kind: '현장·도면' });
  for (const x of (bp && bp.ledger && bp.ledger.to_measure) || []) items.push({ what: x.what, how: x.how, pass: x.pass, kind: '정할 값' });
  for (const q of (bp && bp.open_questions) || []) items.push({ what: q, how: '발주처 확인', pass: '', kind: '발주처' });
  for (const t of (r.creative && r.creative.human_todo) || []) items.push({ what: t, how: '', pass: '', kind: '사람' });
  for (const x of (r.forpop && r.forpop.compare && r.forpop.compare.fixes) || []) if (x) items.push({ what: x, how: '', pass: '', kind: '차별성' });
  return facts.dedupe(items.map((x) => ({ ...x, what: facts.stripBoiler(String(x.what || '')) })), { key: (x) => x.what, threshold: 0.5, max: 24 });
}
function verifyPlan(p) {
  const items = verifyItems(p);
  if (!items.length) return '';
  return '\n## 11. 검증 계획 — 다음에 할 일\n' + table(['구분', '무엇을', '어떻게', '통과 기준'], items.map((x) => [x.kind, x.what, x.how || '', x.pass || '']));
}

function build(p) {
  const r = (p.run && p.run.results) || {};
  const out = [];
  out.push(`# ${p.name} — THE FROM FREATIVE`);
  out.push(`> 생성 ${new Date().toLocaleString('ko-KR')} · 작업자 ${(p.brief && p.brief.worker) || p.ownerName || ''} · 지식 v${p.run ? p.run.knowledge : '-'} · 모델 ${p.run ? Object.values(p.run.models || {}).join(' / ') : ''}`);
  out.push('> 이 보고서의 판정은 모두 **예비 판정**입니다 — 본문에서는 다시 적지 않습니다. C 게이트·완성도의 최종 판정은 사람이 합니다. 아직 확인하지 못한 것은 책임을 미루는 문구가 아니라, 맨 끝 **검증 계획**에 할 일로 한 번씩 모았습니다.');
  const glance = atAGlance(p);
  if (glance) out.push(glance);
  out.push('\n## 0. 접수 브리프\n' + formatBrief(p.brief));
  if (r.brief) {
    const b = r.brief;
    out.push(`\n## 1. 미션 — 브리프 게이트: ${b.gate}\n${b.gate_reason || ''}\n`);
    out.push(table(['항목', '내용'], Object.entries(b.mission || {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])));
    if (b.assumptions && b.assumptions.length) out.push('\n**가정**\n' + list(b.assumptions, (a) => `${a.item} — ${a.basis}`));
    if ((b.scope || []).length) out.push('\n**사업 범위**\n' + table(['ID', '범위', '종류', '출처'], b.scope.map((x) => [x.id, x.item + (x.must ? '' : ' (선택)'), x.kind || '', x.from || ''])));
  }
  {
    const ri = r.brief && r.brief.root_issue;
    const root = (p.run && p.run.root) || (ri && (ri.candidates || []).find((c) => c.id === ri.recommended));
    if (root) out.push(`\n**근본 이슈 — 모든 결과를 여기에 대입한다** (${p.run && p.run.root && p.run.root.confirmed ? '사람이 확정' : '화가 추천 · 미확정'})\n\n> ${root.issue}\n\n- 과업: ${(ri && ri.task) || ''}\n- 목적: ${(ri && ri.purpose) || ''}\n- 판정 질문: ${root.test || ''}`);
  }
  if (r.baseline) {
    const bl = r.baseline;
    out.push(`\n**기본안 — 이 정도는 아무나 낸다** (판단 브레인)\n\n${bl.overall || ''}\n\n- 뻔한 형태·표현: ${(bl.cliches || []).join(' · ')}\n- 넘어야 할 기준: ${(bl.bar || []).join(' · ')}`);
  }
  if (r.canvas) {
    const c = r.canvas;
    out.push(`\n## 2. 캔버스 — S0 정의\n**컨셉 초안**: ${c.concept_draft}\n\n**긴장**: ${c.tension}\n\n**지킬 관성**\n${list(c.inertia)}`);
    if (c.oppositions) out.push('\n**반대 대상**\n' + list(c.oppositions, (o) => `\`${o.layer}\` · ${o.norm} → ${o.violation} · ${o.strength} — 실례: ${o.evidence}`));
  }
  if (r.airplane) {
    const a = r.airplane;
    out.push('\n## 3. Airplane — 사조 여행');
    out.push(table(['사조', '가져올 것', '두고 올 것', '코어', 'A3'], (a.travels || []).filter((t) => !t.error).map((t) => [`${t.name} (${t.id})`, (t.take || []).join(' / '), (t.leave || []).join(' / '), t.core, t.a3 && t.a3.pass ? '통과' : '확인'])));
    if (a.synth) out.push(`\n**하이브리드**: ${a.synth.hybrid}${a.synth.split && a.synth.split.structure ? `\n\n**대립을 나눈 방법** — 구조: ${a.synth.split.structure} · 해석: ${a.synth.split.interpretation}${a.synth.split.how ? ` — ${a.synth.split.how}` : ''}` : ''}${a.synth.risk ? `\n\n**위험**: ${a.synth.risk}` : ''}\n\n**여행 가방**\n${list(a.synth.suitcase)}`);
    const ac = (a.synth && a.synth.aesthetic_candidates) || [];
    if (ac.length) out.push(`\n**미감 후보** (가져올지는 FoR · PoP · PoD에서 정한다)\n` + list(ac, (x) => `${x.by || ''} · ${x.what}${x.could_serve ? ` — ${x.could_serve}` : ''}`));
    const tr = (a.synth && a.synth.treatments || []).length ? a.synth.treatments : (a.travels || []).filter((t) => !t.error).flatMap((t) => (t.treatments || []).map((x) => ({ ...x, by: t.id })));
    if (tr.length) out.push('\n**기존의 것을 어떻게 다루는가**\n' + table(['기존 요소', '사조', '다루는 방식', '무엇이 되나'], tr.map((x) => [x.existing, x.by || '', `${x.treat || ''}${x.principle ? ` — ${x.principle}` : ''}`, x.becomes || ''])));
    const ov = (a.overlap || []).filter((x) => x.ratio >= 0.4);
    if (ov.length) out.push(`\n_사조끼리 조작이 겹침: ${ov.map((x) => `${x.id} ${Math.round(x.ratio * 100)}%`).join(' · ')} — 같은 재료를 같은 방식으로 다뤘다._`);
  }
  if (r.tunnel) {
    const t = r.tunnel;
    out.push('\n## 4. Tunnel — 레이어링');
    for (const l of (t.layers || []).filter((x) => !x.error)) {
      // 레이어마다 지킬 것·바꿀 것을 다시 적지 않는다 — 종합에 한 번
      out.push(`\n### ${l.label} — ${l.headline}\n${list(l.insights, (i) => `**${i.title}** ${i.detail} _(${i.source})_`)}${l.boundary ? `\n- 경계: ${l.boundary}` : ''}`);
    }
    if (t.synth) out.push(`\n**좁혀진 범위**: ${t.synth.narrowed}\n\n**출구의 빛**: ${t.synth.exit_light}${(t.synth.keep || []).length ? `\n\n- 지킬 것: ${[].concat(t.synth.keep).join(' · ')}` : ''}${(t.synth.change || []).length ? `\n- 바꿀 것: ${[].concat(t.synth.change).join(' · ')}` : ''}`);
  }
  if (r.think && (r.think.rounds || []).length) {
    const T = r.think;
    const ANS = { question: '이 질문으로 가자', half: '반만', other: '다른 방향', deeper: '더 깊이', wider: '더 넓게', twist: '비틀어', done: '지금 안으로 가자' };
    out.push('\n## 4.5 생각의 회차 — 중간 리뷰 기록');
    if (T.final) out.push(`\n**회차의 결론**: ${T.final.idea}${T.final.root_change ? `\n\n근본 이슈에서 — ${T.final.root_change}` : ''}`);
    for (const rd of T.rounds) {
      const c = rd.card || {};
      out.push(`\n### 회차 ${rd.n} — ${rd.answer ? ANS[rd.answer.choice] || rd.answer.choice : '답 없음 (화가 제안대로)'}${rd.answer && rd.answer.text ? ` · ${rd.answer.text}` : ''}\n- **지금 안**: ${c.now || ''}\n- **걸리는 것**: ${c.snag || ''}\n- **찌르는 질문**: ${c.question || ''}${c.type ? ` _(${c.type} → ${c.leads_to || ''})_` : ''}\n- **넣으면**: ${c.if_yes || ''}`);
      const mv = ((rd.painter || {}).moves || []);
      if (mv.length) out.push(table(['수', '어떻게', '결과', '근본 이슈에 넣으면', ''], mv.map((m) => [m.move, m.how || '', m.result || '', m.substitute && m.substitute.changes ? `${m.substitute.who || ''} — ${m.substitute.changes}` : '대입 없음', m.keep ? '' : '버림'])));
    }
  }
  if (r.positioning) {
    const p2 = r.positioning;
    out.push(`\n## 5. Creative Positioning Map\n- X축: ${p2.axes.x.low} ↔ ${p2.axes.x.high} (${p2.axes.x.name})\n- Y축: ${p2.axes.y.low} ↔ ${p2.axes.y.high} (${p2.axes.y.name})\n- 빈자리: **${p2.whitespace.label}** — ${p2.whitespace.why}`);
    out.push(table(['ID', '영역', '설명'], (p2.territories || []).map((t) => [t.id, t.name, t.desc])));
    out.push('\n**좁히기**\n' + list(p2.rounds, (x) => `${x.from} → ${x.to}: ${[].concat(x.cut).join(', ')} 제외 — ${x.criterion} · ${x.reason}`));
    out.push(`\n**선택**: ${p2.final.id} — ${p2.final.reason}`);
  }
  if (r.forpop) {
    const f = r.forpop;
    out.push('\n## 6. FoR · PoP · PoD — 최종 검증 · 발상의 전환');
    out.push('\n**앞선 단계 최종 검증**\n' + table(['단계', '핵심', '판정', '이유', '연결'], (f.audit || []).map((x) => [x.stage, x.core, x.verdict, x.note, x.link])));
    out.push(`\n연결성 — ${f.coherence || ''}`);
    const F = f.for || {};
    if (F.target_view) out.push(`\n**타겟이 빗대어 보는 것**: ${F.target_view}`);
    if ((F.options || []).length) out.push('\n**FoR — 네 방식**\n' + table(['방식', '틀', '경쟁 구도', '얻는 것', '치르는 것'], F.options.map((o) => [o.kind + (o.kind === F.chosen ? ' ●' : ''), o.frame, (o.competitors || []).join(', '), o.gain, o.cost])));
    out.push(`\n**FoR**: ${F.frame || ''}${F.why ? ` — ${F.why}` : ''}\n\n**PoP — 최소한 무조건 갖춰야 하는 것**\n${list(f.pop, (x) => `${x.kind ? `[${POPK[x.kind] || x.kind}] ` : ''}${x.item} — ${x.why}`)}\n\n**PoD 후보 5** (원하는가 · 보여줄 수 있는가 · 우리만의 것인가)\n${list(f.pod_candidates, (x) => `${x.id} ${x.item} — ${x.gain} (${[x.desirable, x.deliverable, x.defensible].map((v) => v ?? '-').join(' · ')})`)}`);
    const sc = (f.scan && f.scan.scopes) || [];
    const seen = sc.filter((x) => (x.players || []).length || (x.conventions || []).length || (x.taken || []).length);
    if (sc.length && !seen.length) out.push(`\n**웹 정찰** — 확인한 사례 없음${sc.some((x) => x.error) ? ` (실패: ${sc.find((x) => x.error).error.slice(0, 80)})` : ''}. 차별성은 판정하지 않았다.`);
    if (seen.length) {
      out.push('\n**웹 정찰 — 세 범위** (조수)');
      seen.forEach((x) => {
        out.push(`\n*${x.title}* — ${x.summary || ''}`);
        if ((x.players || []).length) out.push(list(x.players, (pl) => `${pl.name} — ${pl.what}${pl.url ? ` ([출처](${pl.url}))` : ''}`));
        if ((x.taken || []).length) out.push('이미 점유: ' + x.taken.map((t) => `${t.item}${t.pod ? `(${t.pod})` : ''}`).join(' · '));
        if ((x.citations || []).length) out.push('근거: ' + x.citations.slice(0, 8).map((c) => `[${c.title || c.url}](${c.url})`).join(' · '));
      });
    }
    (f.shifts || []).forEach((sh, i) => {
      const s2 = sh.shift || {};
      out.push(`\n**발상의 전환 ${i + 1} · ${s2.type || ''} ${s2.name || ''}** (판단 브레인)\n- 질문: ${s2.question || ''}\n- ${s2.from || ''} → ${s2.to || ''}\n- 추론: ${s2.reasoning || ''}`);
      if (sh.result) out.push(list(sh.result, (x) => `${x.id} ${x.item} ← ${(x.from_ids || []).join('+')}`));
    });
    out.push(`\n**코어 PoD**: ${(f.core_pod || {}).item || ''}\n\n> ${(f.core_pod || {}).statement || ''}\n\n**RTB**\n${list(f.rtb, (x) => `${x.fact} (${x.source})`)}`);
    const cmp = f.compare;
    if (cmp) {
      const axes = (cmp.legend && cmp.legend.axes) || [];
      const scored = (cmp.scopes || []).filter((x) => (x.series || []).length);
      if (axes.length && scored.length) {
        out.push(`\n**차별성 판정 — 공통 범례 (${axes.length === 5 ? '오각형' : '삼각형'} · 0~5)**\n` + list(axes, (a) => `${a.id} ${a.name}${a.from_us ? ' (나로부터)' : ''} — 0 ${a.low} → 5 ${a.high}`));
        const rows = [];
        (cmp.scopes || []).forEach((x) => (x.series || []).forEach((se) => rows.push([x.title, se.name + (se.kind === 'us' ? ' ●' : ''), ...se.values.map(String), x.verdict || ''])));
        out.push(table(['범위', '계열', ...axes.map((a) => a.id), '판정'], rows));
      }
      scored.forEach((x) => out.push(`\n*${x.title} · ${x.verdict || ''}* — ${x.note || ''}\n- 유사성: ${(x.similar || []).map((y) => y.item).join(' · ')}\n- 차별점: ${(x.different || []).map((y) => y.item).join(' · ')}`));
      const AD = cmp.aesthetic_decision;
      if (AD) out.push(`\n**사조의 미감 — ${AD.need ? '가져온다' : '가져오지 않는다'}**: ${AD.why || ''}${(AD.picks || []).length ? '\n' + list(AD.picks, (x) => `${x.by || ''} · ${x.what} → ${x.for_pod || ''} (변형: ${x.transform || ''} · 범위: ${x.limit || ''})`) : ''}`);
      if (cmp.positioning) out.push(`\n**포지셔닝 진술문**\n\n> ${cmp.positioning.sentence || ''}`);
      // 보완할 것은 맨 끝 '검증 계획'에 한 번만 모은다
    }
  }
  if (r.concept) {
    const c = r.concept;
    out.push('\n## 7. Concept · Theme — 5 → 3 → 1');
    out.push(table(['안', '테마', '컨셉', '1차'], (c.proposals || []).map((x) => [x.id + (x.id === c.final_id ? ' ●' : ''), x.theme, x.concept, (c.first_round && (c.first_round.picked || []).includes(x.id)) ? '○' : ''])));
    if (c.brain_select) out.push(`\n**브레인 검증 → 최종 ${c.brain_select.final.id}**: ${c.brain_select.final.why}`);
    out.push(`\n**Concept**: ${c.concept || ''}\n\n**Theme**: ${c.theme || ''}\n\n**키워드**: ${(c.keywords || []).join(' · ')}`);
    out.push('\n**철학의 코어**\n' + list(c.philosophy_core, (x) => `${x.lens} — ${x.how}`));
    const tm = c.tone_manner || {};
    out.push(table(['축', '내용', 'ID'], ['color', 'mood', 'visual_style', 'typography'].filter((k) => tm[k]).map((k) => [k, tm[k].desc, (tm[k].ids || []).join(', ')])));
    out.push('\n**해석표**\n' + table(['접점', '지킬 것', '바꿀 것', '사람이 얻는 것'], (c.interpretation || []).map((x) => [x.touchpoint, x.keep, x.change, x.gain])));
    out.push('\n**효익 시각화**\n' + table(['접점', '과업', '보이게 할 것', '형식', '효익 지표'], (c.benefit || []).map((x) => [x.touchpoint, x.task, x.visible, x.format, x.metric])));
    const g = p.run.gates.C.history;
    out.push('\n**C 게이트 기록**\n' + (g.length ? list(g, (h) => `${h.at.slice(0, 16)} · ${h.decision}${h.preliminary ? ' (예비)' : ''} — ${h.note}`) : '- 판정 대기'));
  }
  if (r.creative) {
    const c = r.creative;
    const bp = c.blueprint;
    if (bp) {
      out.push(`\n## 8. 설계 — 하나에서 펼친다\n\n> ${bp.summary || ''}`);
      if (bp.baseline_gap) out.push(`\n**기본안과 같은 것**\n${list(bp.baseline_gap.same)}\n\n**기본안에 없는 것**\n${list(bp.baseline_gap.new)}`);
      const fl = bp.form_language || {};
      out.push('\n**조형 언어 — 사조 원리가 무엇이 되었나**\n' + table(['근거', '원리', '무엇이 되었나'], (fl.principles || []).map((x) => [x.from, x.principle, x.becomes])));
      if ((fl.departures || []).length) out.push('\n**일반 유형을 어떻게 다뤘나**\n' + table(['일반 유형', '처리', '무엇이 되나', '지키는 것'], fl.departures.map((x) => [x.typology, x.by, x.becomes, x.keep || ''])));
      out.push(table(['항목', '내용'], [['형태·비례', fl.shape], ['재료·마감', fl.material], ['빛', fl.light], ['색', fl.color], ['서체', fl.type], ['스케일', fl.scale]].filter((x) => x[1])));
      const L = bp.ledger;
      if (L && ((L.rules || []).length || (L.terms || []).length)) out.push('\n**공통 원장 — 모든 절이 따르는 규칙**\n' + list(L.rules, (x) => `**${x.name}** — ${x.rule}`) + ((L.terms || []).length ? `\n- 용어: ${L.terms.map((t) => `${t.term}(${t.means})`).join(' · ')}` : ''));
      // 절 사이에 같은 항목이 다시 나오면 처음 나온 절만 싣고 나머지는 참조로 — 같은 내용 반복이 보고서 길이의 절반이었다
      const shown = [];
      (bp.sections || []).forEach((sec) => {
        const rows = [], refs = [];
        for (const it of sec.items || []) {
          const dup = shown.find((x) => facts.similar(`${x.it.name} ${x.it.what}`, `${it.name} ${it.what}`) >= 0.6);
          if (dup) { refs.push(`${it.name} → 「${dup.sec}」`); continue; }
          shown.push({ it, sec: sec.label });
          rows.push([it.name, it.what, it.where, it.spec, (it.scope_ids || []).join(','), it.from]);
        }
        if (!rows.length && !refs.length) return;
        out.push(`\n**${sec.label}**\n` + table(['이름', '내용', '위치', '사양', '범위', '근거'], rows) + (refs.length ? `\n\n_다른 절과 같은 항목: ${refs.join(' · ')}_` : ''));
      });
      if ((bp.content_modules || []).length) out.push('\n**콘텐츠 모듈**\n' + table(['모듈', '누구·언제', '보이는 것', '갱신', '근거'], bp.content_modules.map((x) => [x.name, x.for, x.shows, x.update, x.from])));
      if ((bp.journey || []).length) out.push('\n**여정**\n' + table(['단계', '접점', '하는 것', '얻는 것'], bp.journey.map((j) => [j.step, j.touchpoint, j.does, j.gets])));
      if ((bp.scope_coverage || []).length) out.push('\n**범위 커버리지**\n' + table(['범위', '어떻게'], bp.scope_coverage.map((x) => [x.scope_id, x.how])));
      // 확인할 것은 맨 끝 '검증 계획'에 한 번만
    }
    if ((c.contents || []).length) {
      out.push('\n## 8.5 콘텐츠 — 사람이 실제로 보고 하는 것');
      c.contents.forEach((x, i) => {
        const tr = x.treatment || {};
        out.push(`\n### ${i + 1}. ${x.title}${x.status === '후보' ? ' (후보)' : ''}\n- 어디서·언제·누구: ${[x.touchpoint, x.moment, x.for].filter(Boolean).join(' · ')}\n- 보이는 것: ${x.what_people_see || ''}\n- 하는 것: ${x.what_people_do || ''}${(x.samples || []).length ? `\n- 예시: ${x.samples.map((y) => `${y.label} “${y.text}”`).join(' / ')}` : ''}\n- 기존의 것을 다룬 방식: ${x.existing || ''} → ${tr.by || ''} ${tr.treat || ''}${tr.principle ? `(${tr.principle})` : ''} → ${tr.becomes || ''}${x.insight ? `\n- 겹친 인사이트: ${x.insight}` : ''}${(x.knowhow || []).length ? `\n- 노하우: ${x.knowhow.map((k) => `${k.id} — ${k.how}`).join(' / ')}` : ''}\n- 흔한 방식과 다른 점: ${x.vs_convention || ''}`);
      });
    }
    const LG = c.language;
    if (LG) {
      out.push(`\n## 8.7 설계론 — 이 Creative는 어떻게 보이는가\n\n> ${LG.thesis || ''}`);
      if (LG.edge) out.push(`\n- **지키는 관습**: ${LG.edge.familiar || ''}\n- **그 위의 새 표현**: ${LG.edge.new || ''}\n- **사람이 얻는 것**: ${LG.edge.why || ''}`);
      if ((LG.derivation || []).length) out.push('\n**근거 — 사조 원리·미감 · 노하우 · 인사이트가 무엇이 되었나**\n' + table(['근거', '무엇이 되었나'], LG.derivation.map((x) => [x.from, x.becomes])));
      if ((LG.signatures || []).length) out.push('\n**시그니처**\n' + table(['이름', '종류', '출발한 패턴', '다룬 방식', '구성', '어디서'], LG.signatures.map((x) => [x.name, x.kind, x.familiar, x.treatment, x.anatomy, x.where])));
      const SY = LG.system || {};
      if (Object.values(SY).some(Boolean)) out.push('\n**시스템**\n' + table(['항목', '내용'], Object.entries(SY).filter(([, v]) => v)));
      const AD = LG.art_direction || {};
      if (AD.picture || AD.style) out.push('\n**아트 디렉션**\n' + table(['항목', '내용'], [['무엇을 그리나', AD.picture], ['스타일', AD.style], ['구도', AD.composition], ['색', AD.palette], ['타이포', AD.type], ['질감·빛', AD.texture_light], ['움직임', AD.motion]].filter((x) => x[1])));
      (LG.examples || []).forEach((x, i) => out.push(`\n**예시 ${i + 1}. ${x.title || ''}** — ${x.shows || ''}${x.image ? `\n\n![${x.title || ''}](${x.image.replace(/^ct:\/\/project\/[^/]+\//, '')})` : ''}`));
      if ((LG.dont || []).length) out.push(`\n- 이렇게 보이면 실패: ${LG.dont.join(' / ')}`);
    }
    out.push('\n## 9. 핵심 장면');
    (c.examples || []).forEach((e, i) => {
      out.push(`\n### ${i + 1}. ${e.touchpoint ? `${e.touchpoint} — ` : ''}${e.title} (${e.direction})${e.content_ref ? `\n_콘텐츠: ${e.content_ref}_` : ''}\n${e.one_liner}\n\n- 헤드라인: **${e.headline || ''}**\n- 서브: ${e.subcopy || ''}\n- CTA: ${e.cta || ''}\n- 방법론이 드러나는 곳: ${e.method_shows_in || ''}`);
      if (e.image) out.push(`\n![${e.title}](${e.image.replace(/^ct:\/\/project\/[^/]+\//, '')})`);
      out.push('\n' + table(['단위', '이름', '내용', '비고'], (e.structure || []).map((s) => [s.unit, s.name, s.content, s.note])));
      const d = e.detail || {};
      out.push(`\n- 코어에서: ${e.derived_from_core || ''}\n- 디테일 3층: 앵글 ${d.angle || '-'} · 뷰 ${d.view || '-'} · 빛 ${d.light || '-'} · 질감 ${d.texture || '-'}\n- DO: ${(e.do || []).join(' / ')}\n- DON'T: ${(e.dont || []).join(' / ')}`);
      out.push('\n' + table(['결정', '명분', '효익'], (e.rationale || []).map((x) => [x.decision, x.reason, x.gain || '— (개살구)'])));
    });
    if (c.selection) out.push(`\n**권장**: ${c.selection.recommended} — ${c.selection.why}`);
    if ((c.prelim_review || []).length) out.push('\n**점검**\n' + list(c.prelim_review, (x) => `${x.gate} · ${x.status} — ${facts.stripBoiler(x.note || '')}`));
  }
  const brain = Object.entries((p.run && p.run.brain) || {}).filter(([, v]) => v);
  if (brain.length) {
    out.push('\n## 10. 더프롬 판단 브레인');
    out.push(table(['단계', '방향 제시', '판정', '핵심 지적'], brain.map(([k, v]) => [k, (v.direct || {}).direction || '', (v.verify || {}).verdict || '', ((v.verify || {}).issues || [])[0] || ''])));
  }
  const vp = verifyPlan(p);
  if (vp) out.push(vp);
  if (p.run && (p.run.inspirations || []).length) out.push('\n## 12. 디자이너의 영감\n' + list(p.run.inspirations, (i) => `${i.stage} · ${i.text}`));
  if (p.run && p.run.polishStats && Object.keys(p.run.polishStats).length) {
    out.push('\n## 부록 · 교열 — AI투 검사기 (writing.md 4장)\n' + table(['단계', '검토 / 전체 문장', 'AI투 전 → 후', '많이 나온 것'], Object.entries(p.run.polishStats).map(([k, v]) => [k, `${v.sent} / ${v.sentences}`, `${v.before} → ${v.after}`, Object.entries(v.byKindBefore || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kk, n]) => `${kk} ${n}`).join(', ')])));
  }
  if (p.run && p.run.factStats && Object.values(p.run.factStats).some((x) => x.numbers)) out.push('\n## 부록 · 사실 가드 — 근거 없는 수치\n' + table(['단계', "'값 미정 · 목업'으로 바꾼 수치", '예'], Object.entries(p.run.factStats).filter(([, v]) => v.numbers).map(([k, v]) => [k, String(v.numbers), (v.samples || []).slice(0, 5).join(', ')])));
  if (p.run && p.run.usage) out.push(`\n---\nAPI 비용(추정) $${(p.run.usage.cost || 0).toFixed(3)} · 호출 ${p.run.usage.calls} · 이미지 ${p.run.usage.images || 0}`);
  return out.filter(Boolean).join('\n');
}

/** thefrom-ux 브리프 양식(★1~6)으로 — 팀 briefs/ 폴더에 올릴 수 있다 */
function briefMd(p) {
  const b = p.brief; const m = (p.run && p.run.results.brief && p.run.results.brief.mission) || {};
  return `# 브리프 — ${p.name}\n\n> 브리프 게이트: ${(p.run && p.run.results.brief && p.run.results.brief.gate) || '미판정'} · THE FROM FREATIVE에서 내보냄\n\n## ★1 무엇을\n${m.deliverable || ''}\n${b.product || ''}\n\n## ★2 누구에게\n${b.target || ''} · ${b.channel || ''} · ${(b.devices || []).join(', ')}\n\n## ★3 핵심 순간\n${b.keyMoment || m.key_moment || ''}\n\n## ★4 브랜드\n${b.brand || '없음'}\n\n## ★5 제약·재료\n${b.constraints || ''}\n\n## ★6 성공 기준·깊이\n${[...(b.purposes || []), b.purposeNote].filter(Boolean).join(', ')} · ${b.depth === 'full' ? '끝까지' : 'C 게이트까지'}\n\n## 7 비교\n${b.references || ''}\n`;
}

function exportProject(id) {
  const p = store.get(id);
  if (!p) throw new Error('project not found');
  const dir = store.projectDir(id);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe = p.name.replace(/[\\/:*?"<>|]/g, '_');
  const reportPath = path.join(dir, `FREATIVE_${safe}_${stamp}.md`);
  fs.writeFileSync(reportPath, build(p), 'utf8');
  fs.writeFileSync(path.join(dir, `브리프_${safe}_${stamp}.md`), briefMd(p), 'utf8');
  return { reportPath, dir };
}

module.exports = { build, exportProject };
