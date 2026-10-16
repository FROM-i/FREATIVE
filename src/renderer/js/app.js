// THE FROM FREATIVE — 렌더러 진입점
import { esc, $, $$, toast, fmtDate, STATUS_KO, arr } from './util.js';
import { renderIntake } from './intake.js';
import { Journey } from './journey.js';
import { RENDER, gateBar } from './panels.js';
import { renderLibrary } from './library-view.js';

const api = window.api;
const S = {
  view: 'intake', info: null, user: null, types: null, isms: [], settings: null, knowledge: null,
  project: null, run: null, selStage: null, pinnedStage: false, journey: null, offRun: null,
};
const view = $('#view');

/* ---------- boot ---------- */
async function loadCatalog() {
  const c = await api.library.catalog();
  S.brain = c.brain;
  S.lensNames = Object.fromEntries((c.brain.lenses || []).map((l) => [l.id, l.name]));
  S.isms = c.isms;
}
const usd = (v) => `$${(v || 0).toFixed((v || 0) < 1 ? 3 : 2)}`;
const krw = (v) => `₩${Math.round((v || 0) * ((S.settings && S.settings.krwPerUsd) || 1400)).toLocaleString()}`;
async function boot() {
  [S.info, S.user, S.types, S.isms, S.settings, S.knowledge] = await Promise.all([
    api.app.info(), api.auth.current(), api.knowledge.types(), api.knowledge.isms(), api.settings.get(), api.knowledge.status(),
  ]);
  await loadCatalog();
  renderTop();
  api.knowledge.onEvent(async (r) => {
    S.knowledge = await api.knowledge.status();
    renderTop();
    if (r && r.changed) { S.types = await api.knowledge.types(); await loadCatalog(); toast(`방법론·프롬프트 ${r.message}`); }
  });
  api.updater.onEvent((u) => {
    if (u.state === 'ready') toast(`새 버전 v${u.version} 준비됨 — 설정에서 재시작하면 적용됩니다`, 6000);
    S.update = u; if (S.view === 'settings') renderSettings();
  });
  api.run.onEvent(onRunEvent);
  $$('.rail-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));
  const list = await api.projects.list();
  if (!S.settings.has.openaiKey && !S.info.mock) { go('settings'); toast('먼저 OpenAI API 키를 입력하세요'); }
  else go(list.length ? 'projects' : 'intake');
}

function renderTop() {
  const k = S.knowledge || {};
  $('#topbarRight').innerHTML = `
    ${S.info.mock ? '<span class="badge y">MOCK — 목업 실행</span>' : ''}
    <span class="badge ghost" title="${esc(k.lastSync && k.lastSync.message || '')}"><span class="dot ${k.source === 'synced' ? '' : 'y'}"></span>방법론 v${esc(k.methodVersion || '-')} · 스킬 v${esc(k.skillVersion || '-')} · 지식 v${esc(k.version || '-')}</span>
    <span>${esc(S.user.name)}</span>`;
  $('#railFoot').innerHTML = `v${esc(S.info.version)}`;
}

function go(v, arg) {
  if (S.journey && v !== 'run') { S.journey.destroy(); S.journey = null; }
  S.view = v;
  $$('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.nav === v));
  view.scrollTop = 0;
  view.style.overflow = v === 'run' ? 'hidden' : '';
  view.onclick = null;
  if (v === 'intake') renderIntake(view, { types: S.types, onStart: startMission, worker: S.settings.lastWorker || S.user.name });
  if (v === 'library') renderLibrary(view, { api, toast, onChange: loadCatalog });
  if (v === 'projects') renderProjects();
  if (v === 'settings') renderSettings();
  if (v === 'run') openRun(arg);
}

/* ---------- 새 미션 ---------- */
async function startMission(brief, files) {
  if (!S.settings.has.openaiKey && !S.info.mock) { go('settings'); throw new Error('OpenAI API 키가 필요합니다'); }
  const p = await api.projects.create(brief, files);
  go('run', p.id);
  await api.run.start(p.id);
}

/* ---------- 프로젝트 ---------- */
async function renderProjects() {
  const list = await api.projects.list();
  view.innerHTML = `<div class="projects">
    <div class="intake-head"><div><span class="kicker">PROJECTS</span><h1 class="h1" style="margin-top:8px">여행 기록</h1><p class="lead">미션마다 화가의 여정과 결과가 남습니다. 지금은 이 PC에 저장되고, 이후 조직·팀 단위로 통합 관리됩니다.</p></div>
      <button class="btn primary" data-act="new">새 미션 →</button></div>
    ${list.length ? `<div class="pgrid">${list.map((p) => `
      <button class="pcard" data-id="${esc(p.id)}">
        <div class="cv">${p.cover ? `<img src="${esc(p.cover)}" alt=""/>` : '<svg viewBox="0 0 160 90"><path d="M0 70 H160"/><path d="M20 70 V40 L40 26 L60 40 V70"/><circle cx="96" cy="44" r="4"/><path d="M96 48 V62 L90 70 M96 62 L102 70 M96 52 L106 46"/><rect x="112" y="22" width="34" height="26"/></svg>'}</div>
        <div class="bd"><b>${esc(p.name)}</b><span class="muted" style="font-size:13px">${esc(p.concept || (S.types.types.find((t) => t.id === (p.deliverable || [])[0]) || {}).label || '')}</span>
          <div class="meta"><span>${esc(STATUS_KO[p.status] || p.status)} · ${esc(p.worker || '')}</span><span>${p.cost ? usd(p.cost) + ' · ' : ''}${fmtDate(p.updatedAt)}</span></div></div>
      </button>`).join('')}</div>` : '<div class="empty">아직 미션이 없습니다.</div>'}
  </div>`;
  view.querySelector('[data-act="new"]').addEventListener('click', () => go('intake'));
  $$('.pcard', view).forEach((c) => c.addEventListener('click', () => go('run', c.dataset.id)));
}

/* ---------- 실행 화면 ---------- */
async function openRun(id) {
  S.project = await api.projects.get(id);
  S.run = S.project.run;
  S.selStage = null; S.pinnedStage = false;
  view.innerHTML = `<div class="runview">
    <div class="run-head"><div class="t"><span class="kicker">MISSION</span><h2 id="runTitle"></h2><span class="stage-status" id="runStatus"></span></div>
      <div class="acts" id="runActs"></div></div>
    <div class="journey-wrap"><div id="journeyHost"></div>
      <div class="journey-tools"><label class="toggle" style="background:var(--paper);padding:2px 8px;border-radius:999px"><input type="checkbox" id="follow" ${S.settings.ui.followCamera ? 'checked' : ''}/> 화가 따라가기</label></div>
      <div class="lane" id="lane"></div></div>
    <nav class="ruler" id="ruler" aria-label="단계"></nav>
    <div class="detail" id="detail"><div class="detail-inner" id="detailInner"></div><div id="gateHost"></div></div>
  </div>`;
  view.style.overflow = 'hidden';
  S.journey = new Journey($('#journeyHost'), {});
  S.journey.setIsms(S.isms);
  S.journey.follow = S.settings.ui.followCamera;
  $('#follow').addEventListener('change', (e) => { S.journey.follow = e.target.checked; api.settings.set({ ui: { followCamera: e.target.checked } }); });
  $('#ruler').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.selStage = b.dataset.stage; S.pinnedStage = true; S.journey.focus(b.dataset.stage); renderDetail(true); renderRuler(); $('#detail').scrollTop = 0; });
  $('#detail').addEventListener('click', onDetailClick);
  $('#detail').addEventListener('submit', onDetailSubmit);
  renderRunAll();
}

