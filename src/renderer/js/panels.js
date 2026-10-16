// 단계별 상세 패널 — 플랫 디자인 · 구조 도식 (좁혀가는 형태)
import { esc, arr } from './util.js';
import { ismIcon } from './art.js';

const NO = { brief: '01', canvas: '02', airplane: '03', tunnel: '04', positioning: '05', forpop: '06', concept: '07', creative: '08' };

function head(stage, title, sub, line) {
  return `<div class="sec-head"><div class="no">${NO[stage]}</div><div class="tt"><h3 class="h3">${esc(title)}</h3><small>${esc(sub)}</small></div>${line ? `<div class="painter-line">${esc(line)}</div>` : '<div></div>'}</div><!--/head-->`;
}
const src = (s) => `<span class="src ${/확인 필요|없음/.test(s || '') ? 'need' : ''}">${esc(s || '추론')}</span>`;
const ul = (xs, cls = '') => `<ul class="ul ${cls}">${arr(xs).map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ul>`;
function waiting(text = '화가와 조수들이 작업 중입니다') {
  return `<div class="empty"><svg viewBox="0 0 120 80"><path d="M10 70 H110"/><circle cx="40" cy="40" r="10"/><path d="M40 50 V66 M30 56 L40 52 L50 56"/><rect x="62" y="20" width="40" height="30"/></svg><div>${esc(text)}<span class="blink">_</span></div></div>`;
}

/* ---------- 01 brief ---------- */
function brief(p, run, ctx) {
  const b = run.results.brief;
  if (!b) return head('brief', '미션 접수', '브리프 게이트 — 화가가 접수 폼과 첨부를 읽습니다') + waiting('미션 편지를 읽는 중');
  const m = b.mission || {};
  const rows = [['결과물', m.deliverable], ['목적', m.objective], ['타겟', m.target], ['제품·서비스', m.product], ['채널', m.channel], ['디바이스', m.device], ['핵심 순간', m.key_moment], ['브랜드', m.brand], ['성공 기준', m.success]];
  const q = run.stages.brief.status === 'waiting' ? questions(b) : '';
  const models = run.models || {};
  const plan = b.plan || {};
  const nIsm = arr(plan.isms).length, nLy = arr(plan.layers).length;
  return `${head('brief', '미션 접수', `브리프 게이트 · ${b.gate} — ${b.gate_reason || ''}`, plan.note)}
  ${q}
  <div class="grid g3" style="margin-top:${q ? 24 : 0}px">
    <div class="card" style="grid-column: span 2">
      <div class="row"><span class="kicker">MISSION</span>${b.gate === '통과' || b.gate === '진행 가능' ? '<span class="tag">게이트 통과</span>' : `<span class="tag y">${esc(b.gate)}</span>`}</div>
      <h3 class="h3">${esc(m.title || p.name)}</h3>
      <p class="lead">${esc(m.one_line || '')}</p>
      <dl class="kv">${rows.filter((r) => r[1]).map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
      ${arr(m.constraints).length ? `<div><span class="kicker">지킬 것 · 금지</span>${ul(m.constraints)}</div>` : ''}
    </div>
    <div class="card ink">
      <span class="kicker" style="color:#BDB9AF">ORCHESTRATION</span>
      <div><b>화가</b> · 메인 모델 <span class="mono">${esc(models.director || '')}</span><br/><span class="muted">미션 접수 · 착륙 정리 · 출구 · 포지셔닝 · FoR/PoP/PoD · 컨셉 · 가이드</span></div>
      <div><b>판단 브레인</b> · <span class="mono">${esc(models.brain || models.director || '')}</span><br/><span class="muted">단계마다 방향 제시 · 검증 · 발상의 전환 · 컨셉 자체 검증</span></div>
      <div><b>조수 ×${nIsm}</b> · 시간 여행자 <span class="mono">${esc(models.sub || '')}</span><br/><span class="muted">사조 1개씩 병렬 채집</span></div>
      <div><b>조수 ×${nLy}</b> · 레이어 분석가 <span class="mono">${esc(models.sub || '')}</span><br/><span class="muted">${arr(plan.layers).map((l) => esc(l.label)).join(' · ')} 병렬</span></div>
      <div><b>조수</b> · 이미지 <span class="mono">${esc(models.image || '')}</span><br/><span class="muted">Creative 예시 콘셉트 비주얼</span></div>
      ${arr(run.modelPlan).length ? `<div><b>화가의 모델 배정</b>${arr(run.modelPlan).map((m) => `<div style="font-size:12px"><span class="mono">${esc(m.stage)}·${esc(m.role)}</span> → <span class="mono">${esc(m.model)}</span>${m.effort ? ` (${esc(m.effort)})` : ''} <span class="muted">${esc(m.why)}</span></div>`).join('')}</div>` : ''}
      <div class="mono" style="color:#BDB9AF">calls ${run.usage ? run.usage.calls : 0} · tokens ${run.usage ? (run.usage.prompt + run.usage.completion).toLocaleString() : 0} · $${run.usage ? (run.usage.cost || 0).toFixed(3) : '0'}</div>
    </div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card soft"><span class="kicker">가정 — 도출했지만 확인할 것</span>${arr(b.assumptions).map((a) => `<div style="font-size:13px">${esc(a.item)} ${src(a.basis)}</div>`).join('') || '<span class="muted">없음</span>'}</div>
    <div class="card soft"><span class="kicker">첨부에서 읽은 것</span>${arr(b.attachment_insights).map((a) => `<div style="font-size:13px"><span class="mono">${esc(a.file)}</span><br/>${esc(a.takeaway)}</div>`).join('') || '<span class="muted">첨부 없음</span>'}</div>
    <div class="card soft"><span class="kicker">여행 계획</span>${arr(plan.isms).map((i) => `<div style="font-size:13px"><span class="mono">${esc(i.id)}</span> ${esc(i.why)}</div>`).join('')}</div>
  </div>`;
}

