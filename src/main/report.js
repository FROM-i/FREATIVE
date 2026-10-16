'use strict';
/** 결과를 .md 보고서와 브리프 .md(thefrom-ux 브리프 양식 호환)로 내보낸다. */
const fs = require('fs');
const path = require('path');
const store = require('./services/storage');
const { formatBrief } = require('./orchestrator');

const list = (arr, f = (x) => x) => (arr || []).map((x) => `- ${f(x)}`).join('\n');
const table = (head, rows) => rows && rows.length
  ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')}`
  : '';

function build(p) {
  const r = (p.run && p.run.results) || {};
  const out = [];
  out.push(`# ${p.name} — THE FROM FREATIVE`);
  out.push(`> 생성 ${new Date().toLocaleString('ko-KR')} · 작업자 ${(p.brief && p.brief.worker) || p.ownerName || ''} · 지식 v${p.run ? p.run.knowledge : '-'} · 모델 ${p.run ? Object.values(p.run.models || {}).join(' / ') : ''}`);
  out.push('> AI가 내린 판정은 모두 **예비 판정**입니다. C 게이트·완성도의 최종 판정은 사람이 합니다.');
  out.push('\n## 0. 접수 브리프\n' + formatBrief(p.brief));
  if (r.brief) {
    const b = r.brief;
    out.push(`\n## 1. 미션 — 브리프 게이트: ${b.gate}\n${b.gate_reason || ''}\n`);
    out.push(table(['항목', '내용'], Object.entries(b.mission || {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])));
    if (b.assumptions && b.assumptions.length) out.push('\n**가정**\n' + list(b.assumptions, (a) => `${a.item} — ${a.basis}`));
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
    if (a.synth) out.push(`\n**하이브리드**: ${a.synth.hybrid}\n\n**여행 가방**\n${list(a.synth.suitcase)}`);
  }
  if (r.tunnel) {
    const t = r.tunnel;
    out.push('\n## 4. Tunnel — 레이어링');
    for (const l of (t.layers || []).filter((x) => !x.error)) {
      out.push(`\n### ${l.label} — ${l.headline}\n${list(l.insights, (i) => `**${i.title}** ${i.detail} _(${i.source})_`)}\n- 지킬 것: ${(l.keep || []).join(', ')}\n- 바꿀 것: ${(l.change || []).join(', ')}\n- 경계: ${l.boundary || ''}`);
    }
    if (t.synth) out.push(`\n**좁혀진 범위**: ${t.synth.narrowed}\n\n**출구의 빛**: ${t.synth.exit_light}`);
  }
  if (r.positioning) {
    const p2 = r.positioning;
    out.push(`\n## 5. Creative Positioning Map\n- X축: ${p2.axes.x.low} ↔ ${p2.axes.x.high} (${p2.axes.x.name})\n- Y축: ${p2.axes.y.low} ↔ ${p2.axes.y.high} (${p2.axes.y.name})\n- 빈자리: **${p2.whitespace.label}** — ${p2.whitespace.why}`);
    out.push(table(['ID', '영역', '설명'], (p2.territories || []).map((t) => [t.id, t.name, t.desc])));
    out.push('\n**좁히기**\n' + list(p2.rounds, (x) => `${x.from} → ${x.to}: ${[].concat(x.cut).join(', ')} 제외 — ${x.criterion} · ${x.reason}`));
    out.push(`\n**선택 (예비)**: ${p2.final.id} — ${p2.final.reason}`);
  }
  if (r.forpop) {
    const f = r.forpop;
    out.push('\n## 6. FoR · PoP · PoD — 최종 검증 · 발상의 전환');
    out.push('\n**앞선 단계 최종 검증**\n' + table(['단계', '핵심', '판정', '이유', '연결'], (f.audit || []).map((x) => [x.stage, x.core, x.verdict, x.note, x.link])));
    out.push(`\n연결성 — ${f.coherence || ''}`);
    const F = f.for || {};
    if (F.target_view) out.push(`\n타겟은 이것을 “${F.target_view}”에 빗대어 본다.`);
    if ((F.options || []).length) out.push('\n**FoR — 네 방식**\n' + table(['방식', '틀', '경쟁 구도', '얻는 것', '치르는 것'], F.options.map((o) => [o.kind + (o.kind === F.chosen ? ' ●' : ''), o.frame, (o.competitors || []).join(', '), o.gain, o.cost])));
    out.push(`\n**FoR**: ${F.frame || ''}${F.why ? ` — ${F.why}` : ''}\n\n**PoP**\n${list(f.pop, (x) => `${x.kind ? `[${x.kind}] ` : ''}${x.item} — ${x.why}`)}\n\n**PoD 후보 5** (바람직성 · 전달성 · 방어성)\n${list(f.pod_candidates, (x) => `${x.id} ${x.item} — ${x.gain} (${[x.desirable, x.deliverable, x.defensible].map((v) => v ?? '-').join(' · ')})`)}`);
    const sc = (f.scan && f.scan.scopes) || [];
    if (sc.length) {
      out.push('\n**웹 정찰 — 세 범위** (조수)');
      sc.forEach((x) => {
        out.push(`\n*${x.title}* — ${x.summary || (x.skipped ? '웹 정찰 꺼짐' : '')}`);
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
      if (axes.length) {
        out.push(`\n**차별성 판정 — 공통 범례 (${axes.length === 5 ? '오각형' : '삼각형'} · 0~5)**\n` + list(axes, (a) => `${a.id} ${a.name}${a.from_us ? ' (나로부터)' : ''} — 0 ${a.low} → 5 ${a.high}`));
        const rows = [];
        (cmp.scopes || []).forEach((x) => (x.series || []).forEach((se) => rows.push([x.title, se.name + (se.kind === 'us' ? ' ●' : ''), ...se.values.map(String), x.verdict || ''])));
        out.push(table(['범위', '계열', ...axes.map((a) => a.id), '판정'], rows));
      }
      (cmp.scopes || []).forEach((x) => out.push(`\n*${x.title} · ${x.verdict || ''}* — ${x.note || ''}\n- 유사성: ${(x.similar || []).map((y) => y.item).join(' · ')}\n- 차별점: ${(x.different || []).map((y) => y.item).join(' · ')}`));
      if (cmp.positioning) out.push(`\n**포지셔닝 진술문**\n\n> ${cmp.positioning.sentence || ''}`);
      if ((cmp.fixes || []).filter(Boolean).length) out.push('\n**보완할 것**\n' + list(cmp.fixes.filter(Boolean), (x) => x));
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
    out.push('\n## 8. Creative 가이드');
    (c.examples || []).forEach((e, i) => {
      out.push(`\n### ${i + 1}. ${e.direction} — ${e.title}\n${e.one_liner}\n\n- 헤드라인: **${e.headline || ''}**\n- 서브: ${e.subcopy || ''}\n- CTA: ${e.cta || ''}\n- 방법론이 드러나는 곳: ${e.method_shows_in || ''}`);
      if (e.image) out.push(`\n![${e.title}](${e.image.replace(/^ct:\/\/project\/[^/]+\//, '')})`);
      out.push('\n' + table(['단위', '이름', '내용', '비고'], (e.structure || []).map((s) => [s.unit, s.name, s.content, s.note])));
      const d = e.detail || {};
      out.push(`\n- 코어에서: ${e.derived_from_core || ''}\n- 디테일 3층: 앵글 ${d.angle || '-'} · 뷰 ${d.view || '-'} · 빛 ${d.light || '-'} · 질감 ${d.texture || '-'}\n- DO: ${(e.do || []).join(' / ')}\n- DON'T: ${(e.dont || []).join(' / ')}`);
      out.push('\n' + table(['결정', '명분', '효익'], (e.rationale || []).map((x) => [x.decision, x.reason, x.gain || '— (개살구)'])));
    });
    if (c.selection) out.push(`\n**권장**: ${c.selection.recommended} — ${c.selection.why}`);
    out.push('\n**예비 판정**\n' + list(c.prelim_review, (x) => `${x.gate} · ${x.status} — ${x.note}`));
    out.push('\n**사람이 할 일**\n' + list(c.human_todo));
  }
  const brain = Object.entries((p.run && p.run.brain) || {}).filter(([, v]) => v);
  if (brain.length) {
    out.push('\n## 9. 더프롬 판단 브레인');
    out.push(table(['단계', '방향 제시', '판정', '핵심 지적'], brain.map(([k, v]) => [k, (v.direct || {}).direction || '', (v.verify || {}).verdict || '', ((v.verify || {}).issues || [])[0] || ''])));
  }
  if (p.run && (p.run.inspirations || []).length) out.push('\n## 10. 디자이너의 영감\n' + list(p.run.inspirations, (i) => `${i.stage} · ${i.text}`));
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