function currentStage() {
  const r = S.run;
  if (!r) return 'brief';
  if (r.status === 'paused') return r.pausedAt === 'C' ? 'concept' : 'brief';
  return r.stage || 'brief';
}

function renderRunAll() {
  const p = S.project, r = S.run;
  $('#runTitle').textContent = p.name;
  const st = r ? r.status : 'draft';
  const stg = S.info.stages.find((s) => s.id === currentStage());
  $('#runStatus').innerHTML = st === 'running' ? `<span class="pulse"></span>${esc(stg.label)} — ${esc(stg.sub)}` : st === 'paused' ? `<span class="dot y"></span>${r.pausedAt === 'C' ? 'C 게이트 — 사람의 판정을 기다립니다' : '브리프 게이트 — 질문에 답해 주세요'}` : `<span class="dot"></span>${esc(STATUS_KO[st] || st)}${r && r.error ? ` — ${esc(r.error)}` : ''}`;
  const acts = [];
  if (!r || ['error', 'canceled', 'interrupted'].includes(st)) acts.push(`<button class="btn sm primary" data-act="start">${r ? '이어서 진행' : '여행 시작'}</button>`);
  if (st === 'running') acts.push('<button class="btn sm ghost" data-act="cancel">멈춤</button>');
  if (r && ['done', 'stopped'].includes(st)) acts.push('<button class="btn sm ghost" data-act="restart">처음부터 다시</button>');
  if (r && r.usage) { const over = S.settings.run.budgetUsd && r.usage.cost > S.settings.run.budgetUsd; acts.push(`<span class="cost-badge ${over ? 'over' : ''}" title="추정치 · 설정에서 단가 수정 · 호출 ${r.usage.calls} · 이미지 ${r.usage.images || 0}">${usd(r.usage.cost)} · ${krw(r.usage.cost)}</span>`); }
  if (r && r.results && r.results.concept && st !== 'running') acts.push('<button class="btn sm primary" data-act="ppt">PPT 리포트</button>');
  if (r) acts.push('<button class="btn sm" data-act="export">보고서 (.md)</button>');
  acts.push('<button class="btn sm ghost" data-act="dup">사본으로 새 미션</button>');
  acts.push('<button class="btn sm ghost" data-act="del" title="삭제">삭제</button>');
  $('#runActs').innerHTML = acts.join('');
  $('#runActs').onclick = onRunAction;
  if (S.journey && r) S.journey.update(r);
  renderLane(); renderRuler(); renderDetail();
}