function questions(b) {
  return `<form class="qform" data-form="brief">
    <div class="row"><span class="tag y">브리프 게이트 · ${esc(b.gate)}</span><span class="muted" style="font-size:13px">${esc(arr(b.missing).join(', '))} — 화가가 판단하려면 답이 필요합니다 (최대 3개)</span></div>
    ${arr(b.questions).map((q) => `<div class="qq"><b><span class="mono">${esc(q.star || '')}</span> ${esc(q.q)}</b>
      <div class="chips">${arr(q.options).map((o) => `<button type="button" class="chip" data-pick="${esc(q.id)}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <input class="input" name="${esc(q.id)}" placeholder="직접 쓰기 (선택지를 고르면 자동 입력)" /></div>`).join('')}
    <div class="row"><button class="btn primary" type="submit">답하고 계속 →</button><span class="muted" style="font-size:12px">★1·★2·★3은 가정으로 채우지 않습니다 — 스킬의 원칙</span></div>
  </form>`;
}

/* ---------- 02 canvas ---------- */
function canvas(p, run) {
  const c = run.results.canvas;
  if (!c) return head('canvas', '캔버스', 'S0 정의 — 컨셉을 한 문장으로') + waiting('캔버스를 펼치는 중');
  return `${head('canvas', '캔버스', 'S0 정의 — [대상]이 [상황]에서 [무엇]을 [어떻게] 느끼게 한다', c.painter_line)}
  ${c.from_me ? `<div class="card ink" style="margin-bottom:16px"><span class="kicker" style="color:#BDB9AF">나로부터 — 판단의 출발점</span><b style="font-size:22px;line-height:1.4">${esc(c.from_me)}</b></div>` : ''}
  <div class="grid g3">
    <div class="card" style="grid-column: span 2"><span class="kicker">컨셉 한 문장 · 초안</span><p class="concept-line">${esc(c.concept_draft)}</p>
      <div class="chips">${arr(c.thinking).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div></div>
    <div class="card fill"><span class="kicker">핵심 긴장</span><b style="font-size:16px;line-height:1.5">${esc(c.tension)}</b><span class="kicker" style="margin-top:8px">지킬 관성</span>${ul(c.inertia, 'plus')}</div>
  </div>
  <div class="card soft" style="margin-top:16px"><span class="kicker">반대 대상 — 관찰이어야 한다 (실례 없으면 실험적 해석을 쓰지 않는다)</span>
    <table class="tbl"><thead><tr><th>층위</th><th>지배 규범</th><th>우리가 어기는 지점</th><th>강도</th><th>실례</th></tr></thead><tbody>
    ${arr(c.oppositions).map((o) => `<tr><td><span class="tag">${esc(o.layer)}</span></td><td>${esc(o.norm)}</td><td>${esc(o.violation)}</td><td>${esc(o.strength)}</td><td>${src(o.evidence)}</td></tr>`).join('') || '<tr><td colspan="5">없음</td></tr>'}
    </tbody></table></div>`;
}

/* ---------- 03 airplane ---------- */
function airplane(p, run, ctx) {
  const a = run.results.airplane;
  const plan = (run.results.brief && run.results.brief.plan && run.results.brief.plan.isms) || [];
  if (!a) return head('airplane', 'Airplane — 사조 여행', '원리만 가져온다 · 두고 올 것도 적는다') + waiting('타임머신 비행기 이륙 준비');
  const sel = new Set(arr(a.synth && a.synth.selected));
  const dropped = Object.fromEntries(arr(a.synth && a.synth.dropped).map((d) => [d.id, d.why]));
  const cards = plan.map((pl) => {
    const t = arr(a.travels).find((x) => x.id === pl.id);
    const meta = arr(ctx.isms).find((i) => i.id === pl.id) || {};
    if (!t) return `<div class="ism dim"><div class="ism-top">${ismIcon(pl.id)}<div><b>${esc(meta.name || pl.id)}</b><small>${esc(pl.id)} · ${esc(meta.era || '')}</small></div></div><div class="ism-body">${waiting('여행 중')}</div></div>`;
    if (t.error) return `<div class="ism dim"><div class="ism-top">${ismIcon(pl.id)}<div><b>${esc(t.name)}</b><small>여행 실패</small></div></div><div class="ism-body">${esc(t.error)}</div></div>`;
    const isSel = sel.has(t.id), isDrop = dropped[t.id];
    return `<div class="ism ${a.synth && !isSel ? 'dim' : ''}">
      <div class="ism-top">${ismIcon(t.id)}<div><b>${esc(t.name)}</b><small>${esc(t.id)} · ${esc(t.era || meta.era || '')}</small></div></div>
      <div class="ism-body">
        <div class="postcard">“${esc(t.postcard || '')}”</div>
        <div><span class="kicker">가져올 것 — 원리</span>${ul(t.take, 'plus')}</div>
        <div><span class="kicker">두고 올 것</span>${ul(t.leave, 'minus')}</div>
        <div style="font-size:13px"><span class="kicker">이번 결과물에서</span><br/>${esc(t.apply || '')}</div>
        <div class="row"><span class="tag ${t.a3 && t.a3.pass ? '' : 'y'}">A3 ${t.a3 && t.a3.pass ? '원리 통과' : '코스튬 의심'}</span>${isSel ? '<span class="tag y">선택</span>' : isDrop ? `<span class="muted" style="font-size:12px">제외 — ${esc(isDrop)}</span>` : ''}</div>
      </div>
      <div class="ism-core"><span>${esc(t.core || '')}</span><span class="fit">fit ${Math.round((t.fit || 0) * 100)}</span></div>
    </div>`;
  }).join('');
  return `${head('airplane', 'Airplane — 사조 여행', `조수 ${plan.length}명이 시대별로 흩어져 원리를 채집합니다 · 형태가 아니라 원리`, a.synth && a.synth.painter_line)}
  <div class="grid ${plan.length > 4 ? 'g5' : plan.length === 4 ? 'g4' : 'g3'}">${cards}</div>
  ${a.synth ? `<div class="grid g3" style="margin-top:16px">
    <div class="card ink" style="grid-column: span 2"><span class="kicker" style="color:#BDB9AF">HYBRID — 근본 있는 하이브리드</span><p class="concept-line" style="margin:0">${esc(a.synth.hybrid)}</p>
      <div class="suitcase">${arr(a.synth.suitcase).map((s) => `<span class="tag" style="border-color:#F4F2EC">${esc(s)}</span>`).join('')}</div></div>
    <div class="card soft"><span class="kicker">함께 두고 올 것</span>${ul(a.synth.leave_together, 'minus')}</div></div>` : ''}`;
}

/* ---------- 04 tunnel ---------- */
function tunnel(p, run) {
  const t = run.results.tunnel;
  const plan = (run.results.brief && run.results.brief.plan && run.results.brief.plan.layers) || [];
  if (!t) return head('tunnel', 'Tunnel — 레이어링', '겹칠수록 정답의 범위가 좁아지고, 밝아진다') + waiting('차에 시동을 거는 중');
  const done = arr(t.layers).filter((l) => !l.error);
  const strip = `<div class="tunnel-strip" style="--n:${plan.length}">${plan.map((ly) => { const r = done.find((x) => x.key === ly.key); return `<i style="opacity:${r ? 0.1 : 0.9}"></i>`; }).join('')}</div>`;
  const cols = plan.map((ly, i) => {
    const r = arr(t.layers).find((x) => x.key === ly.key);
    if (!r) return `<div class="layer"><div class="lh"><span class="lno">${'①②③④⑤'[i]} ${esc(ly.label)}</span></div><div class="muted" style="font-size:13px">${esc(ly.question)}</div>${waiting('겹치는 중')}</div>`;
    if (r.error) return `<div class="layer"><div class="lh"><span class="lno">${'①②③④⑤'[i]} ${esc(ly.label)}</span></div><div>실패 — ${esc(r.error)}</div></div>`;
    const lights = Math.round((r.light || 0) * 5);
    return `<div class="layer">
      <div class="lh"><span class="lno">${'①②③④⑤'[i]} ${esc(r.label)}</span><span class="light">${[0, 1, 2, 3, 4].map((k) => `<i class="${k < lights ? 'on' : ''}"></i>`).join('')}</span></div>
      <h4>${esc(r.headline)}</h4>
      ${arr(r.insights).map((x) => `<div class="ins"><b>${esc(x.title)}</b><span>${esc(x.detail)}</span><div>${src(x.source)}</div></div>`).join('')}
      <div class="kc"><div><span class="kicker">지킬 것</span>${ul(r.keep, 'plus')}</div><div><span class="kicker">바꿀 것</span>${ul(r.change)}</div></div>
      ${r.boundary ? `<div style="font-size:12px;border-top:1px solid var(--hair);padding-top:8px"><span class="kicker">경계 조건</span><br/>${esc(r.boundary)}</div>` : ''}
      ${arr(r.need_evidence).length ? `<div style="font-size:12px"><span class="src need">사람 확인</span> ${arr(r.need_evidence).map(esc).join(' · ')}</div>` : ''}
    </div>`;
  }).join('');
  const s = t.synth;
  return `${head('tunnel', 'Tunnel — 레이어링', `레이어 ${plan.length}종 · 시장 · 브랜드 · 타겟 · 사용 습관 — 어둠(위) → 밝음`, s && s.painter_line)}
  <div class="stack">${strip}<div class="layers" style="grid-template-columns:repeat(${plan.length},minmax(0,1fr))">${cols}</div>
  ${s ? `<div class="grid g3">
    <div class="card ink"><span class="kicker" style="color:#BDB9AF">좁혀진 범위</span><b style="font-size:18px;line-height:1.45">${esc(s.narrowed)}</b><span class="muted">출구의 빛 — ${esc(s.exit_light)}</span></div>
    <div class="card"><span class="kicker">최종 지킬 것 · 관성 = 구조</span>${ul(s.keep, 'plus')}</div>
    <div class="card"><span class="kicker">최종 바꿀 것 · 해석</span>${ul(s.change)}${arr(s.conflicts).length ? `<span class="kicker" style="margin-top:8px">부딪힌 지점</span>${ul(s.conflicts)}` : ''}</div>
  </div>` : ''}</div>`;
}

/* ---------- 05 positioning ---------- */
function posmapSVG(p) {
  const S = 560, P = 64;
  const sx = (v) => P + ((v + 1) / 2) * (S - 2 * P);
  const sy = (v) => S - P - ((v + 1) / 2) * (S - 2 * P);
  const cutRound = {};
  arr(p.rounds).forEach((r, i) => arr(r.cut).forEach((id) => { cutRound[id] = i + 1; }));
  const fin = p.final && p.final.id;
  const ws = p.whitespace || { x: 0, y: 0 };
  return `<svg class="posmap" viewBox="0 0 ${S} ${S}" role="img" aria-label="Creative Positioning Map">
    <g fill="none" stroke="#141414">
      ${[0.25, 0.75].map((k) => `<path d="M${P + k * (S - 2 * P)},${P} V${S - P} M${P},${P + k * (S - 2 * P)} H${S - P}" stroke-opacity=".08"/>`).join('')}
      <path d="M${P},${S / 2} H${S - P} M${S / 2},${P} V${S - P}" stroke-width="1"/>
      <path d="M${S - P - 6},${S / 2 - 4} L${S - P},${S / 2} L${S - P - 6},${S / 2 + 4} M${S / 2 - 4},${P + 6} L${S / 2},${P} L${S / 2 + 4},${P + 6}"/>
    </g>
    <text x="${P}" y="${S / 2 - 8}" font-size="11" fill="#45433F">${esc(p.axes.x.low)}</text>
    <text x="${S - P}" y="${S / 2 - 8}" font-size="11" fill="#45433F" text-anchor="end">${esc(p.axes.x.high)}</text>
    <text x="${S / 2 + 8}" y="${S - P + 4}" font-size="11" fill="#45433F">${esc(p.axes.y.low)}</text>
    <text x="${S / 2 + 8}" y="${P + 4}" font-size="11" fill="#45433F">${esc(p.axes.y.high)}</text>
    <text x="${S / 2}" y="${S - 24}" font-size="11" text-anchor="middle" font-family="ui-monospace,monospace" fill="#141414">X · ${esc(p.axes.x.name)}</text>
    <text x="22" y="${S / 2}" font-size="11" text-anchor="middle" font-family="ui-monospace,monospace" transform="rotate(-90 22 ${S / 2})" fill="#141414">Y · ${esc(p.axes.y.name)}</text>
    <circle cx="${sx(ws.x)}" cy="${sy(ws.y)}" r="54" fill="#FFD23C" fill-opacity=".35" stroke="#141414" stroke-dasharray="4 4"/>
    <text x="${sx(ws.x)}" y="${sy(ws.y) + 70}" font-size="11" text-anchor="middle" font-weight="700">빈자리 · ${esc(ws.label)}</text>
    ${arr(p.players).map((q) => `<g><circle cx="${sx(q.x)}" cy="${sy(q.y)}" r="7" fill="#F4F2EC" stroke="#141414"/><text x="${sx(q.x) + 11}" y="${sy(q.y) + 4}" font-size="11" fill="#45433F">${esc(q.label)}</text></g>`).join('')}
    ${arr(p.territories).map((t) => {
      const isF = t.id === fin, isC = cutRound[t.id];
      return `<g><circle cx="${sx(t.x)}" cy="${sy(t.y)}" r="${isF ? 20 : 15}" fill="${isF ? '#FFD23C' : isC ? '#F4F2EC' : '#141414'}" stroke="#141414" stroke-width="${isF ? 2 : 1}" ${isC ? 'stroke-dasharray="3 3"' : ''}/>
        <text x="${sx(t.x)}" y="${sy(t.y) + 4}" font-size="11" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="700" fill="${isF || isC ? '#141414' : '#F4F2EC'}">${esc(t.id)}</text>
        <text x="${sx(t.x)}" y="${sy(t.y) - (isF ? 26 : 21)}" font-size="11" text-anchor="middle" font-weight="${isF ? 800 : 500}" fill="${isC ? '#8A867D' : '#141414'}">${esc(t.name)}${isC ? ` · R${isC}` : ''}</text></g>`;
    }).join('')}
  </svg>`;
}

function positioning(p, run) {
  const ps = run.results.positioning;
  if (!ps) return head('positioning', 'Creative Positioning Map', '빈자리를 찾고 5 → 4 → 3 → 1로 좁힌다') + waiting('언덕을 오르는 중');
  const ts = arr(ps.territories);
  const by = Object.fromEntries(ts.map((t) => [t.id, t]));
  // 라운드별 남은 영역
  let alive = ts.map((t) => t.id);
  const rows = [{ n: alive.length, ids: [...alive], cut: [] }];
  arr(ps.rounds).forEach((r) => {
    const cut = arr(r.cut);
    rows[rows.length - 1].cut = cut;
    rows[rows.length - 1].why = r;
    alive = alive.filter((id) => !cut.includes(id));
    rows.push({ n: alive.length, ids: [...alive], cut: [] });
  });
  const fin = ps.final && ps.final.id;
  const funnel = rows.map((row, i) => `
    <div class="fl"><div class="fl-n">${row.n}</div>
      <div class="fl-row">${row.ids.map((id) => {
        const t = by[id] || { id, name: id };
        const isCut = row.cut.includes(id);
        const isFinal = i === rows.length - 1 && id === fin;
        return `<div class="fl-box ${isCut ? 'cut' : ''} ${isFinal ? 'final' : ''}"><span class="id">${esc(id)}</span>${esc(t.name)}</div>`;
      }).join('')}</div></div>
    ${i < rows.length - 1 ? '<div class="fl-arrow">↓</div>' : ''}${row.why ? `<div class="fl-why"><span class="tag">${esc(row.why.criterion || '')}</span><span>${esc(arr(row.why.cut).join(', '))} 제외 — ${esc(row.why.reason)}</span></div>` : ''}`).join('');
  return `${head('positioning', 'Creative Positioning Map', '표현의 두 축 위에서 통상적 해석을 찍고, 빈자리를 찾는다 · 영역 5 → 4 → 3 → 1', ps.painter_line)}
  <div class="posmap-wrap">
    <div>${posmapSVG(ps)}
      <div class="legend" style="margin-top:12px"><span><i></i>통상적 해석(관습·경쟁)</span><span><i class="f"></i>후보 영역</span><span><i class="d"></i>탈락</span><span><i class="y"></i>선택 (예비)</span></div>
      <div class="ax-legend"><div><b>X</b> ${esc(ps.axes.x.name)} — 근거 ${esc(ps.axes.x.basis || '')}</div><div><b>Y</b> ${esc(ps.axes.y.name)} — 근거 ${esc(ps.axes.y.basis || '')}</div></div>
    </div>
    <div class="stack">
      <div><span class="kicker">NARROWING · 좁혀가기</span><div class="funnel" style="margin-top:12px">${funnel}</div></div>
      <div class="card ink"><span class="kicker" style="color:#BDB9AF">선택 — 예비 판정 · C 게이트에서 사람이 확정</span><b style="font-size:20px">${esc((by[fin] || {}).name || fin)}</b><span>${esc((by[fin] || {}).desc || '')}</span><span class="muted">${esc(ps.final && ps.final.reason)}</span></div>
      <div class="card soft"><span class="kicker">빈자리가 비어 있는 이유</span><span>${esc(ps.whitespace.why)}</span></div>
      <table class="tbl"><thead><tr><th>영역</th><th>관성</th><th>새로움</th><th>효익</th><th>브랜드</th><th>비용</th></tr></thead><tbody>
        ${ts.map((t) => `<tr><td><b>${esc(t.id)}</b> ${esc(t.name)}</td>${['inertia', 'novelty', 'benefit', 'brand', 'cost'].map((k) => `<td class="mono">${t.scores && t.scores[k] != null ? Math.round(t.scores[k] * 100) : '-'}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
    </div>
  </div>`;
}

/* ---------- 06 forpop — 최종 검증 · 발상의 전환 플로우 ---------- */
function forpopFlowSVG(f) {
  const W = 1240, H = 430;
  const cand = arr(f.pod_candidates).slice(0, 5);
  const s1 = arr(f.shifts)[0] || {}, s2 = arr(f.shifts)[1] || {};
  const mid = arr(s1.result).slice(0, 3);
  const cut1 = new Set(arr(s1.cut).map((c) => c.id));
  const cut2 = new Set(arr(s2.cut).map((c) => c.id));
  const core = f.core_pod || {};
  const bx = 24, bw = 250, bh = 46, mx = 470, d1 = 360, d2 = 805, cx = 1020, cy = H / 2;
  const yA = (i, n) => H / 2 + (i - (n - 1) / 2) * (bh + 18);
  const box = (x, y, id, item, cut, sub) => `<g><rect x="${x}" y="${y - bh / 2}" width="${bw}" height="${bh}" rx="6" fill="${cut ? '#F4F2EC' : '#F4F2EC'}" stroke="${cut ? '#ABA79D' : '#141414'}" ${cut ? 'stroke-dasharray="4 4"' : ''}/>
    <text x="${x + 12}" y="${y - 4}" font-size="10" font-family="ui-monospace,monospace" fill="${cut ? '#ABA79D' : '#8A867D'}">${esc(id)}${sub ? ` ← ${esc(sub)}` : ''}</text>
    <text x="${x + 12}" y="${y + 13}" font-size="13" font-weight="${cut ? 400 : 650}" fill="${cut ? '#ABA79D' : '#141414'}" ${cut ? 'text-decoration="line-through"' : ''}>${esc(String(item || '').slice(0, 19))}</text></g>`;
  const diamond = (x, sh, n) => `<g><path d="M${x},${cy - 46} L${x + 46},${cy} L${x},${cy + 46} L${x - 46},${cy} Z" fill="#141414"/>
    <text x="${x}" y="${cy - 4}" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" fill="#BDB9AF">SHIFT ${n}</text>
    <text x="${x}" y="${cy + 11}" text-anchor="middle" font-size="11" font-weight="800" fill="#F4F2EC">${esc((sh.shift && sh.shift.type) || '—')}</text>
    <text x="${x}" y="${cy + 66}" text-anchor="middle" font-size="11" font-weight="700" fill="#141414">${esc((sh.shift && sh.shift.name) || '')}</text>
    <text x="${x}" y="${cy + 82}" text-anchor="middle" font-size="10" fill="#8A867D">판단 브레인</text></g>`;
  let lines = '';
  cand.forEach((c, i) => { if (!cut1.has(c.id)) lines += `<path d="M${bx + bw},${yA(i, cand.length)} C${d1 - 60},${yA(i, cand.length)} ${d1 - 70},${cy} ${d1 - 46},${cy}" fill="none" stroke="#141414"/>`; });
  mid.forEach((c, i) => { lines += `<path d="M${d1 + 46},${cy} C${d1 + 70},${cy} ${mx - 40},${yA(i, mid.length)} ${mx},${yA(i, mid.length)}" fill="none" stroke="#141414"/>`; if (!cut2.has(c.id)) lines += `<path d="M${mx + bw},${yA(i, mid.length)} C${d2 - 60},${yA(i, mid.length)} ${d2 - 70},${cy} ${d2 - 46},${cy}" fill="none" stroke="#141414"/>`; });
  lines += `<path d="M${d2 + 46},${cy} H${cx - 120}" fill="none" stroke="#141414"/>`;
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="PoD 5에서 3에서 1로 — 발상의 전환">
    <text x="${bx}" y="22" font-size="11" font-weight="700" fill="#45433F">PoD 후보 · 5</text>
    <text x="${mx}" y="22" font-size="11" font-weight="700" fill="#45433F">전환 후 · 3</text>
    <text x="${cx}" y="22" font-size="11" font-weight="700" fill="#45433F" text-anchor="middle">코어 · 1</text>
    ${lines}
    ${cand.map((c, i) => box(bx, yA(i, cand.length), c.id, c.item, cut1.has(c.id))).join('')}
    ${mid.map((c, i) => box(mx, yA(i, mid.length), c.id, c.item, cut2.has(c.id), arr(c.from_ids).join('+'))).join('')}
    ${diamond(d1, s1, 1)}${diamond(d2, s2, 2)}
    <circle cx="${cx}" cy="${cy}" r="118" fill="#FFD23C" stroke="#141414"/>
    <text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="10" font-family="ui-monospace,monospace" fill="#141414">CORE PoD</text>
    <foreignObject x="${cx - 96}" y="${cy - 20}" width="192" height="90"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;font-weight:800;font-size:16px;line-height:1.35;color:#141414">${esc(core.item || '')}</div></foreignObject>
  </svg>`;
}

function shiftCard(sh, n) {
  if (!sh || !sh.shift) return '';
  const s = sh.shift;
  return `<div class="card brainy"><div class="row"><span class="brain-dot"></span><span class="kicker">발상의 전환 ${n} · 판단 브레인</span><span class="tag">${esc(s.type)}</span></div>
    <b style="font-size:17px">${esc(s.name)}</b>
    <div class="shift-q">“${esc(s.question)}”</div>
    <div class="shift-ft"><span>${esc(s.from)}</span><span class="arrow">→</span><b>${esc(s.to)}</b></div>
    <div style="font-size:13px;color:var(--ink-2)">${esc(s.reasoning)}</div>
    <div class="row">${arr(s.lenses).map((l) => `<span class="lens-chip">${esc(l)}</span>`).join('')}</div>
    ${arr(sh.cut).length ? `<div style="font-size:12px" class="muted">제외 — ${arr(sh.cut).map((c) => `${esc(c.id)} ${esc(c.reason)}`).join(' · ')}</div>` : ''}</div>`;
}

function forpop(p, run) {
  const f = run.results.forpop;
  if (!f) return head('forpop', 'FoR · PoP · PoD', '앞선 모든 단계의 최종 검증 · 발상의 전환 5 → 3 → 1') + waiting('지나온 길을 다시 걷는 중');
  const nShift = arr(f.shifts).length;
  return `${head('forpop', 'FoR · PoP · PoD', '앞선 모든 단계를 최종 검증하고, 발상의 전환으로 5 → 3 → 1 — 판단 브레인 공동 추론', f.painter_line)}
  <div class="stack">
    <div><span class="kicker">AUDIT — 앞선 모든 단계 최종 검증</span>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>단계</th><th>핵심</th><th>판정</th><th>이유</th><th>다음으로 이어지는 방식</th></tr></thead><tbody>
      ${arr(f.audit).map((a) => `<tr><td><b>${esc(a.stage)}</b></td><td>${esc(a.core)}</td><td><span class="tag ${a.verdict === '유지' ? '' : 'y'}">${esc(a.verdict)}</span></td><td>${esc(a.note)}</td><td class="muted">${esc(a.link)}</td></tr>`).join('')}</tbody></table>
      <div class="statement" style="margin-top:12px;font-size:16px">${esc(f.coherence || '')}</div></div>
    <div class="fpp">
      <span class="fpp-label">FoR · FRAME OF REFERENCE</span>
      <div class="fpp-for"><div><h3 class="h3">${esc((f.for || {}).frame)}</h3><span class="muted">${esc((f.for || {}).category)} · 관성의 출처 — ${esc((f.for || {}).inertia_source)}</span></div><span class="tag">구조는 여기서 지킨다</span></div>
      <div class="pop-band"><span class="fpp-label">PoP · 반드시 같아야 하는 것</span>
        ${arr(f.pop).map((x) => `<div class="pop-item"><b>${esc(x.item)}</b><small>없으면 ${esc(x.why)}</small></div>`).join('')}</div>
      ${nShift ? forpopFlowSVG(f) : waiting('판단 브레인이 발상의 전환을 추론하는 중')}
      ${f.core_pod && f.core_pod.statement ? `<div class="statement">${esc(f.core_pod.statement)}</div>` : ''}
      ${arr(f.rtb).length ? `<div class="row" style="font-size:12px"><span class="kicker">RTB · 믿을 이유</span>${arr(f.rtb).map((x) => `<span>${esc(x.fact)} ${src(x.source)}</span>`).join('<span class="muted">·</span>')}</div>` : ''}
    </div>
    <div class="grid g2">${shiftCard(arr(f.shifts)[0], 1)}${shiftCard(arr(f.shifts)[1], 2)}</div>
    ${arr(f.final_check).length ? `<div><span class="kicker">최종 점검 — 판단 브레인 · ${esc(f.verdict || '')}</span><div class="row" style="margin-top:8px">${arr(f.final_check).map((c) => `<span class="check ${c.ok ? 'ok' : ''}" title="${esc(c.note)}">${c.ok ? '✓' : '△'} ${esc(c.lens)} <span class="muted">${esc(c.note)}</span></span>`).join('')}</div></div>` : ''}
  </div>`;
}

/* ---------- 07 concept — 5 → 3 → 1 · C 게이트 ---------- */
function concept(p, run) {
  const c = run.results.concept;
  if (!c) return head('concept', 'Concept · Theme', '5안 → 1차 3안 → 브레인 자체 검증 → 1안 · C 게이트') + waiting('새 캔버스에 붓을 대는 중');
  const props = arr(c.proposals);
  const picked = new Set(arr(c.first_round && c.first_round.picked));
  const cutWhy = Object.fromEntries(arr(c.first_round && c.first_round.cut).map((x) => [x.id, x]));
  const sel = c.brain_select;
  const finalId = c.final_id || (sel && sel.final && sel.final.id);
  const ev = arr(sel && sel.evaluations);
  const lenses = ev.length ? arr(ev[0].scores).map((s) => s.lens) : [];
  const hist = (run.gates && run.gates.C && run.gates.C.history) || [];
  const tm = c.tone_manner || {};
  const ax = [['color', '컬러'], ['mood', '무드'], ['visual_style', '비주얼 스타일'], ['typography', '타이포']];
  const zones = arr(c.rough && c.rough.zones);
  const funnel = `<div class="c-funnel">
    <div class="c-row">${props.map((x) => `<div class="c-card ${picked.has(x.id) ? 'picked' : 'cut'} ${x.id === finalId ? 'final' : ''}">
      <span class="c-id">${esc(x.id)}${x.id === finalId ? ' · 최종' : picked.has(x.id) ? ' · 1차' : ''}</span>
      <b>${esc(x.theme)}</b><small>${esc(x.concept)}</small>
      ${picked.has(x.id) ? `<div class="c-phil"><span title="나로부터">${esc(x.from_me || '')}</span></div>` : `<div class="c-why">${esc((cutWhy[x.id] || {}).lens || '')} — ${esc((cutWhy[x.id] || {}).reason || '')}</div>`}</div>`).join('')}</div>
    <div class="c-steps"><span>5안 · 화가</span><span>→ 1차 3안 · 화가</span><span>→ 자체 검증 · 판단 브레인</span><span>→ 최종 1안 · C 게이트(사람)</span></div></div>`;
  const evTable = ev.length ? `<div class="card brainy"><div class="row"><span class="brain-dot"></span><span class="kicker">자체 검증 — 판단 브레인 (철학 렌즈 0~5)</span></div>
    <table class="tbl heat"><thead><tr><th>안</th>${lenses.map((l) => `<th>${esc(l)}</th>`).join('')}<th>합</th><th>위험</th></tr></thead><tbody>
    ${ev.map((e) => `<tr class="${e.id === finalId ? 'fin' : ''}"><td><b>${esc(e.id)}</b>${e.id === finalId ? ' ●' : ''}</td>${arr(e.scores).map((s) => `<td><span class="heat-c h${Math.max(0, Math.min(5, Math.round(s.score)))}" title="${esc(s.note)}">${esc(s.score)}</span></td>`).join('')}<td class="mono">${esc(e.total)}</td><td class="muted">${esc(e.risk)}</td></tr>`).join('')}</tbody></table>
    ${sel.final ? `<div><b>최종 ${esc(sel.final.id)}</b> — ${esc(sel.final.why)}</div>${arr(sel.final.refine).length ? `<span class="kicker">다듬기 지시</span>${ul(sel.final.refine)}` : ''}` : ''}</div>` : '';
  if (!c.concept) return `${head('concept', 'Concept · Theme', '5안 → 1차 3안 → 브레인 자체 검증 → 1안 · C 게이트', c.painter_line)}<div class="stack">${funnel}${evTable}${waiting('최종 컨셉 키트를 그리는 중')}</div>`;
  return `${head('concept', 'Concept · Theme', '더프롬 철학이 코어 — 5안 → 1차 3안 → 브레인 자체 검증 → 1안 · C 게이트', c.painter_line)}
  <div class="stack">
    ${funnel}
    ${evTable}
    <div class="concept-hero">
      <div class="stack">
        <div><span class="kicker">FINAL THEME</span><h2 class="theme-big">${esc(c.theme)}</h2></div>
        <div><span class="kicker">CONCEPT</span><p class="concept-line" style="margin:4px 0 0">${esc(c.concept)}</p></div>
        <div class="chips">${arr(c.keywords).map((k) => `<span class="chip on">${esc(k)}</span>`).join('')}</div>
        ${c.metaphor ? `<div class="muted">메타포 — ${esc(c.metaphor.metaphor || c.metaphor)} ${c.metaphor.source ? src(c.metaphor.source) : ''}</div>` : ''}
        ${c.revision_note ? `<div class="card fill"><span class="kicker">수정 반영</span>${esc(c.revision_note)}</div>` : ''}
      </div>
      <div class="phil-grid">${arr(c.philosophy_core).map((x) => `<div class="phil"><span class="kicker">${esc(x.lens)}</span><span>${esc(x.how)}</span></div>`).join('')}</div>
    </div>
    <div><span class="kicker">TONE &amp; MANNER = 컬러 × 무드 × 비주얼 스타일 × 타이포</span>
      <div class="tm" style="margin-top:8px">${ax.map(([k, l]) => `<div><span class="ax">${l}</span><b>${esc((tm[k] || {}).desc || '-')}</b><span class="mono muted">${esc(arr((tm[k] || {}).ids).join(' '))}</span></div>`).join('')}</div></div>
    <div class="grid g2" style="align-items:start">
      <div><span class="kicker">해석표 — 지킬 것 / 바꿀 것 / 사람이 얻는 것</span>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>접점</th><th>지킬 것</th><th>바꿀 것</th><th>얻는 것</th></tr></thead><tbody>
        ${arr(c.interpretation).map((x) => `<tr><td><b>${esc(x.touchpoint)}</b></td><td>${esc(x.keep)}</td><td>${esc(x.change)}</td><td class="${x.gain ? '' : 'empty-gain'}">${esc(x.gain || '— 개살구')}</td></tr>`).join('')}</tbody></table>
        <span class="kicker" style="display:block;margin-top:20px">효익 시각화</span>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>접점</th><th>과업</th><th>보이게 할 것</th><th>형식</th><th>효익 지표</th></tr></thead><tbody>
        ${arr(c.benefit).map((x) => `<tr><td>${esc(x.touchpoint)}</td><td>${esc(x.task)}</td><td>${esc(x.visible)}</td><td class="mono">${esc(x.format)}</td><td>${esc(x.metric)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div><span class="kicker">러프 1장 — ${esc((c.rough && c.rough.touchpoint) || '주인공 접점')}</span>
        <div class="rough" style="margin-top:8px">${zones.map((z) => `<div class="zone" style="flex:${Math.max(1, parseInt(z.size, 10) || 20)}"><b>${esc(z.name)}</b><span>${esc(z.position)} · ${esc(z.size)}</span><span class="muted">${esc(z.content)}</span></div>`).join('')}</div>
        <div class="card soft" style="margin-top:12px"><span class="kicker">C 게이트 질문</span>${ul(c.gate_questions)}<span class="muted" style="font-size:12px">다음 단계 비용 — ${esc(c.next_cost || '')}</span>
        ${hist.length ? `<span class="kicker" style="margin-top:8px">판정 기록</span>${hist.map((h) => `<div style="font-size:12px"><span class="mono">${esc((h.at || '').slice(5, 16).replace('T', ' '))}</span> ${esc(h.decision === 'go' ? 'GO' : h.decision === 'revise' ? '수정' : '중단')}${h.preliminary ? ' (예비)' : ''}${h.by ? ` · ${esc(h.by)}` : ''} — ${esc(h.note)}</div>`).join('')}` : ''}</div>
      </div>
    </div>
  </div>`;
}

/* ---------- 08 creative — 가이드 3~5 ---------- */
function creative(p, run) {
  const c = run.results.creative;
  if (!c) {
    const st = run.stages.concept && run.stages.concept.status;
    return head('creative', 'Creative 가이드', '최소 3종 · 필요 시 5종 — 같은 코어에서 파생') + waiting(st === 'waiting' ? 'C 게이트 판정을 기다립니다 — 아래에서 판정해 주세요' : '갤러리를 준비하는 중');
  }
  const rec = c.selection && c.selection.recommended;
  const agents = arr(run.agents).filter((a) => a.role === 'image' && a.status === 'working');
  const ex = arr(c.examples);
  const cards = ex.map((e, i) => {
    const isRec = rec && (rec === e.title || String(rec).includes(e.title));
    const gen = agents.some((a) => a.task === e.title);
    const v = e.visual || {}, d = e.detail || {};
    return `<article class="ex ${isRec ? 'rec' : ''}">
      <div class="ex-img">${e.image ? `<img src="${esc(e.image)}" alt="${esc(e.title)} 콘셉트 비주얼 초안"/>` : `<div class="ph">${gen ? '이미지 조수가 그리는 중…' : e.imageError ? `이미지 생성 실패 — ${esc(e.imageError).slice(0, 80)}` : '이미지 없음'}</div>`}
        ${e.image_prompt ? `<button class="btn xs regen" data-act="regen" data-i="${i}" ${gen ? 'disabled' : ''}>${e.image ? '다시 그리기' : '그리기'}</button>` : ''}</div>
      <div class="ex-body">
        <div class="ex-dir"><span>${String(i + 1).padStart(2, '0')} · ${esc(e.direction)}</span>${isRec ? '<span class="tag y">권장 · 예비</span>' : ''}</div>
        <span class="kicker">${esc(e.title)}</span>
        <h3 class="ex-head">${esc(e.headline || '')}</h3>
        ${e.subcopy ? `<div style="font-size:15px">${esc(e.subcopy)}</div>` : ''}
        ${e.cta ? `<div><span class="tag">CTA · ${esc(e.cta)}</span></div>` : ''}
        <div class="derive"><span class="kicker">코어에서 파생 (1U)</span>${esc(e.derived_from_core || e.one_liner || '')}</div>
        <dl class="kv2">${[['구도', v.composition], ['그리드·레이아웃', v.grid_layout], ['컬러', v.color], ['타이포', v.type], ['요소', v.elements], ['모션', v.motion], ['방법론', e.method_shows_in]].filter((x) => x[1]).map((x) => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
        <div class="detail3"><span class="kicker">이미지 가이드 — 디테일 3층 (노하우북 Lv.2-1)</span>
          <div class="d3">${[['앵글', d.angle], ['뷰', d.view], ['빛', d.light], ['질감', d.texture]].map(([l, x]) => `<div><small>${l}</small><b>${esc(x || '-')}</b></div>`).join('')}</div></div>
        <div class="structure">${arr(e.structure).map((s, k) => `<div><span class="n">${String(k + 1).padStart(2, '0')}</span><b>${esc(s.name)}<br/><span class="mono muted">${esc(s.unit)}</span></b><span>${esc(s.content)}${s.note ? ` <span class="muted">· ${esc(s.note)}</span>` : ''}</span></div>`).join('')}</div>
        <div class="dodont"><div><span class="kicker">DO</span>${ul(e.do, 'plus')}</div><div><span class="kicker">DON'T</span>${ul(e.dont, 'minus')}</div></div>
        <table class="tbl"><thead><tr><th>결정</th><th>명분</th><th>효익</th></tr></thead><tbody>
        ${arr(e.rationale).map((r) => `<tr><td>${esc(r.decision)}</td><td>${esc(r.reason)}</td><td class="${r.gain ? '' : 'empty-gain'}">${esc(r.gain || '— 개살구')}</td></tr>`).join('')}</tbody></table>
        ${arr(e.knowhow_used).length ? `<div class="row">${arr(e.knowhow_used).map((k) => `<span class="lens-chip">${esc(k)}</span>`).join('')}</div>` : ''}
        ${e.image_prompt ? `<details class="prompt"><summary>이미지 프롬프트</summary><p>${esc(e.image_prompt)}</p></details>` : ''}
      </div></article>`;
  }).join('');
  return `${head('creative', `Creative 가이드 ${ex.length}종`, 'A · 시스템 주도(대조군) / B · 경험 주도(본안) — 모두 같은 컨셉 코어에서 파생', c.painter_line)}
  <div class="grid ${ex.length >= 3 ? 'g3' : 'g2'}" style="align-items:start">${cards}</div>
  <div class="grid g3" style="margin-top:20px">
    <div class="card ink"><span class="kicker" style="color:#BDB9AF">권장 — 예비</span><b style="font-size:18px">${esc(rec || '')}</b><span>${esc(c.selection && c.selection.why)}</span></div>
    <div class="card"><span class="kicker">예비 판정 — 사람이 확정</span>${arr(c.prelim_review).map((r) => `<div style="font-size:13px"><span class="tag ${/보완/.test(r.status) ? 'y' : ''}">${esc(r.gate)} · ${esc(r.status)}</span> ${esc(r.note)}</div>`).join('')}</div>
    <div class="card"><span class="kicker">사람이 할 일</span>${ul(c.human_todo)}</div>
  </div>`;
}

/* ---------- 판단 브레인 카드 · 영감 입력 ---------- */
const VERDICT_CLS = { 통과: 'ok', 보완: 'warn', 재작업: 'redo' };
function brainCard(run, stage, lensNames) {
  const b = run.brain && run.brain[stage];
  if (!b || (!b.direct && !b.verify)) return '';
  const d = b.direct || {}, v = b.verify;
  const working = arr(run.agents).some((a) => a.stage === stage && a.key === 'brain' && a.status === 'working');
  return `<section class="brain-card">
    <div class="brain-h"><span class="brain-orb"></span><b>THE FROM 판단 브레인</b><span class="muted">철학을 렌즈로 — 방향을 제시하고, 검증한다</span>${working ? '<span class="pulse"></span>' : ''}
      ${arr(b.attempts).length > 1 ? `<span class="attempts">${arr(b.attempts).map((a) => `<span class="v ${VERDICT_CLS[a.verdict] || ''}">${esc(a.verdict)}</span>`).join('<span class="muted">→</span>')}</span>` : ''}</div>
    <div class="brain-body">
      <div class="brain-col">
        <span class="kicker">방향 제시</span>
        <p class="brain-dir">${esc(d.direction || '—')}</p>
        ${arr(d.lens_guides).map((g) => `<div class="lg"><span class="lens-chip">${esc(lensNames[g.lens] || g.lens)}</span>${esc(g.guide)}</div>`).join('')}
        ${arr(d.must).length || arr(d.avoid).length ? `<div class="dodont"><div><span class="kicker">반드시</span>${ul(d.must, 'plus')}</div><div><span class="kicker">피할 것</span>${ul(d.avoid, 'minus')}</div></div>` : ''}
        ${arr(d.knowhow).length ? `<div><span class="kicker">이 단계에 쓴 더프롬 노하우</span><div class="kh-list">${arr(d.knowhow).map((k) => `<div><span class="lens-chip">${esc(k.id)}</span>${esc(k.use)}</div>`).join('')}</div></div>` : ''}
        ${d.shift_hint ? `<div class="muted" style="font-size:12px">발상의 전환 힌트 — ${esc(d.shift_hint)}</div>` : ''}
      </div>
      <div class="brain-col">
        <span class="kicker">검증</span>
        ${v ? `<div class="verdict ${VERDICT_CLS[v.verdict] || ''}">${esc(v.verdict)}</div>
          <div class="scores">${arr(v.scores).map((s) => `<div class="sc"><span>${esc(lensNames[s.lens] || s.lens)}</span><i><b style="width:${Math.max(0, Math.min(5, s.score)) * 20}%"></b></i><em>${esc(s.score)}</em><small>${esc(s.note)}</small></div>`).join('')}</div>
          ${arr(v.issues).length ? `<span class="kicker">지적</span>${ul(v.issues)}` : ''}
          ${arr(v.fixes).length ? `<span class="kicker">${v.verdict === '보완' ? '다음 단계로 넘기는 보완점' : '고칠 점'}</span>${ul(v.fixes)}` : ''}` : `<div class="muted">${working ? '검증 중…' : '이 단계가 끝나면 검증합니다'}</div>`}
      </div>
    </div></section>`;
}

function inspireBox(run, stage) {
  const st = run.stages[stage] || {};
  if (run.status === 'running' || !['done', 'waiting'].includes(st.status)) return '';
  const prev = arr(run.inspirations).filter((i) => i.stage === stage);
  return `<form class="inspire" data-form="inspire" data-stage="${stage}">
    <div class="inspire-h"><span class="spark">✦</span><b>영감</b><span class="muted">이 단계 리포트를 보고 떠오른 것을 적으면, 화가와 브레인이 이 단계부터 다시 그립니다. 이전 결과는 버전으로 남습니다.</span></div>
    ${prev.length ? `<div class="inspire-prev">${prev.map((i) => `<div><span class="mono">${esc((i.at || '').slice(5, 16).replace('T', ' '))}</span>${i.by ? ` ${esc(i.by)}` : ''} — ${esc(i.text)}</div>`).join('')}</div>` : ''}
    <div class="inline"><textarea class="textarea box" name="text" rows="2" placeholder="예) 대기 줄 자체를 경험으로 보고 싶다 / 바우하우스도 여행해 봐 / 축을 '소리'로 바꿔 보자"></textarea><button class="btn primary" type="submit">이 단계부터 다시 →</button></div>
  </form>`;
}

const BASE = { brief, canvas, airplane, tunnel, positioning, forpop, concept, creative };
/** 단계 패널 = 단계 결과 + 판단 브레인 카드 + 영감 입력 */
export const RENDER = Object.fromEntries(Object.entries(BASE).map(([k, fn]) => [k, (p, run, ctx) => {
  const html = fn(p, run, ctx);
  const m = html.indexOf('<!--/head-->');
  const cut = m >= 0 ? m + 12 : 0;
  return html.slice(0, cut) + brainCard(run, k, ctx.lensNames || {}) + html.slice(cut) + inspireBox(run, k);
}]));

/** 하단 게이트 바 */
export function gateBar(run) {
  if (!run) return '';
  if (run.status === 'paused' && run.pausedAt === 'C') {
    return `<div class="gatebar"><div class="ttl"><span class="dot y"></span>C 게이트 · 컨셉 판정</div>
      <textarea class="textarea box" id="gateNote" placeholder="판정 의견 (수정이면 무엇을 바꿀지)"></textarea>
      <button class="btn" data-act="gate" data-d="stop">중단</button>
      <button class="btn" data-act="gate" data-d="revise">수정 요청</button>
      <button class="btn go" data-act="gate" data-d="go">GO — Creative 예시로 →</button></div>`;
  }
  return '';
}
