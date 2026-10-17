'use strict';
/**
 * 최종 리포트 PPT — 전체 여정의 코어만 추출해 16:9 슬라이드로 저장한다.
 * 서체: Pretendard (열람 PC에 Pretendard가 설치되어 있어야 의도대로 보인다).
 * 블랙 & 오프화이트 · thin line · 노랑은 '결정'에만.
 */
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const store = require('./services/storage');
const knowledge = require('./knowledge');

const F = 'Pretendard';
const INK = '141414', PAPER = 'F4F2EC', PAPER2 = 'ECE9E1', MUTE = '8A867D', HAIR = 'CFCAC0', Y = 'FFD23C';
const W = 13.333, H = 7.5, M = 0.6;
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const t = (s, n = 200) => String(s ?? '').slice(0, n);
const POPK = { 카테고리: '기본 조건', 경쟁: '경쟁 대응', 상관: '약점 보완' };

function build(project) {
  const run = project.run || {};
  const R = run.results || {};
  const core = R.report || {};
  const slidesByKey = Object.fromEntries(arr(core.slides).map((s) => [s.key, s]));
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = project.brief.worker || project.ownerName || 'THE FROM';
  pptx.company = 'THE FROM';
  pptx.title = core.title || project.name;
  pptx.theme = { headFontFace: F, bodyFontFace: F };
  let page = 0;

  const newSlide = (kicker) => {
    const s = pptx.addSlide();
    page++;
    s.background = { color: PAPER };
    if (kicker) s.addText(kicker, { x: M, y: 0.35, w: 8, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: MUTE, charSpacing: 2 });
    s.addShape(pptx.ShapeType.line, { x: M, y: H - 0.5, w: W - 2 * M, h: 0, line: { color: INK, width: 0.75 } });
    s.addText(`THE FROM  FREATIVE  ·  ${t(project.name, 40)}`, { x: M, y: H - 0.45, w: 8, h: 0.3, fontFace: F, fontSize: 8, color: MUTE });
    s.addText(String(page).padStart(2, '0'), { x: W - M - 1, y: H - 0.45, w: 1, h: 0.3, fontFace: F, fontSize: 8, color: MUTE, align: 'right' });
    return s;
  };
  const headline = (s, text, y = 0.75) => s.addText(t(text, 80), { x: M, y, w: W - 2 * M, h: 0.8, fontFace: F, fontSize: 28, bold: true, color: INK, valign: 'top' });
  const bullets = (s, list, opt) => {
    const items = arr(list).filter(Boolean).slice(0, 6);
    if (!items.length) return;
    s.addText(items.map((b) => ({ text: t(b, 90), options: { bullet: { code: '2014' }, paraSpaceAfter: 6 } })), { fontFace: F, fontSize: 13, color: INK, valign: 'top', ...opt });
  };
  const keyOf = (k, fb) => slidesByKey[k] || { headline: fb, bullets: [] };

  /* 1 표지 */
  {
    const s = pptx.addSlide(); page++;
    s.background = { color: PAPER };
    s.addText('THE FROM  ·  FREATIVE', { x: M, y: 0.5, w: 8, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: INK, charSpacing: 3 });
    s.addText(t(core.title || project.name, 60), { x: M, y: 2.0, w: W - 2 * M, h: 1.2, fontFace: F, fontSize: 44, bold: true, color: INK });
    s.addText(t(core.subtitle || (R.concept && R.concept.theme) || '', 90), { x: M, y: 3.2, w: W - 2 * M, h: 0.6, fontFace: F, fontSize: 20, color: INK });
    if (R.concept && R.concept.theme) s.addShape(pptx.ShapeType.rect, { x: M, y: 3.85, w: 1.2, h: 0.08, fill: { color: Y }, line: { color: Y } });
    // 한 줄로 이어지는 여정 — 지면 선
    s.addShape(pptx.ShapeType.line, { x: 0, y: 5.6, w: W, h: 0, line: { color: INK, width: 1 } });
    s.addShape(pptx.ShapeType.arc, { x: 8.8, y: 4.75, w: 1.7, h: 1.7, angleRange: [180, 360], line: { color: INK, width: 1 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 6.2, y: 5.05, w: 0.32, h: 0.32, fill: { color: PAPER }, line: { color: INK, width: 1 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 6.48, y: 4.98, w: 0.09, h: 0.09, fill: { color: Y }, line: { color: INK, width: 0.5 } });
    s.addText(`작업자 ${project.brief.worker || project.ownerName || ''}   ·   ${new Date().toLocaleDateString('ko-KR')}   ·   방법론 v${knowledge.status().methodVersion || ''}`, { x: M, y: 6.3, w: W - 2 * M, h: 0.3, fontFace: F, fontSize: 10, color: MUTE });
  }

  /* 2 요약 */
  {
    const s = newSlide('EXECUTIVE SUMMARY');
    headline(s, keyOf('mission', '').headline || '한 장 요약');
    arr(core.exec_summary).slice(0, 3).forEach((line, i) => {
      const y = 2.0 + i * 1.35;
      s.addText(String(i + 1).padStart(2, '0'), { x: M, y, w: 0.8, h: 0.6, fontFace: F, fontSize: 22, color: MUTE });
      s.addShape(pptx.ShapeType.line, { x: M + 0.9, y: y + 0.05, w: W - 2 * M - 0.9, h: 0, line: { color: HAIR, width: 0.75 } });
      s.addText(t(line, 90), { x: M + 0.9, y: y + 0.12, w: W - 2 * M - 0.9, h: 0.9, fontFace: F, fontSize: 20, bold: i === 2, color: INK, valign: 'top' });
    });
  }

  /* 3 방법론 흐름 + 브레인 판정 */
  {
    const s = newSlide('THE FROM METHOD — 판단의 사슬');
    headline(s, '나로부터 시작해, 사조를 여행하고, 터널을 지나 하나의 코어로');
    const steps = [['canvas', '나로부터'], ['airplane', 'Airplane'], ['tunnel', 'Tunnel'], ['positioning', 'Positioning'], ['forpop', 'FoR·PoP·PoD'], ['concept', 'Concept'], ['creative', 'Creative']];
    const x0 = M + 0.3, x1 = W - M - 0.3, y = 3.6;
    s.addShape(pptx.ShapeType.line, { x: x0, y, w: x1 - x0, h: 0, line: { color: INK, width: 1 } });
    steps.forEach(([id, label], i) => {
      const x = x0 + (i / (steps.length - 1)) * (x1 - x0);
      const v = run.brain && run.brain[id] && run.brain[id].verify;
      s.addShape(pptx.ShapeType.ellipse, { x: x - 0.14, y: y - 0.14, w: 0.28, h: 0.28, fill: { color: id === 'concept' ? Y : PAPER }, line: { color: INK, width: 1 } });
      s.addText(label, { x: x - 0.9, y: y - 0.75, w: 1.8, h: 0.4, fontFace: F, fontSize: 13, bold: true, align: 'center', color: INK });
      s.addText(v ? `브레인 ${v.verdict}` : '—', { x: x - 0.9, y: y + 0.25, w: 1.8, h: 0.3, fontFace: F, fontSize: 10, align: 'center', color: v && v.verdict === '통과' ? INK : MUTE });
    });
    s.addText('관성은 구조에서 지키고, 새로움은 해석에서 만든다.', { x: M, y: 5.3, w: W - 2 * M, h: 0.5, fontFace: F, fontSize: 16, color: INK, align: 'center', italic: true });
  }

  /* 4 미션 · 나로부터 */
  {
    const k = keyOf('from_me', '나로부터');
    const s = newSlide('MISSION · 나로부터');
    headline(s, k.headline);
    const m = (R.brief && R.brief.mission) || {};
    const rows = [['결과물', m.deliverable], ['목적', m.objective], ['타겟', m.target], ['핵심 순간', m.key_moment]].filter((r) => r[1]);
    s.addTable(rows.map(([a, b]) => [{ text: a, options: { color: MUTE, fontSize: 11 } }, { text: t(b, 90), options: { fontSize: 12 } }]), { x: M, y: 1.9, w: 6.2, colW: [1.4, 4.8], fontFace: F, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.5 });
    if (R.canvas) {
      s.addShape(pptx.ShapeType.rect, { x: 7.3, y: 1.9, w: W - M - 7.3, h: 3.6, fill: { color: INK }, line: { color: INK } });
      s.addText([{ text: '나로부터\n', options: { fontSize: 11, color: 'BDB9AF', bold: true } }, { text: t(R.canvas.from_me || R.canvas.concept_draft, 140), options: { fontSize: 18, color: PAPER, bold: true } }], { x: 7.6, y: 2.1, w: W - M - 7.9, h: 3.2, fontFace: F, valign: 'top' });
    }
    bullets(s, k.bullets, { x: M, y: 4.6, w: 6.2, h: 1.6 });
  }

  /* 5 Airplane */
  if (R.airplane) {
    const k = keyOf('airplane', '사조 여행');
    const s = newSlide('AIRPLANE EFFECT — 사조 여행');
    headline(s, k.headline);
    const tr = arr(R.airplane.travels).filter((x) => !x.error).slice(0, 5);
    const sel = new Set(arr(R.airplane.synth && R.airplane.synth.selected));
    const w = (W - 2 * M - 0.2 * (tr.length - 1)) / Math.max(1, tr.length);
    tr.forEach((x, i) => {
      const xx = M + i * (w + 0.2);
      s.addShape(pptx.ShapeType.rect, { x: xx, y: 1.9, w, h: 3.0, fill: { color: sel.has(x.id) ? Y : PAPER }, line: { color: INK, width: 0.75 } });
      s.addText([{ text: `${x.name}\n`, options: { fontSize: 14, bold: true } }, { text: `${x.era || ''}\n\n`, options: { fontSize: 9, color: MUTE } }, { text: `${t(x.core, 30)}\n\n`, options: { fontSize: 13, bold: true } }, { text: t(arr(x.take)[0], 70), options: { fontSize: 10 } }], { x: xx + 0.15, y: 2.0, w: w - 0.3, h: 2.8, fontFace: F, color: INK, valign: 'top' });
    });
    if (R.airplane.synth) s.addText([{ text: 'HYBRID  ', options: { bold: true, color: MUTE, fontSize: 10 } }, { text: t(R.airplane.synth.hybrid, 120), options: { fontSize: 14, bold: true } }], { x: M, y: 5.2, w: W - 2 * M, h: 0.9, fontFace: F, color: INK });
  }

  /* 6 Tunnel */
  if (R.tunnel) {
    const k = keyOf('tunnel', '터널');
    const s = newSlide('TUNNEL EFFECT — 레이어링');
    headline(s, k.headline);
    const ls = arr(R.tunnel.layers).filter((x) => !x.error).slice(0, 4);
    const w = (W - 2 * M) / Math.max(1, ls.length);
    ls.forEach((l, i) => {
      const xx = M + i * w;
      s.addShape(pptx.ShapeType.rect, { x: xx, y: 1.9, w, h: 3.1, fill: { color: PAPER }, line: { color: INK, width: 0.75 } });
      s.addText([{ text: `${'①②③④'[i]} ${l.label}\n`, options: { fontSize: 10, color: MUTE, bold: true } }, { text: `${t(l.headline, 60)}\n\n`, options: { fontSize: 14, bold: true } }, { text: `지킬 것  ${t(arr(l.keep).join(', '), 60)}\n`, options: { fontSize: 10 } }, { text: `바꿀 것  ${t(arr(l.change).join(', '), 60)}`, options: { fontSize: 10 } }], { x: xx + 0.15, y: 2.0, w: w - 0.3, h: 2.9, fontFace: F, color: INK, valign: 'top' });
    });
    if (R.tunnel.synth) {
      s.addShape(pptx.ShapeType.rect, { x: M, y: 5.25, w: W - 2 * M, h: 0.85, fill: { color: INK }, line: { color: INK } });
      s.addText(`출구 — ${t(R.tunnel.synth.narrowed, 110)}`, { x: M + 0.2, y: 5.3, w: W - 2 * M - 0.4, h: 0.75, fontFace: F, fontSize: 15, bold: true, color: PAPER, valign: 'middle' });
    }
  }

  /* 7 Positioning */
  if (R.positioning) {
    const p = R.positioning;
    const k = keyOf('positioning', '포지셔닝');
    const s = newSlide('CREATIVE POSITIONING MAP — 5 → 4 → 3 → 1');
    headline(s, k.headline);
    const bx = M, by = 1.8, bs = 4.4;
    const sx = (v) => bx + ((v + 1) / 2) * bs, sy = (v) => by + bs - ((v + 1) / 2) * bs;
    s.addShape(pptx.ShapeType.rect, { x: bx, y: by, w: bs, h: bs, fill: { color: PAPER }, line: { color: INK, width: 0.75 } });
    s.addShape(pptx.ShapeType.line, { x: bx, y: by + bs / 2, w: bs, h: 0, line: { color: INK, width: 0.75 } });
    s.addShape(pptx.ShapeType.line, { x: bx + bs / 2, y: by, w: 0, h: bs, line: { color: INK, width: 0.75 } });
    s.addText(t(p.axes.x.low, 14), { x: bx, y: by + bs / 2 - 0.3, w: 1.6, h: 0.25, fontFace: F, fontSize: 8, color: MUTE });
    s.addText(t(p.axes.x.high, 14), { x: bx + bs - 1.6, y: by + bs / 2 - 0.3, w: 1.6, h: 0.25, fontFace: F, fontSize: 8, color: MUTE, align: 'right' });
    s.addText(t(p.axes.y.high, 14), { x: bx + bs / 2 + 0.05, y: by, w: 1.6, h: 0.25, fontFace: F, fontSize: 8, color: MUTE });
    s.addText(t(p.axes.y.low, 14), { x: bx + bs / 2 + 0.05, y: by + bs - 0.25, w: 1.6, h: 0.25, fontFace: F, fontSize: 8, color: MUTE });
    const ws = p.whitespace || { x: 0, y: 0 };
    s.addShape(pptx.ShapeType.ellipse, { x: sx(ws.x) - 0.45, y: sy(ws.y) - 0.45, w: 0.9, h: 0.9, fill: { color: Y, transparency: 55 }, line: { color: INK, width: 0.75, dashType: 'dash' } });
    arr(p.players).forEach((q) => { s.addShape(pptx.ShapeType.ellipse, { x: sx(q.x) - 0.07, y: sy(q.y) - 0.07, w: 0.14, h: 0.14, fill: { color: PAPER }, line: { color: INK, width: 0.75 } }); s.addText(t(q.label, 14), { x: sx(q.x) + 0.08, y: sy(q.y) - 0.12, w: 1.6, h: 0.24, fontFace: F, fontSize: 7, color: MUTE }); });
    const cut = new Set(arr(p.rounds).flatMap((r) => arr(r.cut)));
    const fin = p.final && p.final.id;
    arr(p.territories).forEach((tt) => {
      const r = tt.id === fin ? 0.2 : 0.14;
      s.addShape(pptx.ShapeType.ellipse, { x: sx(tt.x) - r, y: sy(tt.y) - r, w: 2 * r, h: 2 * r, fill: { color: tt.id === fin ? Y : cut.has(tt.id) ? PAPER : INK }, line: { color: INK, width: 0.75, dashType: cut.has(tt.id) ? 'dash' : 'solid' } });
      s.addText(t(tt.name, 10), { x: sx(tt.x) - 0.8, y: sy(tt.y) - r - 0.28, w: 1.6, h: 0.24, fontFace: F, fontSize: 8, bold: tt.id === fin, align: 'center', color: INK });
    });
    // 좁히기 퍼널
    const fx = 6.0;
    let alive = arr(p.territories).map((x) => x.id);
    const rows = [alive.slice()];
    arr(p.rounds).forEach((r) => { alive = alive.filter((id) => !arr(r.cut).includes(id)); rows.push(alive.slice()); });
    rows.forEach((ids, i) => {
      const y = 1.9 + i * 1.0;
      s.addText(String(ids.length), { x: fx, y, w: 0.5, h: 0.6, fontFace: F, fontSize: 20, color: MUTE });
      const bw = 1.25, gap = 0.08, total = ids.length * bw + (ids.length - 1) * gap;
      const sx0 = fx + 0.6 + (W - M - fx - 0.6 - total) / 2;
      ids.forEach((id, j) => {
        const tt = arr(p.territories).find((x) => x.id === id) || { name: id };
        const last = i === rows.length - 1 && id === fin;
        s.addShape(pptx.ShapeType.rect, { x: sx0 + j * (bw + gap), y, w: bw, h: 0.55, fill: { color: last ? Y : PAPER }, line: { color: INK, width: 0.75 } });
        s.addText(t(tt.name, 10), { x: sx0 + j * (bw + gap), y, w: bw, h: 0.55, fontFace: F, fontSize: 9, bold: last, align: 'center', valign: 'middle', color: INK });
      });
      const r = arr(p.rounds)[i];
      if (r) s.addText(`${arr(r.cut).join(', ')} 제외 · ${r.criterion} — ${t(r.reason, 50)}`, { x: fx + 0.6, y: y + 0.58, w: W - M - fx - 0.6, h: 0.3, fontFace: F, fontSize: 8, color: MUTE });
    });
  }

  /* 8 FoR · PoP · PoD — 발상의 전환 플로우 */
  if (R.forpop) {
    const f = R.forpop;
    const k = keyOf('forpop', 'FoR · PoP · PoD');
    const s = newSlide('FoR · PoP · PoD — 최종 검증 · 발상의 전환 5 → 3 → 1');
    headline(s, k.headline);
    s.addShape(pptx.ShapeType.roundRect, { x: M, y: 1.75, w: W - 2 * M, h: 4.9, rectRadius: 0.15, fill: { color: PAPER }, line: { color: INK, width: 0.75 } });
    s.addText([{ text: 'FoR  ', options: { bold: true, color: MUTE, fontSize: 10 } }, { text: t(f.for && f.for.frame, 70), options: { bold: true, fontSize: 15 } }], { x: M + 0.25, y: 1.85, w: W - 2 * M - 0.5, h: 0.45, fontFace: F, color: INK });
    s.addShape(pptx.ShapeType.roundRect, { x: M + 0.25, y: 2.4, w: W - 2 * M - 0.5, h: 0.6, rectRadius: 0.3, fill: { color: PAPER }, line: { color: INK, width: 0.75 } });
    s.addText(`PoP · 최소한 갖춰야 할 것  ·  ${arr(f.pop).map((x) => x.item).join('   ·   ')}`, { x: M + 0.4, y: 2.4, w: W - 2 * M - 0.8, h: 0.6, fontFace: F, fontSize: 11, align: 'center', valign: 'middle', color: INK });
    const cols = [arr(f.pod_candidates), arr(f.shifts && f.shifts[0] && f.shifts[0].result)];
    const colX = [M + 0.3, M + 4.2];
    cols.forEach((list, ci) => list.slice(0, 5).forEach((c, i) => {
      const h = 0.48, y = 3.25 + i * (h + 0.1) + (ci === 1 ? 0.55 : 0);
      s.addShape(pptx.ShapeType.rect, { x: colX[ci], y, w: 2.9, h, fill: { color: PAPER }, line: { color: INK, width: 0.75 } });
      s.addText(`${c.id}  ${t(c.item, 26)}`, { x: colX[ci] + 0.1, y, w: 2.7, h, fontFace: F, fontSize: 9, valign: 'middle', color: INK });
    }));
    const shifts = arr(f.shifts);
    [[M + 3.3, shifts[0]], [M + 7.2, shifts[1]]].forEach(([x, sh]) => {
      if (!sh) return;
      s.addShape(pptx.ShapeType.diamond, { x, y: 4.0, w: 0.8, h: 0.8, fill: { color: INK }, line: { color: INK } });
      s.addText(t(sh.shift && sh.shift.type, 8), { x, y: 4.0, w: 0.8, h: 0.8, fontFace: F, fontSize: 7, bold: true, align: 'center', valign: 'middle', color: PAPER });
      s.addText(t(sh.shift && sh.shift.name, 18), { x: x - 0.5, y: 4.85, w: 1.8, h: 0.3, fontFace: F, fontSize: 8, align: 'center', color: MUTE });
    });
    s.addShape(pptx.ShapeType.ellipse, { x: 8.55, y: 3.25, w: 2.3, h: 2.3, fill: { color: Y }, line: { color: INK, width: 0.75 } });
    s.addText([{ text: 'CORE PoD\n', options: { fontSize: 8, bold: true } }, { text: t(f.core_pod && f.core_pod.item, 30), options: { fontSize: 13, bold: true } }], { x: 8.65, y: 3.35, w: 2.1, h: 2.1, fontFace: F, align: 'center', valign: 'middle', color: INK });
    s.addText(t(f.core_pod && f.core_pod.statement, 110), { x: 11.0, y: 3.4, w: W - M - 11.2, h: 2.2, fontFace: F, fontSize: 11, bold: true, color: INK, valign: 'middle' });
    s.addText(`최종 검증 — ${t(f.coherence, 90)}`, { x: M + 0.25, y: 6.15, w: W - 2 * M - 0.5, h: 0.4, fontFace: F, fontSize: 9, color: MUTE });
  }

  /* 8-2 FoR 네 방식 · 포지셔닝 진술문 */
  if (R.forpop && R.forpop.for && arr(R.forpop.for.options).length) {
    const f = R.forpop, FR = f.for;
    const s = newSlide('FoR — 소비자의 인식 프레임 · 경쟁 구도');
    headline(s, FR.target_view ? `타겟은 이것을 “${t(FR.target_view, 40)}”에 빗대어 본다` : 'FoR — 어느 판에서 싸울 것인가');
    const kinds = ['좁히기', '현재', '넓히기', '전환'];
    const w = (W - 2 * M - 0.2 * 3) / 4;
    kinds.forEach((k, i) => {
      const o = arr(FR.options).find((x) => x.kind === k); if (!o) return;
      const on = FR.chosen === k, x = M + i * (w + 0.2);
      s.addShape(pptx.ShapeType.rect, { x, y: 1.75, w, h: 2.55, fill: { color: on ? Y : PAPER }, line: { color: on ? INK : HAIR, width: on ? 1.25 : 0.75 } });
      s.addText([
        { text: `${k}${on ? '  ● 선택' : ''}\n`, options: { fontSize: 9, bold: true, color: on ? INK : MUTE } },
        { text: `${t(o.frame, 34)}\n\n`, options: { fontSize: 14, bold: true } },
        { text: `경쟁 구도 — ${t(arr(o.competitors).join(', '), 60)}\n`, options: { fontSize: 9 } },
        { text: `+ ${t(o.gain, 40)}\n`, options: { fontSize: 9 } },
        { text: `− ${t(o.cost, 40)}`, options: { fontSize: 9, color: MUTE } },
      ], { x: x + 0.12, y: 1.85, w: w - 0.24, h: 2.35, fontFace: F, color: INK, valign: 'top' });
    });
    const pops = arr(f.pop).slice(0, 5);
    s.addText(`PoP · 최소한 갖춰야 할 것  ·  ${pops.map((x) => `${x.kind ? `[${POPK[x.kind] || x.kind}] ` : ''}${x.item}`).join('   ·   ')}`, { x: M, y: 4.45, w: W - 2 * M, h: 0.45, fontFace: F, fontSize: 10, color: INK, align: 'center', valign: 'middle', shape: pptx.ShapeType.roundRect, rectRadius: 0.22, line: { color: INK, width: 0.75 } });
    const pos = f.compare && f.compare.positioning;
    if (pos && pos.slots) {
      const S = pos.slots;
      s.addText('포지셔닝 진술문 — [타겟]을 위해, [브랜드]는 [FoR] 안에서 [PoD]를 제공하는 [제품 유형]이다', { x: M, y: 5.1, w: W - 2 * M, h: 0.3, fontFace: F, fontSize: 9, bold: true, color: MUTE });
      s.addText([
        { text: `${t(S.target, 40)}`, options: { bold: true, underline: { style: 'sng' } } }, { text: '을 위해, ' },
        { text: `${t(S.brand, 30)}`, options: { bold: true, underline: { style: 'sng' } } }, { text: '는 ' },
        { text: `${t(S.frame, 30)}`, options: { bold: true, underline: { style: 'sng' } } }, { text: ' 안에서 ' },
        { text: `${t(S.pod, 50)}`, options: { bold: true, highlight: Y } }, { text: '를 제공하는 ' },
        { text: `${t(S.type, 30)}`, options: { bold: true, underline: { style: 'sng' } } }, { text: '이다.' },
      ], { x: M, y: 5.4, w: W - 2 * M, h: 0.9, fontFace: F, fontSize: 16, color: INK, valign: 'top' });
    }
  }

  /* 8-3 차별성 검토 — 세 범위 · 공통 범례 레이더 */
  if (R.forpop && R.forpop.compare && arr(R.forpop.compare.legend && R.forpop.compare.legend.axes).length >= 3) {
    const cmp = R.forpop.compare;
    const axes = cmp.legend.axes;
    const s = newSlide(`차별성 검토 — 웹 정찰 3범위 · 공통 범례 ${axes.length === 5 ? '오각형' : '삼각형'}`);
    headline(s, t(cmp.line || '세 범위에서 같은 축으로 비교한다', 60));
    s.addText(axes.map((a) => `${a.id} ${a.name}${a.from_us ? '(나로부터)' : ''}`).join('   ·   ') + '   |   0~5 · 노랑 = 우리', { x: M, y: 1.45, w: W - 2 * M, h: 0.3, fontFace: F, fontSize: 9, color: MUTE });
    const cw = (W - 2 * M - 0.3 * 2) / 3;
    arr(cmp.scopes).slice(0, 3).forEach((x, i) => {
      const cx = M + i * (cw + 0.3);
      const series = arr(x.series);
      s.addText([{ text: `0${i + 1}  ${t(x.title, 24)}   `, options: { bold: true } }, { text: x.verdict || '', options: { bold: true, highlight: x.verdict === '겹침' ? 'F2C2B8' : x.verdict === '부분' ? Y : undefined } }], { x: cx, y: 1.8, w: cw, h: 0.35, fontFace: F, fontSize: 12, color: INK });
      if (series.length) {
        const colors = series.map((se, k) => (se.kind === 'us' ? 'E0B000' : k === 1 ? INK : MUTE));
        s.addChart(pptx.ChartType.radar, series.map((se) => ({ name: t(se.name, 20), labels: axes.map((a) => `${a.id} ${t(a.name, 8)}`), values: se.values })), {
          x: cx, y: 2.15, w: cw, h: 2.75, radarStyle: 'marker', chartColors: colors, lineSize: 2,
          valAxisMinVal: 0, valAxisMaxVal: 5, valAxisMajorUnit: 1, valAxisLabelFontSize: 7, valAxisHidden: true,
          catAxisLabelFontFace: F, catAxisLabelFontSize: 8, catAxisLabelColor: INK,
          showLegend: true, legendPos: 'b', legendFontFace: F, legendFontSize: 8,
        });
      }
      const sim = arr(x.similar).slice(0, 2).map((y) => `≈ ${t(y.item, 40)}`);
      const dif = arr(x.different).slice(0, 2).map((y) => `≠ ${t(y.item, 40)}`);
      s.addText([...sim, ...dif].map((line) => ({ text: line, options: { breakLine: true, paraSpaceAfter: 3 } })), { x: cx, y: 4.95, w: cw, h: 1.45, fontFace: F, fontSize: 9, color: INK, valign: 'top' });
    });
  }

  /* 9 Concept 5 → 3 → 1 */
  if (R.concept && R.concept.proposals) {
    const c = R.concept;
    const s = newSlide('CONCEPT · THEME — 5안 → 1차 3안 → 브레인 검증 → 1안');
    headline(s, keyOf('concept', '').headline || '다섯 갈래에서 하나의 코어로');
    const props = arr(c.proposals).slice(0, 5);
    const picked = new Set(arr(c.first_round && c.first_round.picked));
    const w = (W - 2 * M - 0.15 * 4) / 5;
    props.forEach((p, i) => {
      const x = M + i * (w + 0.15);
      const fin = p.id === c.final_id;
      s.addShape(pptx.ShapeType.rect, { x, y: 1.9, w, h: 2.6, fill: { color: fin ? Y : PAPER }, line: { color: picked.has(p.id) ? INK : HAIR, width: picked.has(p.id) ? 1 : 0.75, dashType: picked.has(p.id) ? 'solid' : 'dash' } });
      s.addText([{ text: `${p.id}${fin ? '  ● 최종' : picked.has(p.id) ? '  1차' : ''}\n`, options: { fontSize: 9, bold: true, color: picked.has(p.id) ? INK : MUTE } }, { text: `${t(p.theme, 30)}\n\n`, options: { fontSize: 14, bold: true, color: picked.has(p.id) ? INK : MUTE } }, { text: t(p.concept, 80), options: { fontSize: 9, color: picked.has(p.id) ? INK : MUTE } }], { x: x + 0.12, y: 2.0, w: w - 0.24, h: 2.4, fontFace: F, valign: 'top' });
    });
    const ev = arr(c.brain_select && c.brain_select.evaluations);
    if (ev.length) {
      s.addTable([[{ text: '브레인 검증', options: { bold: true } }, ...arr(ev[0].scores).slice(0, 6).map((x) => ({ text: x.lens, options: { bold: true } })), { text: '합', options: { bold: true } }],
        ...ev.map((e) => [{ text: e.id + (e.id === c.final_id ? ' ●' : '') }, ...arr(e.scores).slice(0, 6).map((x) => ({ text: String(x.score) })), { text: String(e.total ?? '') }])],
      { x: M, y: 4.75, w: W - 2 * M, fontFace: F, fontSize: 10, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.32, align: 'center' });
    }
  }

  /* 10 최종 Concept · Theme */
  if (R.concept && R.concept.concept) {
    const c = R.concept;
    const s = newSlide('FINAL CONCEPT · THEME');
    s.addText(t(c.theme, 40), { x: M, y: 0.9, w: W - 2 * M, h: 1.3, fontFace: F, fontSize: 44, bold: true, color: INK });
    s.addShape(pptx.ShapeType.rect, { x: M, y: 2.2, w: 1.2, h: 0.08, fill: { color: Y }, line: { color: Y } });
    s.addText(t(c.concept, 140), { x: M, y: 2.45, w: W - 2 * M, h: 0.8, fontFace: F, fontSize: 17, color: INK });
    const pc = arr(c.philosophy_core).slice(0, 5);
    if (pc.length) s.addTable(pc.map((x) => [{ text: x.lens, options: { bold: true, fontSize: 11 } }, { text: t(x.how, 100), options: { fontSize: 11 } }]), { x: M, y: 3.5, w: 7.2, colW: [1.6, 5.6], fontFace: F, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.45 });
    const tm = c.tone_manner || {};
    [['컬러', tm.color], ['무드', tm.mood], ['비주얼', tm.visual_style], ['타이포', tm.typography]].forEach(([l, v], i) => {
      const y = 3.5 + i * 0.68;
      s.addShape(pptx.ShapeType.rect, { x: 8.2, y, w: W - M - 8.2, h: 0.6, fill: { color: PAPER2 }, line: { color: PAPER2 } });
      s.addText([{ text: `${l}  `, options: { color: MUTE, fontSize: 9, bold: true } }, { text: t(v && v.desc, 50), options: { fontSize: 10 } }], { x: 8.3, y, w: W - M - 8.4, h: 0.6, fontFace: F, color: INK, valign: 'middle' });
    });
    s.addText(arr(c.keywords).map((x) => `#${x}`).join('   '), { x: M, y: 6.3, w: W - 2 * M, h: 0.4, fontFace: F, fontSize: 12, color: MUTE });
  }

  /* 설계 — 범위 커버리지 · 조형 언어 · 콘텐츠 */
  const BP = R.creative && R.creative.blueprint;
  if (BP) {
    const scope = arr(R.brief && R.brief.scope);
    {
      const s = newSlide('설계 — 컨셉 하나에서 사업 범위 전체로');
      headline(s, t(BP.summary, 80));
      const secs = arr(BP.sections).slice(0, 8);
      if (scope.length && secs.length) {
        const rows = [[{ text: '범위', options: { bold: true } }, ...secs.map((x) => ({ text: t(x.label, 10), options: { bold: true, align: 'center' } }))],
          ...scope.slice(0, 9).map((sc) => [{ text: `${sc.id} ${t(sc.item, 34)}` }, ...secs.map((x) => ({ text: arr(x.items).some((it) => arr(it.scope_ids).includes(sc.id)) ? '●' : '', options: { align: 'center' } }))])];
        s.addTable(rows, { x: M, y: 2.0, w: W - 2 * M, fontFace: F, fontSize: 9, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.34, colW: [4.2, ...secs.map(() => (W - 2 * M - 4.2) / secs.length)] });
      }
      if (BP.baseline_gap) s.addText([{ text: '기본안에 없는 것  ', options: { bold: true } }, { text: t(arr(BP.baseline_gap.new).join('  ·  '), 160) }], { x: M, y: 6.2, w: W - 2 * M, h: 0.5, fontFace: F, fontSize: 10, color: INK });
    }
    {
      const s = newSlide('조형 언어 — 사조 원리가 무엇이 되었나');
      const fl = BP.form_language || {};
      headline(s, t(fl.shape || '원리에서 형태로', 60));
      const pr = arr(fl.principles).slice(0, 6);
      if (pr.length) s.addTable([[{ text: '근거', options: { bold: true } }, { text: '원리', options: { bold: true } }, { text: '무엇이 되었나', options: { bold: true } }], ...pr.map((x) => [{ text: t(x.from, 16) }, { text: t(x.principle, 30) }, { text: t(x.becomes, 70), options: { bold: true } }])],
        { x: M, y: 1.9, w: W - 2 * M, fontFace: F, fontSize: 10, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.4, colW: [1.8, 3.6, W - 2 * M - 5.4] });
      s.addText([['재료·마감', fl.material], ['빛', fl.light], ['색', fl.color], ['서체', fl.type], ['스케일', fl.scale]].filter((x) => x[1]).map(([k, v]) => ({ text: `${k}  ${t(v, 70)}`, options: { breakLine: true, paraSpaceAfter: 4 } })), { x: M, y: 4.9, w: W - 2 * M, h: 1.5, fontFace: F, fontSize: 10, color: INK, valign: 'top' });
    }
    if (arr(BP.content_modules).length) {
      const s = newSlide('콘텐츠 방향 — 화면·면에 실제로 보이는 것');
      headline(s, `콘텐츠 모듈 ${arr(BP.content_modules).length}개`);
      s.addTable([[{ text: '모듈', options: { bold: true } }, { text: '누구·언제', options: { bold: true } }, { text: '보이는 것', options: { bold: true } }, { text: '갱신', options: { bold: true } }],
        ...arr(BP.content_modules).slice(0, 8).map((x) => [{ text: t(x.name, 20), options: { bold: true } }, { text: t(x.for, 30) }, { text: t(x.shows, 80) }, { text: t(x.update, 20) }])],
      { x: M, y: 1.9, w: W - 2 * M, fontFace: F, fontSize: 10, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.42, colW: [2.2, 2.6, W - 2 * M - 6.6, 1.8] });
    }
  }

  /* 11~ Creative 가이드 */
  if (R.creative) {
    const ex = arr(R.creative.examples);
    ex.forEach((e, i) => {
      const s = newSlide(`핵심 장면 ${i + 1} / ${ex.length} — ${t(e.touchpoint || e.direction, 40)}`);
      const imgAbs = e.imageFile ? store.resolveProjectFile(project.id, e.imageFile) : null;
      if (imgAbs && /\.(png|jpe?g)$/i.test(imgAbs)) s.addImage({ path: imgAbs, x: M, y: 0.8, w: 6.2, h: 4.13, sizing: { type: 'cover', w: 6.2, h: 4.13 } });
      else { s.addShape(pptx.ShapeType.rect, { x: M, y: 0.8, w: 6.2, h: 4.13, fill: { color: PAPER2 }, line: { color: INK, width: 0.75 } }); s.addText('콘셉트 비주얼 — 생성 이미지 없음', { x: M, y: 2.6, w: 6.2, h: 0.4, fontFace: F, fontSize: 11, align: 'center', color: MUTE }); }
      const d = e.detail || {};
      s.addText([{ text: `${t(e.title, 30)}\n`, options: { fontSize: 11, color: MUTE, bold: true } }, { text: `${t(e.headline, 40)}\n`, options: { fontSize: 24, bold: true } }, { text: `${t(e.subcopy, 70)}\n\n`, options: { fontSize: 12 } }, { text: `코어에서 — ${t(e.derived_from_core, 80)}`, options: { fontSize: 10, color: MUTE } }], { x: 7.1, y: 0.8, w: W - M - 7.1, h: 2.6, fontFace: F, color: INK, valign: 'top' });
      s.addTable([['앵글', t(d.angle, 40)], ['뷰', t(d.view, 40)], ['빛', t(d.light, 40)], ['질감', t(d.texture, 40)]].map(([a, b]) => [{ text: a, options: { color: MUTE } }, { text: b }]), { x: 7.1, y: 3.5, w: W - M - 7.1, colW: [0.9, W - M - 8.0], fontFace: F, fontSize: 9, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.34 });
      const st = arr(e.structure).slice(0, 5).map((x, k) => `${String(k + 1).padStart(2, '0')}  ${t(x.name, 16)} — ${t(x.content, 50)}`);
      s.addText(st.join('\n'), { x: M, y: 5.1, w: 6.2, h: 1.5, fontFace: F, fontSize: 10, color: INK, valign: 'top' });
      s.addText([{ text: 'DO  ', options: { bold: true } }, { text: `${t(arr(e.do).join(' · '), 90)}\n`, options: {} }, { text: "DON'T  ", options: { bold: true } }, { text: t(arr(e.dont).join(' · '), 90), options: {} }], { x: 7.1, y: 5.1, w: W - M - 7.1, h: 1.5, fontFace: F, fontSize: 10, color: INK, valign: 'top' });
    });
  }

  /* 브레인 */
  {
    const k = keyOf('brain', '판단 브레인이 지킨 것');
    const s = newSlide('THE FROM 판단 브레인 — 방향 제시 · 검증');
    headline(s, k.headline);
    const rows = Object.entries(run.brain || {}).filter(([, v]) => v && (v.verify || v.direct)).map(([id, v]) => [
      { text: id, options: { bold: true } },
      { text: t(v.direct && v.direct.direction, 70) },
      { text: v.verify ? v.verify.verdict : '—', options: { bold: true, fill: v.verify && v.verify.verdict === '통과' ? { color: Y } : undefined } },
      { text: t(v.verify && (arr(v.verify.issues)[0] || arr(v.verify.strengths)[0]), 60) },
    ]);
    if (rows.length) s.addTable([[{ text: '단계', options: { bold: true } }, { text: '방향 제시', options: { bold: true } }, { text: '판정', options: { bold: true } }, { text: '핵심 지적', options: { bold: true } }], ...rows], { x: M, y: 1.8, w: W - 2 * M, colW: [1.4, 5.4, 1.0, W - 2 * M - 7.8], fontFace: F, fontSize: 9, color: INK, border: { type: 'solid', color: HAIR, pt: 0.5 }, rowH: 0.42 });
    bullets(s, k.bullets, { x: M, y: 5.6, w: W - 2 * M, h: 0.9 });
  }

  /* 다음 */
  {
    const k = keyOf('next', '사람이 판정할 것');
    const s = newSlide('NEXT — 사람의 판정');
    headline(s, k.headline);
    bullets(s, [...new Set([...arr(k.bullets), ...arr(R.creative && R.creative.human_todo)])].slice(0, 6), { x: M, y: 1.9, w: W - 2 * M, h: 3.5 });
    s.addText('AI의 판정은 모두 예비 판정입니다. C 게이트와 조형 완성도의 최종 판정은 사람이 합니다.', { x: M, y: 5.8, w: W - 2 * M, h: 0.4, fontFace: F, fontSize: 10, color: MUTE });
  }
  return pptx;
}

async function exportPpt(projectId) {
  const p = store.get(projectId);
  if (!p) throw new Error('project not found');
  const pptx = build(p);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(store.projectDir(projectId), `FREATIVE_${p.name.replace(/[\\/:*?"<>|]/g, '_')}_${stamp}.pptx`);
  await pptx.writeFile({ fileName: file });
  return { file, exists: fs.existsSync(file) };
}

module.exports = { exportPpt, build };