function renderLane() {
  const r = S.run;
  if (!r) { $('#lane').innerHTML = ''; return; }
  const cur = currentStage();
  const agents = arr(r.agents).filter((a) => a.stage === cur || a.status === 'working').slice(-8);
  $('#lane').innerHTML = agents.map((a) => `<span class="agent ${a.key === 'painter' ? 'painter' : ''} ${a.key === 'brain' ? 'brain' : ''} ${a.status}" title="${esc(a.task || '')}${a.why ? ' · ' + esc(a.why) : ''}"><span class="av">${a.key === 'painter' ? '화' : a.key === 'brain' ? '' : a.role === 'image' ? '이' : '조'}</span>${esc(a.name)}<span class="md">${esc(a.model || '')}${a.cost ? ' · ' + usd(a.cost) : ''}</span></span>`).join('');
}

function renderRuler() {
  const r = S.run;
  const cur = S.selStage || currentStage();
  $('#ruler').innerHTML = S.info.stages.map((s, i) => {
    const st = r && r.stages[s.id] ? r.stages[s.id] : { status: 'pending', progress: 0 };
    const w = st.status === 'done' ? 100 : Math.round((st.progress || 0) * 100);
    return `<button data-stage="${s.id}" class="${cur === s.id ? 'sel' : ''}"><span class="no"><span class="st ${st.status}"></span>${String(i + 1).padStart(2, '0')}</span><span class="nm">${esc(s.label)}</span><span class="sb">${esc(s.sub)}</span><span class="bar" style="width:${w}%"></span></button>`;
  }).join('');
}

let lastDetail = '';
function renderDetail(force = false) {
  const r = S.run;
  if (!S.pinnedStage) S.selStage = currentStage();
  const stage = S.selStage || 'brief';
  const html = r ? RENDER[stage](S.project, r, { isms: S.isms, lensNames: S.lensNames || {} }) : `<div class="empty">아직 출발하지 않았습니다. <b>여행 시작</b>을 누르세요.</div>`;
  if (force || html !== lastDetail) { lastDetail = html; $('#detailInner').innerHTML = html; }
  const gb = gateBar(r);
  const host = $('#gateHost');
  if (host._h !== gb) { host._h = gb; host.innerHTML = gb; }
}

let raf = 0;
function onRunEvent(e) {
  if (S.view !== 'run' || !S.project || e.projectId !== S.project.id) return;
  S.run = e.run;
  if (e.kind === 'stage-start' && !S.pinnedStage) { S.selStage = e.stage; const d = $('#detail'); if (d) d.scrollTop = 0; }
  if (e.kind === 'gate') { S.pinnedStage = false; toast(e.gate === 'C' ? 'C 게이트 — 컨셉을 판정해 주세요' : '화가가 질문을 했어요'); }
  if (e.kind === 'error') toast(`오류 — ${e.error}`, 6000);
  if (e.kind === 'done') toast('여정을 마쳤습니다. 갤러리에 그림이 걸렸어요.');
  if (e.kind === 'budget') toast(`미션 예산을 넘었습니다 — ${usd(e.run.usage.cost)}`, 6000);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => renderRunAll());
}

async function onRunAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = S.project.id;
  const a = b.dataset.act;
  if (a === 'start') { S.pinnedStage = false; await api.run.start(id); }
  if (a === 'restart') { S.pinnedStage = false; await api.run.start(id); }
  if (a === 'cancel') await api.run.cancel(id);
  if (a === 'export') { const r = await api.projects.exportReport(id); toast(`보고서를 저장했습니다 — ${r.reportPath}`, 5000); }
  if (a === 'ppt') { b.disabled = true; b.textContent = '코어 추출 중…'; try { const r = await api.projects.exportPpt(id); toast(`PPT를 저장했습니다 — ${r.file}`, 6000); } catch (e) { toast(e.message, 6000); } b.disabled = false; b.textContent = 'PPT 리포트'; }
  if (a === 'dup') { const p = await api.projects.duplicate(id); go('run', p.id); }
  if (a === 'del') { if (b.dataset.confirm) { await api.projects.remove(id); go('projects'); } else { b.dataset.confirm = '1'; b.textContent = '한 번 더 누르면 삭제'; setTimeout(() => { b.textContent = '삭제'; delete b.dataset.confirm; }, 3000); } }
}

async function onDetailClick(e) {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const form = pick.closest('form');
    form.querySelector(`[name="${CSS.escape(pick.dataset.pick)}"]`).value = pick.dataset.val;
    $$(`[data-pick="${CSS.escape(pick.dataset.pick)}"]`, form).forEach((c) => c.classList.toggle('on', c === pick));
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'gate') {
    const note = ($('#gateNote') || {}).value || '';
    if (b.dataset.d === 'revise' && !note.trim()) { toast('무엇을 고칠지 의견을 적어 주세요'); $('#gateNote').focus(); return; }
    $$('[data-act="gate"]').forEach((x) => { x.disabled = true; });
    S.pinnedStage = false;
    await api.run.gate(S.project.id, b.dataset.d, note);
  }
  if (b.dataset.act === 'regen') { b.disabled = true; await api.run.regenerateImage(S.project.id, +b.dataset.i); }
}

async function onDetailSubmit(e) {
  const ins = e.target.closest('[data-form="inspire"]');
  if (ins) {
    e.preventDefault();
    const text = ins.querySelector('[name=text]').value.trim();
    if (!text) { toast('영감을 적어 주세요'); return; }
    ins.querySelector('button').disabled = true;
    S.pinnedStage = false;
    try { await api.run.inspire(S.project.id, ins.dataset.stage, text); toast('영감을 받아 이 단계부터 다시 그립니다'); } catch (err) { toast(err.message, 5000); ins.querySelector('button').disabled = false; }
    return;
  }
  const form = e.target.closest('[data-form="brief"]');
  if (!form) return;
  e.preventDefault();
  const answers = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
  if (!Object.values(answers).some(Boolean)) { toast('하나 이상 답해 주세요'); return; }
  form.querySelector('button[type="submit"]').disabled = true;
  await api.run.answerBrief(S.project.id, answers);
}

/* ---------- 설정 ---------- */
async function renderSettings() {
  [S.settings, S.knowledge] = await Promise.all([api.settings.get(), api.knowledge.status()]);
  const usage = await api.usage.summary();
  const s = S.settings, k = S.knowledge, u = S.update;
  const o = s.openai, m = o.models;
  const pricing = Object.entries(s.pricing || {}).filter(([kk]) => kk !== 'image');
  const months = Object.entries(usage.byMonth || {}).sort().slice(-6);
  const maxM = Math.max(0.0001, ...months.map(([, v]) => v));
  view.innerHTML = `<div class="settings">
    <div><span class="kicker">SETTINGS</span><h1 class="h1" style="margin-top:8px">설정</h1></div>

    <div class="sgroup"><h3>OpenAI (GPT)</h3>
      <div class="srow"><div class="lbl">API 키<small>이 PC의 키체인으로 암호화 저장</small></div>
        <div class="inline"><input class="input box" id="key" type="password" placeholder="${s.has.openaiKey ? '저장됨 — 바꾸려면 새 키 입력' : 'sk-...'}"/><button class="btn sm" data-s="saveKey">저장</button><button class="btn sm ghost" data-s="test">연결 확인</button></div></div>
      <div class="srow"><div class="lbl">API 주소<small>프록시·게이트웨이 사용 시</small></div><input class="input box" data-k="openai.baseUrl" value="${esc(o.baseUrl)}"/></div>
    </div>

    <div class="sgroup"><h3>모델 — 기본 설정과 화가의 자율 배정</h3>
      <div class="srow"><div class="lbl">화가 · 메인<small>오케스트레이션 · 컨셉 · 가이드</small></div><input class="input box" data-k="openai.models.director" value="${esc(m.director)}" list="modelList"/></div>
      <div class="srow"><div class="lbl">판단 브레인<small>방향 제시 · 검증 · 발상의 전환</small></div><input class="input box" data-k="openai.models.brain" value="${esc(m.brain || m.director)}" list="modelList"/></div>
      <div class="srow"><div class="lbl">조수 · 서브<small>사조 여행 · 레이어 병렬</small></div><input class="input box" data-k="openai.models.sub" value="${esc(m.sub)}" list="modelList"/></div>
      <div class="srow"><div class="lbl">이미지</div><input class="input box" data-k="openai.models.image" value="${esc(m.image)}" list="modelList"/></div>
      <datalist id="modelList"></datalist>
      <div class="srow"><div class="lbl">화가의 모델 자율 선택<small>미션을 보고 단계·역할마다 아래 풀에서 고른다</small></div><label class="toggle"><input type="checkbox" data-k="openai.autoModel" ${o.autoModel ? 'checked' : ''}/> 켜기 — 위 기본값은 화가가 배정하지 않은 곳에만 쓰인다</label></div>
      <div class="srow" style="align-items:start"><div class="lbl">모델 풀<small>화가가 고를 수 있는 모델 · 등급</small></div>
        <div class="stack" style="gap:6px" id="pool">${(o.pool || []).map((p, i) => `<div class="pool-row" data-i="${i}"><input class="input box" data-pool="id" value="${esc(p.id)}" list="modelList"/><select class="input box" data-pool="tier">${['deep', 'balanced', 'fast'].map((t) => `<option ${p.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select><input class="input box" data-pool="note" value="${esc(p.note || '')}" placeholder="용도"/><button class="btn xs ghost" data-s="poolDel" data-i="${i}">×</button></div>`).join('')}
        <div><button class="btn xs" data-s="poolAdd">+ 모델 추가</button></div></div></div>
      <div class="srow"><div class="lbl">추론 강도 기본값<small>gpt-5 · o 계열 · 화가가 단계별로 바꿀 수 있음</small></div><div class="seg" data-seg="openai.reasoningEffort">${['', 'minimal', 'low', 'medium', 'high'].map((v) => `<button data-v="${v}" class="${o.reasoningEffort === v ? 'on' : ''}">${v || '기본'}</button>`).join('')}</div></div>
    </div>

    <div class="sgroup"><h3>더프롬 판단 브레인</h3>
      <div class="srow"><div class="lbl">개입 강도<small>표준: 모든 단계 · 핵심: 캔버스·FoR/PoP/PoD·컨셉·Creative</small></div><div class="seg" data-seg="run.brain">${[['standard', '표준'], ['core', '핵심'], ['off', '끔']].map(([v, l]) => `<button data-v="${v}" class="${s.run.brain === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="srow"><div class="lbl">재작업 횟수<small>브레인이 '재작업' 판정 시 다시 그리는 최대 횟수</small></div><div class="seg" data-seg="run.brainRetry">${[0, 1, 2].map((v) => `<button data-v="${v}" class="${(s.run.brainRetry ?? 1) === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <div class="srow"><div class="lbl">렌즈</div><div class="muted" style="font-size:13px">${(S.brain && S.brain.lenses || []).map((l) => `<span class="lens-chip" title="${esc(l.question)}">${esc(l.name)}</span>`).join(' ')} — 라이브러리 › 판단 브레인에서 자세히</div></div>
    </div>

    <div class="sgroup"><h3>API 비용</h3>
      <div class="srow"><div class="lbl">사용량<small>이 PC의 실제 호출 기준 추정 (목업 제외)</small></div>
        <div class="stack" style="gap:8px"><div class="row"><span class="cost-badge">이번 달 ${usd(usage.month)} · ${krw(usage.month)}</span><span class="cost-badge">누적 ${usd(usage.total)} · 호출 ${usage.calls}</span></div>
          ${months.length ? `<div class="usage-bars">${months.map(([mm, v]) => `<div><span class="mono">${mm}</span><i style="width:${Math.max(2, (v / maxM) * 100)}%"></i><span class="mono">${usd(v)}</span></div>`).join('')}</div>` : ''}
          ${Object.keys(usage.byModel || {}).length ? `<div class="muted" style="font-size:12px">${Object.entries(usage.byModel).map(([mm, v]) => `${esc(mm)} ${usd(v)}`).join(' · ')}</div>` : ''}
          <span class="muted" style="font-size:12px">실제 청구액은 OpenAI 대시보드(platform.openai.com › Usage)가 기준입니다.</span></div></div>
      <div class="srow"><div class="lbl">미션당 예산 (USD)<small>넘으면 경고</small></div><div class="inline"><input class="input box" type="number" step="0.5" min="0" data-k="run.budgetUsd" value="${s.run.budgetUsd}" style="max-width:120px"/><span class="muted">환율</span><input class="input box" type="number" data-k="krwPerUsd" value="${s.krwPerUsd}" style="max-width:120px"/><span class="muted">원/달러</span></div></div>
      <div class="srow" style="align-items:start"><div class="lbl">단가 (USD / 1M tokens)<small>OpenAI 가격이 바뀌면 고친다</small></div>
        <div class="stack" style="gap:6px"><div class="price-row muted"><span>모델</span><span>입력</span><span>캐시 입력</span><span>출력</span></div>
          ${pricing.map(([id, p]) => `<div class="price-row" data-model="${esc(id)}"><span class="mono">${esc(id)}</span><input class="input box" type="number" step="0.001" data-price="in" value="${p.in}"/><input class="input box" type="number" step="0.001" data-price="cached" value="${p.cached ?? ''}"/><input class="input box" type="number" step="0.001" data-price="out" value="${p.out}"/></div>`).join('')}
          <div class="price-row"><span class="muted">이미지 1장 (usage 없을 때)</span>${['low', 'medium', 'high'].map((q) => `<input class="input box" type="number" step="0.001" data-imgprice="${q}" value="${(s.pricing.image || {})[q] ?? ''}" title="${q}"/>`).join('')}</div>
          <div class="inline"><input class="input box" id="newModel" placeholder="모델 ID 추가 (예: gpt-5.1)"/><button class="btn xs" data-s="priceAdd">추가</button></div></div></div>
    </div>

    <div class="sgroup"><h3>실행</h3>
      <div class="srow"><div class="lbl">동시 조수 수</div><input class="input box" type="number" min="1" max="8" data-k="run.maxParallel" value="${s.run.maxParallel}" style="max-width:120px"/></div>
      <div class="srow"><div class="lbl">가이드 이미지</div><div class="inline"><label class="toggle"><input type="checkbox" data-k="run.generateImages" ${s.run.generateImages ? 'checked' : ''}/> 생성</label>
        <div class="seg" data-seg="run.imageQuality">${['low', 'medium', 'high'].map((v) => `<button data-v="${v}" class="${s.run.imageQuality === v ? 'on' : ''}">${v}</button>`).join('')}</div></div></div>
    </div>

    <div class="sgroup"><h3>방법론 · 프롬프트 (GitHub 동기화)</h3>
      <div class="srow"><div class="lbl">현재</div><div>지식 v${esc(k.version || '-')} · 스킬 v${esc(k.skillVersion || '-')} · 방법론 v${esc(k.methodVersion || '-')} · 사조 ${k.counts.isms} · 노하우 ${k.counts.knowhow} · <span class="muted">${k.source === 'synced' ? '내려받은 최신본' : '설치본 내장'}</span><br/><span class="muted" style="font-size:12px">${esc(k.lastSync && k.lastSync.message || '아직 동기화 안 함')}</span></div></div>
      <div class="srow"><div class="lbl">저장소</div><div class="inline"><input class="input box" data-k="knowledge.repo" value="${esc(s.knowledge.repo)}"/><input class="input box" data-k="knowledge.branch" value="${esc(s.knowledge.branch)}" style="max-width:120px"/></div></div>
      <div class="srow"><div class="lbl">GitHub 토큰<small>저장소가 비공개일 때만 (read 권한)</small></div><div class="inline"><input class="input box" id="gh" type="password" placeholder="${s.has.githubToken ? '저장됨' : '공개 저장소면 비워 두기'}"/><button class="btn sm" data-s="saveGh">저장</button></div></div>
      <div class="srow"><div class="lbl">자동 동기화</div><div class="inline"><label class="toggle"><input type="checkbox" data-k="knowledge.autoSync" ${s.knowledge.autoSync ? 'checked' : ''}/> 앱을 열 때</label><button class="btn sm" data-s="sync">지금 동기화</button></div></div>
    </div>

    <div class="sgroup"><h3>앱</h3>
      <div class="srow"><div class="lbl">버전</div><div class="inline"><span>v${esc(S.info.version)} · ${esc(S.info.platform)}</span><button class="btn sm ghost" data-s="upd">업데이트 확인</button>${u && u.state === 'ready' ? `<button class="btn sm go" data-s="install">v${esc(u.version)} 설치 후 재시작</button>` : ''}<span class="muted" style="font-size:12px">${esc(u ? (u.state === 'downloading' ? `내려받는 중 ${u.percent}%` : u.message || u.state) : '')}</span></div></div>
      <div class="srow"><div class="lbl">기본 작업자<small>새 미션에 자동으로 채워짐</small></div><input class="input box" data-k="lastWorker" value="${esc(s.lastWorker || '')}" style="max-width:240px"/></div>
      <div class="srow"><div class="lbl">사용자 · 조직<small>중앙관제 전환 시 로그인으로 바뀝니다</small></div><div>${esc(S.user.name)} · ${esc(S.user.orgId)} · ${esc(S.user.role)} <span class="muted">(${esc(S.user.provider)})</span></div></div>
      <div class="srow"><div class="lbl">데이터 위치</div><div class="inline"><span class="mono" style="word-break:break-all">${esc(S.info.userData)}</span><button class="btn xs ghost" data-s="open">열기</button></div></div>
    </div>
  </div>`;
  const setPath = async (path, value) => {
    const patch = {}; let obj = patch; const ks = path.split('.');
    ks.slice(0, -1).forEach((kk) => { obj[kk] = {}; obj = obj[kk]; });
    obj[ks[ks.length - 1]] = value;
    S.settings = await api.settings.set(patch);
  };
  const num = (el) => (el.value === '' ? null : +el.value);
  $$('[data-k]', view).forEach((el) => el.addEventListener('change', () => setPath(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.dataset.k === 'run.maxParallel' ? Math.max(1, Math.min(8, +el.value || 4)) : num(el)) : el.value.trim())));
  $$('[data-seg]', view).forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); setPath(g.dataset.seg, /^\d+$/.test(b.dataset.v) ? +b.dataset.v : b.dataset.v); }));
  const savePool = () => {
    const pool = $$('.pool-row', view).map((r) => ({ id: r.querySelector('[data-pool=id]').value.trim(), tier: r.querySelector('[data-pool=tier]').value, note: r.querySelector('[data-pool=note]').value.trim() })).filter((p) => p.id);
    return setPath('openai.pool', pool);
  };
  $('#pool').addEventListener('change', savePool);
  const savePrices = () => {
    const pricing = { ...(S.settings.pricing || {}) };
    $$('.price-row[data-model]', view).forEach((r) => { const id = r.dataset.model; pricing[id] = { ...(pricing[id] || {}), in: num(r.querySelector('[data-price=in]')) || 0, cached: num(r.querySelector('[data-price=cached]')), out: num(r.querySelector('[data-price=out]')) || 0 }; });
    pricing.image = { ...(pricing.image || {}) };
    $$('[data-imgprice]', view).forEach((el) => { pricing.image[el.dataset.imgprice] = num(el); });
    return setPath('pricing', pricing);
  };
  $$('[data-price],[data-imgprice]', view).forEach((el) => el.addEventListener('change', savePrices));
  view.onclick = async (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s;
    if (a === 'saveKey') { const v = $('#key').value.trim(); if (!v) return; S.settings = await api.settings.setSecret('openaiKey', v); toast('API 키를 저장했습니다'); renderSettings(); }
    if (a === 'saveGh') { S.settings = await api.settings.setSecret('githubToken', $('#gh').value.trim()); toast('저장했습니다'); renderSettings(); }
    if (a === 'test') { b.disabled = true; const r = await api.settings.testKey(); toast(r.ok ? `연결됨 — 모델 ${r.count}개` : `실패 — ${r.message}`, 5000); b.disabled = false;
      const l = await api.settings.listModels(); if (l.ok) $('#modelList').innerHTML = l.models.filter((x) => /gpt|o\d|image|dall/.test(x)).map((x) => `<option value="${esc(x)}">`).join(''); }
    if (a === 'poolAdd') { await setPath('openai.pool', [...(S.settings.openai.pool || []), { id: '', tier: 'balanced', note: '' }]); renderSettings(); }
    if (a === 'poolDel') { const pool = [...(S.settings.openai.pool || [])]; pool.splice(+b.dataset.i, 1); await setPath('openai.pool', pool); renderSettings(); }
    if (a === 'priceAdd') { const id = $('#newModel').value.trim(); if (!id) return; await setPath('pricing', { ...(S.settings.pricing || {}), [id]: { in: 0, cached: 0, out: 0 } }); renderSettings(); }
    if (a === 'sync') { b.disabled = true; const r = await api.knowledge.sync(); toast(r.message, 5000); S.types = await api.knowledge.types(); await loadCatalog(); S.knowledge = r.status; renderTop(); renderSettings(); }
    if (a === 'upd') { const r = await api.updater.check(); toast(r.message || (r.version ? `최신 v${r.version}` : '확인했습니다')); }
    if (a === 'install') api.updater.install();
    if (a === 'open') api.app.openPath(S.info.userData);
  };
}

boot().catch((e) => { view.innerHTML = `<div class="empty">시작 오류 — ${esc(e.message)}</div>`; });
