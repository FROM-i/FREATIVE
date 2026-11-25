// THE FROM BRAIN — 화면. 빌드 단계 없는 ES 모듈 (standalone/ 은 같은 코드를 한 파일로 묶은 것).
// 모델이 쓴 문장은 모두 textContent로만 넣는다 — innerHTML을 쓰지 않는다.
import { newProject, buildGraph, describe, nextIssueId, lensName, activeLenses, uid, validateProject } from './graph/model.js';
import { CATEGORIES, TAGS, COMMON_INPUT, SEED_INPUT, PERSPECTIVES, tagById, categoryById, recommendTags, recommendCategory } from '../knowledge/tags.js';
import { createView } from './graph/view.js';
import { think, proposeIssues } from './engine/think.js';
import { reportMarkdown } from './engine/report.js';
import { createMock } from './providers/mock.js';
import { createOpenAI, OPENAI_DEFAULTS } from './providers/openai.js';
import { createClaudePage } from './providers/claude-page.js';
import { SAMPLE, SAMPLE_ID } from '../knowledge/sample-project.js';
import { FAMILIES, LENSES, DEFAULTS } from '../knowledge/nodes.js';

const LS = 'thefrom-brain:v1';
const $ = (id) => document.getElementById(id);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPE = { cause: '원인', condition: '조건', reinforce: '강화', tension: '충돌' };
const STANCE = { keep: '지킬 관성', change: '바꿀 해석', limit: '넘지 않을 경계', open: '비어 있는 자리' };
const STAGE = { baseline: '기본안 받는 중', route: '사조 고르는 중', link: '연결 판단 중', propagate: '판단 묶는 중', direct: '디렉션 정리 중' };

/** DOM 만들기 — 글자는 언제나 텍스트 노드로 들어간다 */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && !['list', 'role', 'for'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// ---------- 상태 ----------
const S = { projects: {}, project: null, config: null, tab: 'insight', selected: null, open: null, running: null, dirty: false, claude: null, proposals: null, confirmDelete: false };
let view;

function load() {
  try { const raw = JSON.parse(localStorage.getItem(LS) || 'null'); if (raw && raw.projects) return raw; } catch { /* 저장소를 못 쓰면 빈 상태로 */ }
  return null;
}
let saveTimer = 0;
function persist(now = false) {
  clearTimeout(saveTimer);
  const write = () => { try { localStorage.setItem(LS, JSON.stringify({ projects: S.projects, current: S.project.id, config: S.config })); } catch { /* 저장 실패는 화면을 막지 않는다 */ } };
  if (now) write(); else saveTimer = setTimeout(write, 400);
}
function toast(msg, err = false) {
  const t = $('toast'); t.textContent = msg; t.className = `toast${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3200);
}

// ---------- 공급자 ----------
async function getProvider() {
  const c = S.config;
  if (c.provider === 'claude') {
    S.claude = S.claude || await createClaudePage();
    if (S.claude) return S.claude;
    toast('이 화면에서는 Claude를 부를 수 없어 목업으로 실행한다.', true);
  }
  if (c.provider === 'openai') return createOpenAI(c.openai, { getKey: () => c.key, getCode: () => c.code });
  return createMock({ delay: reduce ? 0 : 260 });
}

// ---------- 사고 ----------
async function go(mode = 'full') {
  if (S.running) { S.running.ctrl.abort(); return; }
  const target = S.project;
  const prev = target.run;
  const ctrl = new AbortController();
  S.running = { ctrl, stage: '', fired: 0, total: 0, done: 0, count: 0 };
  S.open = null; view.trace(null); view.select(null); S.selected = null;
  view.busy(true); renderChrome();
  try {
    const provider = await getProvider();
    const result = await think(target, provider, {
      mode, signal: ctrl.signal,
      onEvent(e) {
        const r = S.running;
        if (e.type === 'stage') { r.stage = e.stage; if (e.stage === 'activate') r.total = activeLenses(target, e.run.picks).length; if (e.stage === 'integrate') r.count = e.run.clusters.length; }
        if (e.type === 'firing') view.pulse(e.lens);
        if (e.type === 'fire' || e.type === 'fail') r.fired++;
        if (e.type === 'insight') r.done++;
        if (['picked', 'fire', 'linked', 'clustered', 'insight', 'directed'].includes(e.type) && S.project === target) { target.run = e.run; refreshGraph(); }
        if (e.type === 'fire') e.signals.forEach((s) => view.pulse(s.id));
        if (e.type === 'insight') view.pulse(e.insight.id);
        renderChrome();
      },
    });
    target.run = result; target.updated = new Date().toISOString();
    S.dirty = false; S.tab = 'insight'; S.open = result.insights[0]?.id || null;
    const flagged = result.insights.filter((i) => !i.check.ok).length;
    toast(`통합 인사이트 ${result.insights.length}건${flagged ? ` · 검증을 통과하지 못한 것 ${flagged}건` : ''} · 호출 ${result.calls}회`);
  } catch (e) {
    target.run = prev;
    toast(ctrl.signal.aborted ? '분석을 멈췄다. 이전 결과로 되돌렸다.' : e.message, !ctrl.signal.aborted);
  } finally {
    S.running = null; view.busy(false); persist(true); render();
    if (S.open) traceInsight(S.open);
  }
}

const pendingIssues = () => (S.project.run ? S.project.issues.filter((i) => i.title.trim() && !S.project.run.signals.some((s) => s.issue === i.id)) : []);

// ---------- 그래프 ----------
function refreshGraph() { view.setData(buildGraph(S.project)); }

function traceInsight(id) {
  const ins = S.project.run?.insights?.find((i) => i.id === id);
  if (!ins) { view.trace(null); return; }
  const sig = new Map(S.project.run.signals.map((s) => [s.id, s]));
  const used = ins.check.used;
  const ids = [ins.id, ...used, ...used.map((u) => sig.get(u).lens), ...used.map((u) => sig.get(u).issue)];
  view.trace(ids, ins.chain.map((c) => c.signal));
  view.select(ins.id);
}

function selectNode(id, center = false) {
  S.selected = id; S.open = null; view.trace(null); view.select(id);
  if (center && id) view.center(id);
  S.tab = 'node'; renderPanel();
}

function onSelect(node) {
  if (!node) { S.selected = null; S.open = null; view.trace(null); renderPanel(); return; }
  if (node.type === 'insight') { S.tab = 'insight'; S.open = node.id; S.selected = null; traceInsight(node.id); renderPanel(); return; }
  if (node.type === 'project') { S.tab = 'mission'; S.selected = null; view.trace(null); renderPanel(); return; }
  selectNode(node.id);
}

function onHover(node) {
  const tip = $('tip');
  if (!node || node.type === 'project') { tip.hidden = true; return; }
  const run = S.project.run;
  let small = ''; let text = node.name;
  if (node.type === 'signal') { const s = run.signals.find((x) => x.id === node.id); small = `${s.id} · ${lensName(s.lens)} → ${s.issue} · 지지도 ${(run.energy?.[s.id] ?? s.strength).toFixed(2)}`; text = s.claim; }
  else if (node.type === 'lens' || node.type === 'gate') { const l = describe(S.project, node.id).lens; small = `${FAMILIES[l.family].short}${node.dormant ? ' · 이번 분석에서 쓰지 않은 노드' : ''}`; text = `${l.name} — ${l.summary || l.criteria}`; }
  else if (node.type === 'issue') small = node.root ? '근본 이슈' : '이슈';
  else if (node.type === 'insight') { small = '통합 인사이트'; text = `${node.name} — ${run.insights.find((i) => i.id === node.id)?.insight || ''}`; }
  else if (node.type === 'hub') { small = '기본 노드군'; text = `${node.name} — ${node.role}`; }
  tip.replaceChildren(h('small', null, small), text);
  tip.hidden = false;
}

// ---------- 위쪽 · HUD ----------
function renderChrome() {
  const sel = $('project-select');
  sel.replaceChildren(...Object.values(S.projects).map((p) => h('option', { value: p.id, selected: p.id === S.project.id }, `${p.example ? '[예시] ' : ''}${p.title || '(이름 없음)'}`)));
  const r = S.running;
  $('btn-think').textContent = r ? '멈춤' : S.project.run ? '처음부터 다시 분석' : '분석 시작';
  $('run-status').className = `status${r ? ' live' : ''}`;
  $('run-status').textContent = r
    ? (r.stage === 'activate' ? `분석 ${r.fired}/${r.total}` : r.stage === 'integrate' ? `통합 ${r.done}/${r.count}` : STAGE[r.stage] || '준비 중')
    : `MODEL · ${{ mock: 'MOCK', claude: 'CLAUDE', openai: 'OPENAI' }[S.config.provider]}`;

  const run = S.project.run;
  const stats = $('stats');
  const stat = (n, label, hot) => h('div', { class: hot ? 'hot' : '' }, h('b', null, n), h('span', null, label));
  if (!run) stats.replaceChildren(stat(LENSES.length, '기준 노드'), stat(S.project.issues.length, '이슈'), h('div', { class: 'hint' }, h('span', null, '분석 시작을 누르면 모든 노드가 이슈를 동시에 분석')));
  else {
    const k = run.link; const u = run.usage;
    stats.replaceChildren(...[
      stat(run.signals.filter((s) => !s.muted).length, '판단'),
      k ? stat(k.edges, `연결 · 노드군 사이 ${k.crossFamily}건(${pct(k.crossFamily, k.edges)}%)`) : null,
      k ? stat(k.byType.tension, '충돌') : null,
      u ? stat(`${u.used}/${u.signals}`, `인사이트에 쓰인 판단 · ${pct(u.used, u.signals)}%`, true) : null,
    ].filter(Boolean));
  }

  const notice = $('notice');
  const pend = pendingIssues();
  if (r || !run || (!S.dirty && !pend.length)) notice.hidden = true;
  else {
    notice.hidden = false;
    notice.replaceChildren(...(S.dirty
      ? ['연결을 고쳤다. 분석는 그대로 두고 묶기·통합만 다시 한다.', h('button', { class: 'btn sm', type: 'button', onclick: () => go('relink') }, '다시 묶기')]
      : [`분석하지 않은 새 이슈 ${pend.length}건`, h('button', { class: 'btn sm', type: 'button', onclick: () => go('add') }, '새 이슈만 분석')]));
  }
  for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === S.tab));
  $('tab-insight').replaceChildren('인사이트', run?.insights?.length ? h('span', { class: 'n' }, run.insights.length) : '');
}

// ---------- 패널 ----------
function render() { renderChrome(); refreshGraph(); renderPanel(); }
function renderPanel() {
  renderChrome();
  const body = $('tab-body');
  const top = body.scrollTop;
  body.replaceChildren(...({ mission: missionTab, insight: insightTab, node: nodeTab }[S.tab])());
  body.scrollTop = S.keepScroll ? top : 0; S.keepScroll = false;
}
const rerender = () => { S.keepScroll = true; renderPanel(); };

const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);
function bind(obj, key, { area = false, graph = false, ...attrs } = {}) {
  return h(area ? 'textarea' : 'input', {
    ...(area ? { rows: 2 } : { type: 'text' }), value: obj[key] || '', ...attrs,
    oninput: (e) => { obj[key] = e.target.value; S.project.updated = new Date().toISOString(); persist(); if (graph) { refreshGraph(); renderChrome(); } },
  });
}

function missionTab() {
  const p = S.project; const b = p.brief; const c = S.config;
  const out = [];
  if (p.example) out.push(h('div', { class: 'banner' }, '예시 프로젝트다. 판단·연결·인사이트는 구조를 보여 주려고 미리 써 둔 답이며, 목업 공급자에서만 나온다. 내 과제는 ', h('button', { class: 'link', type: 'button', onclick: newBlank }, '새 프로젝트'), '로 시작한다.'));

  const allText = () => [p.title, ...Object.values(b), ...p.issues.flatMap((i) => [i.title, i.detail])].join(' ');
  out.push(h('section', { class: 'sec' }, h('h2', null, '공통 인풋', h('small', null, '모든 프로젝트 공통')),
    field('프로젝트', bind(p, 'title', { graph: true, id: 'f-title' })),
    h('div', { class: 'grid2' }, COMMON_INPUT.map((f) => field(`${f.label}${f.required ? ' · 필수' : ''}`, bind(b, f.id, { area: true, id: `f-${f.id}`, placeholder: f.hint }))))));

  const cat = categoryById(p.category);
  const guess = recommendCategory(allText());
  p.seed[p.category] = p.seed[p.category] || {};
  out.push(h('section', { class: 'sec' }, h('h2', null, '분류와 특화 인풋', h('small', null, '분류를 고르면 해당 항목 표시')),
    h('div', { class: 'row' }, CATEGORIES.map((c) => h('button', { type: 'button', class: `chip pick${p.category === c.id ? ' y' : ''}`, 'aria-pressed': String(p.category === c.id), title: c.role, onclick: () => { p.category = c.id; persist(); rerender(); } }, c.name))),
    !cat && guess ? h('p', { class: 'small' }, '입력한 글로 보면 ', h('button', { class: 'link', type: 'button', onclick: () => { p.category = guess; persist(); rerender(); } }, categoryById(guess).name), ' 분류에 가깝다.') : null,
    cat ? [h('p', { class: 'small' }, `${cat.name} — ${cat.role}`),
      h('div', { class: 'grid2' }, SEED_INPUT[cat.id].map((f) => field(`${f.label}${f.required ? ' · 필수' : ''}`, bind(p.seed[cat.id], f.id, { area: true, id: `seed-${f.id}`, placeholder: f.hint }))))] : null));

  out.push(h('section', { class: 'sec' }, h('h2', null, `이슈 ${p.issues.length}건`, h('small', null, '노드가 분석할 대상')),
    ...p.issues.map((i) => h('div', { class: `card${i.root ? ' root' : ''}` },
      h('div', { class: 'head' }, h('span', { class: 'chip fill' }, i.id),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: `root-${i.id}`, checked: i.root, onchange: (e) => { i.root = e.target.checked; persist(); refreshGraph(); rerender(); } }), '근본 이슈'),
        h('button', { class: 'btn sm x', type: 'button', onclick: () => { p.issues = p.issues.filter((x) => x !== i); persist(); render(); } }, '빼기')),
      field('누구의 무엇이 바뀌는가', bind(i, 'title', { area: true, graph: true, id: `title-${i.id}`, placeholder: '산출물 이름이 들어가면 아직 과업이다' })),
      field('설명 — [[자메뷰]] [[타겟]]처럼 쓰면 그 노드를 이 이슈에 지목한다', bind(i, 'detail', { area: true, graph: true, id: `detail-${i.id}` })),
      i.root ? field('판정 질문 — 어떤 안이든 여기에 넣어 본다', bind(i, 'test', { id: `test-${i.id}` })) : null,
      tagRow(p, i))),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => { p.issues.push({ id: nextIssueId(p), title: '', detail: '', test: '', tags: [], root: !p.issues.some((x) => x.root) }); persist(); S.keepScroll = true; render(); } }, '이슈 더하기'),
      h('button', { class: 'btn', type: 'button', disabled: !!S.running, onclick: propose }, '브리프에서 이슈 뽑기')),
    S.proposals ? h('div', { class: 'card' }, h('div', { class: 'head' }, h('span', { class: 'chip y' }, '후보'), h('span', { class: 'small' }, '고르는 것은 사람이다'), h('button', { class: 'btn sm x', type: 'button', onclick: () => { S.proposals = null; rerender(); } }, '닫기')),
      h('ul', { class: 'list' }, S.proposals.map((c) => h('li', null, h('div', { class: 'row' }, h('span', { class: `chip ${c.root ? 'red' : 'ghost'}` }, c.root ? '근본 이슈' : '이슈'), h('strong', { class: 'grow' }, c.title),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { p.issues.push({ id: nextIssueId(p), title: c.title, detail: c.detail, test: c.test, tags: [], root: c.root && !p.issues.some((x) => x.root) }); S.proposals = S.proposals.filter((x) => x !== c); persist(); S.keepScroll = true; render(); } }, '더하기')),
      c.detail ? h('p', { class: 'small' }, c.detail) : null, c.test ? h('p', { class: 'small' }, `판정 질문: ${c.test}`) : null)))) : null));

  const v = validateProject(p);
  out.push(h('section', { class: 'sec' }, h('h2', null, '세팅 점검', h('small', null, `분석에 들어가는 이슈 ${v.ready.length}/${p.issues.length}건`)),
    v.ok ? h('p', { class: 'note' }, '빠진 칸이 없다.')
      : h('ul', { class: 'bullets' }, v.problems.map((x) => h('li', null, h('strong', null, `${x.where} `), x.what))),
    v.ok ? null : h('p', { class: 'small' }, v.blocking ? '근본 이슈의 틀이 채워져야 사고를 시작할 수 있다.' : '빠진 칸이 있어도 시작할 수 있다. 틀을 채우지 못한 이슈는 분석에서 빠지고, 빈 인풋에 기대는 디렉션은 "확인할 것"으로 남는다.')));

  const num = (key, label, min, max) => field(label, h('select', { id: `set-${key}`, onchange: (e) => { p.settings[key] = +e.target.value; persist(); } },
    Array.from({ length: max - min + 1 }, (_, n) => h('option', { value: min + n, selected: (p.settings[key] ?? DEFAULTS[key]) === min + n }, min + n))));
  out.push(h('section', { class: 'sec' }, h('h2', null, '분석 설정'),
    h('div', { class: 'grid3' }, num('ismCount', '분석할 사조 수', 2, 6), num('insightCount', '통합 인사이트 수', 1, 5), num('signalsPerLens', '노드·이슈당 판단', 1, 3)),
    h('p', { class: 'small' }, `호출 수 = 기본안 1 + 사조 고르기 1 + 노드 ${10 + (p.settings.ismCount ?? DEFAULTS.ismCount)} + 연결 1 + 인사이트 ${p.settings.insightCount ?? DEFAULTS.insightCount} + 디렉션 1 (검증에 걸리면 1회씩 더)`)));

  const o = c.openai;
  const cfg = (obj, key, attrs) => h('input', { type: 'text', value: obj[key] || '', ...attrs, oninput: (e) => { obj[key] = e.target.value.trim(); persist(); } });
  out.push(h('section', { class: 'sec' }, h('h2', null, '모델'),
    field('공급자', h('select', { id: 'set-provider', onchange: (e) => { c.provider = e.target.value; persist(); rerender(); } },
      h('option', { value: 'mock', selected: c.provider === 'mock' }, '목업 — API 없이 구조 확인'),
      h('option', { value: 'claude', selected: c.provider === 'claude' }, 'Claude — claude.ai 아티팩트로 열었을 때'),
      h('option', { value: 'openai', selected: c.provider === 'openai' }, 'OpenAI — FREATIVE 1.x와 같은 모델'))),
    c.provider === 'mock' ? h('p', { class: 'small' }, '목업 문장은 판단이 아니다. "[목업]"이 붙은 틀 문장이 나온다.') : null,
    c.provider === 'claude' ? h('p', { class: 'small' }, '보는 사람의 Claude에게 묻는다. 첫 실행에서 동의를 묻고, 키는 필요 없다. 로컬 파일로 연 화면에서는 쓸 수 없다.') : null,
    c.provider === 'openai' ? [
      field('키를 두는 곳', h('select', { id: 'set-mode', onchange: (e) => { o.mode = e.target.value; persist(); rerender(); } },
        h('option', { value: 'direct', selected: o.mode === 'direct' }, '내 키 — 이 브라우저에만 저장'),
        h('option', { value: 'proxy', selected: o.mode === 'proxy' }, '서버 키 — server.js 또는 Vercel 함수가 대신 호출'))),
      o.mode === 'direct' ? field('OpenAI API 키', cfg(c, 'key', { type: 'password', id: 'set-key', autocomplete: 'off', placeholder: 'sk-…' }))
        : h('div', { class: 'grid2' }, field('프록시 주소', cfg(o, 'proxyUrl', { id: 'set-proxy' })), field('접속 코드 (설정한 경우)', cfg(c, 'code', { type: 'password', id: 'set-code', autocomplete: 'off' }))),
      h('div', { class: 'grid3' }, field('화가 · 통합', cfg(o.models, 'director', { id: 'set-m-director' })), field('브레인 · 연결', cfg(o.models, 'brain', { id: 'set-m-brain' })), field('조수 · 분석', cfg(o.models, 'sub', { id: 'set-m-sub' }))),
    ] : null));

  out.push(h('section', { class: 'sec' }, h('h2', null, '파일'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => saveFile(`${fileName(p)}.json`, JSON.stringify(p, null, 1)) }, '프로젝트 내보내기'),
      h('label', { class: 'btn', style: 'display:inline-flex;align-items:center' }, '프로젝트 가져오기', h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', class: 'sr', onchange: importFile })),
      h('button', { class: 'btn', type: 'button', onclick: () => { const q = newProject(SAMPLE); S.projects[q.id] = q; switchProject(q.id); } }, '예시 다시 열기'),
      h('button', { class: `btn ${S.confirmDelete ? 'danger' : ''}`, type: 'button', onclick: removeProject }, S.confirmDelete ? '정말 지운다 — 되돌릴 수 없다' : '이 프로젝트 지우기')),
    h('p', { class: 'small' }, '프로젝트와 키는 이 브라우저에만 저장된다. 다른 PC로 옮길 때는 내보내기 파일을 쓴다.')));
  return out;
}

/** 이슈의 태그 — 고른 태그 · 글에서 추천한 태그 · 사전에서 더하기 */
function tagRow(p, i) {
  i.tags = i.tags || [];
  const rec = recommendTags(`${i.title} ${i.detail}`, { category: p.category, limit: 4 }).filter((r) => !i.tags.includes(r.id));
  const set = (ids) => { i.tags = ids; persist(); refreshGraph(); rerender(); };
  return h('div', { class: 'field' }, h('span', null, i.tags.length ? '태그' : '태그 — 비워 두면 추천 태그가 그대로 붙는다'),
    h('div', { class: 'row' },
      i.tags.map((id) => h('button', { type: 'button', class: 'chip pick y', title: '빼기', onclick: () => set(i.tags.filter((x) => x !== id)) }, `${tagById(id)?.name || id} ×`)),
      rec.map((r) => h('button', { type: 'button', class: 'chip pick rec', title: `글에 나온 말: ${r.because.join(', ') || r.name}`, onclick: () => set([...i.tags, r.id]) }, `+ ${r.name}`)),
      h('select', { class: 'tag-add', 'aria-label': '태그 사전에서 더하기', id: `tag-add-${i.id}`, onchange: (e) => { if (e.target.value) set([...i.tags, e.target.value]); } },
        h('option', { value: '' }, '태그 사전'),
        CATEGORIES.map((c) => h('optgroup', { label: c.name }, TAGS.filter((t) => t.category === c.id && !i.tags.includes(t.id)).map((t) => h('option', { value: t.id }, t.name)))))));
}

/** 통합 디렉션 — 관점별 할 일 한 판 */
function directionBoard(run) {
  const d = run.direction;
  if (!d) return null;
  const name = (id) => PERSPECTIVES.find((v) => v.id === id)?.name || id;
  const open = (id) => { S.open = id; S.selected = null; traceInsight(id); rerender(); };
  return h('section', { class: 'sec' }, h('h2', null, '통합 디렉션', h('small', null, '담당별 할 일')),
    d.check.ok ? null : h('div', { class: 'banner warn' }, h('strong', null, '검증 미통과 — '), d.check.problems.join(' / ')),
    h('p', { class: 'lead sm' }, d.headline),
    h('div', { class: 'views' }, PERSPECTIVES.map((v) => {
      const x = d.perspectives[v.id];
      if (!x) return v.id === 'development' ? h('div', { class: 'view off' }, h('h3', null, v.name), h('p', { class: 'small' }, `이 과제에서는 뺐다 — ${d.developmentReason}`)) : null;
      return h('div', { class: 'view' }, h('h3', null, v.name), h('p', null, h('strong', null, x.direction)),
        h('ul', { class: 'bullets' }, x.actions.map((a) => h('li', null, a))),
        x.need.length ? h('p', { class: 'small' }, `확인할 것: ${x.need.join(' / ')}`) : null,
        h('div', { class: 'row' }, h('span', { class: 'small' }, '근거'), x.from.map((id) => h('button', { type: 'button', class: 'chip pick', onclick: () => open(id) }, id))));
    })),
    d.conflicts.length ? h('div', null, h('p', { class: 'small' }, '관점이 부딪히는 자리'), d.conflicts.map((c) => h('div', { class: 'tension' }, h('b', null, c.between.map(name).join(' ↔ ')), c.what, h('p', { class: 'small' }, c.resolve)))) : null,
    h('div', null, h('p', { class: 'small' }, '먼저 할 일'), h('ol', { class: 'chain' }, d.priority.map((x, n) => h('li', null, h('span', { class: 'step' }, n + 1), h('div', null, x.what, h('div', { class: 'meta' }, h('span', { class: 'chip ghost' }, name(x.owner)), x.from ? h('button', { type: 'button', class: 'chip pick', onclick: () => open(x.from) }, x.from) : null)))))),
    d.unusedInsights.length ? h('p', { class: 'small' }, `어느 관점에도 쓰이지 않은 인사이트: ${d.unusedInsights.join(', ')}`) : null);
}

/** 기본안 대조 — 브레인 없이 낸 안과 통합 인사이트를 나란히 놓는다 */
const OVERLAP_LABEL = { 같음: '기본안과 같음', 일부: '기본안 + 새 장치', 다름: '기본안에 없는 해법' };
const overlapOf = (run, id) => (run.direction?.overlap || []).find((o) => o.insight === id) || null;
function baselineBoard(run) {
  const b = run.baseline;
  if (!b?.concepts?.length) return null;
  const ov = run.direction?.overlap || [];
  const n = (v) => ov.filter((o) => o.verdict === v).length;
  return h('section', { class: 'sec' }, h('h2', null, '기본안 대조', h('small', null, '브레인 없이 낸 안과 비교')),
    ov.length ? h('p', { class: 'lead sm' }, `통합 인사이트 ${ov.length}건 중 기본안에 없는 해법 `, h('em', null, `${n('다름')}건`), `, 기본안에 장치를 더한 것 ${n('일부')}건, 기본안과 같은 것 ${n('같음')}건.`) : null,
    n('같음') ? h('div', { class: 'banner warn' }, h('strong', null, '기본안과 같은 인사이트가 있다 — '), '브레인을 쓰지 않아도 나오는 안이다. 이슈를 좁히거나 노드를 바꿔 다시 분석한다.') : null,
    h('ul', { class: 'list' }, b.concepts.map((c) => h('li', null, h('div', { class: 'row' }, h('span', { class: 'chip ghost' }, c.id), h('strong', null, c.title)), c.concept,
      ov.filter((o) => o.baseline === c.id).map((o) => h('p', { class: 'small' }, `${o.insight} · ${o.verdict} — ${o.why}`))))),
    b.common ? h('p', { class: 'small' }, `기본안의 공통 해법: ${b.common}`) : null);
}

function insightTab() {
  const p = S.project; const run = p.run;
  if (!run || !run.insights?.length) {
    return [h('section', { class: 'sec' }, h('p', { class: 'lead' }, S.running ? '분석하는 중이다.' : '아직 분석하지 않았다.'),
      h('p', { class: 'note' }, '분석 시작을 누르면 아래 일곱 단계가 이어서 진행된다.'),
      h('ol', { class: 'steps' }, [
        ['기본안', '기준 노드 없이 브리프만 읽고 안 3개를 먼저 받는다. 뒤에서 통합 인사이트와 비교하는 기준이다.'],
        ['노드별 분석', '각 기준 노드가 같은 미션과 이슈를 받아 따로 판단을 낸다. 근거 단계를 쓰지 못한 판단은 제외한다.'],
        ['연결', '판단끼리 원인·조건·강화·충돌 관계를 찾는다. 이유가 없는 연결은 제외한다.'],
        ['묶기', '서로 강하게 연결된 판단을 계산으로 묶는다. 입력이 같으면 결과도 같다.'],
        ['통합', '묶음마다 통합 인사이트를 하나씩 쓴다.'],
        ['검증', '인사이트가 아이덴티티·에어플레인·터널 판단을 모두 근거로 썼는지 확인한다.'],
        ['디렉션', '인사이트를 기획·디자인·개발·서비스 담당의 할 일로 정리하고, 인사이트가 기본안과 같은 해법인지 판정한다.'],
      ].map(([t, d], i) => h('li', null, h('b', null, i + 1), h('div', null, h('strong', null, t), h('p', { class: 'note' }, d))))))];
  }
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const u = run.usage; const k = run.link;
  const flagged = run.insights.filter((i) => !i.check.ok).length;
  const out = [];

  out.push(h('section', { class: 'sec' },
    h('p', { class: 'lead' }, `통합 인사이트 ${run.insights.length}건. 판단 ${u.signals}건 중 `, h('em', null, `${u.used}건(${pct(u.used, u.signals)}%)`), '이 인사이트에 쓰였다.'),
    h('div', { class: 'bars' }, Object.keys(FAMILIES).flatMap((f) => { const b = u.byFamily[f]; return [h('span', null, FAMILIES[f].short), h('div', { class: 'track' }, h('i', { style: `width:${pct(b.used, b.signals)}%` })), h('span', null, `${b.used}/${b.signals}건`)]; })),
    h('p', { class: 'small' }, `연결 ${k.edges}건 중 ${k.crossFamily}건(${pct(k.crossFamily, k.edges)}%)이 서로 다른 노드군 사이다. 충돌 ${k.byType.tension}건.${flagged ? ` 검증을 통과하지 못한 인사이트 ${flagged}건.` : ''}`),
    p.example && run.provider === 'mock' ? h('p', { class: 'small' }, '예시 결과 — 미리 써 둔 답이다. 실제 모델의 품질을 보여 주지 않는다.') : null));

  const board = directionBoard(run); if (board) out.push(board);
  const base = baselineBoard(run); if (base) out.push(base);

  out.push(h('section', { class: 'sec' }, h('h2', null, '통합 인사이트', h('small', null, '누르면 브레인 맵에 근거 경로가 켜진다')),
    ...run.insights.map((n, idx) => {
      const open = S.open === n.id; const c = n.check;
      return h('article', { class: `insight${c.ok ? '' : ' flag'}${open ? ' on' : ''}` },
        h('button', { class: 'open', type: 'button', 'aria-expanded': String(open), onclick: () => { S.open = open ? null : n.id; S.selected = null; if (S.open) traceInsight(n.id); else { view.trace(null); view.select(null); } rerender(); } },
          h('span', { class: 'no' }, idx + 1), h('div', null, h('h3', null, n.title), h('p', { class: 'one' }, n.insight), overlapOf(run, n.id) ? h('span', { class: `chip ${overlapOf(run, n.id).verdict === '같음' ? 'warn' : 'ghost'}` }, OVERLAP_LABEL[overlapOf(run, n.id).verdict]) : null)),
        open ? h('div', { class: 'more' },
          c.ok ? null : h('div', { class: 'banner warn' }, h('strong', null, '검증 미통과 — '), c.problems.join(' / ')),
          h('div', null, h('div', { class: 'cover', role: 'img', 'aria-label': '근거 판단의 노드군 구성' }, Object.keys(FAMILIES).map((f) => h('i', { class: f, style: `width:${pct(c.byFamily[f], c.used.length)}%` }))),
            h('div', { class: 'cover-key' }, h('strong', null, `근거 판단 ${c.used.length}건`), Object.keys(FAMILIES).map((f) => h('span', null, `${FAMILIES[f].short} ${c.byFamily[f]}건`)), h('span', null, `노드 ${c.lenses.length}개`))),
          h('ol', { class: 'chain' }, n.chain.map((s, i) => h('li', null, h('span', { class: 'step' }, i + 1),
            h('div', null, s.says, h('div', { class: 'meta' }, h('span', { class: 'chip ghost' }, s.role), h('span', { class: `chip ${sig.get(s.signal).family}` }, lensName(sig.get(s.signal).lens)),
              h('button', { class: 'link id', type: 'button', onclick: () => selectNode(s.signal, true) }, s.signal)))))),
          n.tension ? h('div', { class: 'tension' }, h('b', null, `충돌 ${n.tension.a} ↔ ${n.tension.b}`), n.tension.resolve) : null,
          h('dl', { class: 'kv' },
            h('dt', null, '컨셉 방향'), h('dd', null, h('strong', null, n.concept)),
            h('dt', null, '보이는 표현'), h('dd', null, n.visual),
            h('dt', null, '지킬 관성'), h('dd', null, n.keep),
            h('dt', null, '바꿀 해석'), h('dd', null, n.change),
            h('dt', null, '근본 이슈에 적용하면'), h('dd', null, `${n.substitute.who} — ${n.substitute.changes}`),
            h('dt', null, '판정 질문의 답'), h('dd', null, n.verdict),
            n.without?.baseline ? [h('dt', null, n.without.nearest ? `가까운 기본안 ${n.without.nearest}` : '노드 없이 냈을 안'), h('dd', null, n.without.baseline), h('dt', null, '이 안의 차이'), h('dd', null, h('strong', null, n.without.difference))] : null,
            h('dt', null, '자사 색 배제 점검'), h('dd', null, n.gate)),
          n.open.length ? h('div', null, h('p', { class: 'small' }, '사람이 확인할 것'), h('ul', { class: 'bullets' }, n.open.map((x) => h('li', null, x)))) : null) : null);
    })));

  if (u.unused.length) out.push(h('section', { class: 'sec' }, h('h2', null, `쓰이지 않은 판단 ${u.unused.length}건`, h('small', null, '다음 분석의 재료')),
    h('ul', { class: 'list' }, u.unused.map((id) => h('li', null, h('div', { class: 'row' }, h('span', { class: `chip ${sig.get(id).family}` }, lensName(sig.get(id).lens)), h('button', { class: 'link id', type: 'button', onclick: () => selectNode(id, true) }, id)), sig.get(id).claim)))));

  out.push(h('section', { class: 'sec' }, h('h2', null, '내보내기 · 기록'),
    h('div', { class: 'row' }, h('button', { class: 'btn solid', type: 'button', onclick: () => saveFile(`${fileName(p)}.md`, reportMarkdown(p)) }, '보고서 받기 (.md)'),
      h('button', { class: 'btn', type: 'button', onclick: () => copy(reportMarkdown(p)) }, '보고서 복사')),
    h('details', null, h('summary', null, '실행 기록'),
      h('dl', { class: 'kv' },
        h('dt', null, '실행'), h('dd', null, `${run.at.slice(0, 16).replace('T', ' ')} · ${run.provider} · ${{ full: '처음부터', add: '새 이슈만', relink: '다시 묶기' }[run.mode]}`),
        h('dt', null, '호출'), h('dd', null, `${run.calls}회${run.tokens.in ? ` · 입력 ${run.tokens.in.toLocaleString()} · 출력 ${run.tokens.out.toLocaleString()} 토큰` : ''} · ${(run.ms / 1000).toFixed(1)}초`),
        h('dt', null, '분석한 사조'), h('dd', null, run.picks.map((x) => lensName(x.id)).join(' · ') || '없음')),
      run.failed.length || run.notes.length ? h('ul', { class: 'bullets small' }, run.failed.map((f) => h('li', null, `응답하지 못한 노드: ${lensName(f.lens)} — ${f.error}`)), run.notes.map((x) => h('li', null, x))) : null)));
  return out;
}

function nodeTab() {
  const p = S.project; const run = p.run;
  const d = S.selected ? describe(p, S.selected) : null;
  if (!d || d.kind === 'project' || d.kind === 'insight') return [h('section', { class: 'sec' }, h('p', { class: 'lead' }, '왼쪽 브레인에서 노드를 선택하세요.'), h('p', { class: 'note' }, '기준 노드는 판단 기준과 낸 판단를, 판단는 다른 판단와의 연결을 보여 준다. 연결은 여기서 고치거나 끊을 수 있다.'))];
  const sigRow = (s) => h('li', null, h('div', { class: 'row' }, h('button', { class: 'link id', type: 'button', onclick: () => selectNode(s.id, true) }, s.id), h('span', { class: 'chip ghost' }, s.issue), h('span', { class: 'chip ghost' }, STANCE[s.stance]), s.muted ? h('span', { class: 'chip red' }, '꺼짐') : null), s.claim);

  if (d.kind === 'hub') {
    return [h('section', { class: 'sec' }, h('span', { class: `chip ${d.hub.family}` }, '기본 노드군'), h('p', { class: 'lead' }, d.hub.name), h('p', { class: 'note' }, d.hub.role),
      h('p', { class: 'small' }, `기준 노드 ${d.lenses.length}개 · 이번 분석의 판단 ${d.signals.length}건`)),
    h('section', { class: 'sec' }, h('h2', null, '기준 노드'), h('ul', { class: 'list' }, d.lenses.map((l) => h('li', null, h('button', { class: 'link', type: 'button', onclick: () => selectNode(l.id, true) }, h('strong', null, l.name)), h('span', { class: 'small' }, l.summary || l.criteria)))))];
  }

  if (d.kind === 'lens' || d.kind === 'gate') {
    const l = d.lens; const ism = l.family === 'airplane';
    const muted = p.settings.muted.includes(l.id); const pinned = p.settings.pinned.includes(l.id);
    const flip = (key) => { const a = p.settings[key]; p.settings[key] = a.includes(l.id) ? a.filter((x) => x !== l.id) : [...a, l.id]; persist(); refreshGraph(); rerender(); };
    return [h('section', { class: 'sec' }, h('div', { class: 'row' }, h('span', { class: `chip ${l.family}` }, FAMILIES[l.family].short), d.kind === 'gate' ? h('span', { class: 'chip red' }, '점검 항목') : null, h('span', { class: 'id' }, `${l.id} · ${l.source}`)),
      h('p', { class: 'lead' }, l.name), ism ? h('p', { class: 'note' }, l.summary) : null,
      h('dl', { class: 'kv' }, h('dt', null, '기준'), h('dd', null, l.criteria), l.ask ? [h('dt', null, '이슈에 던지는 질문'), h('dd', null, l.ask)] : null, d.pick ? [h('dt', null, '고른 이유'), h('dd', null, d.pick.why)] : null),
      d.kind === 'gate' ? h('p', { class: 'small' }, '점검 항목은 이슈를 분석하지 않고, 통합 인사이트마다 통과 여부만 확인한다.')
        : h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => flip('muted') }, muted ? '다음 분석부터 다시 켠다' : '다음 분석부터 끈다'),
          ism ? h('button', { class: 'btn sm', type: 'button', onclick: () => flip('pinned') }, pinned ? '고정 풀기' : '다음 분석에 반드시 분석') : null)),
    ism ? h('section', { class: 'sec' }, h('h2', null, '원리'), h('ul', { class: 'bullets' }, l.principles.map((x) => h('li', null, x))),
      h('h2', null, '가져올 것'), h('ul', { class: 'bullets' }, l.take.map((x) => h('li', null, x))), h('h2', null, '두고 올 것'), h('ul', { class: 'bullets' }, l.leave.map((x) => h('li', null, x)))) : null,
    d.kind === 'lens' ? h('section', { class: 'sec' }, h('h2', null, `낸 판단 ${d.signals.length}건`), d.signals.length ? h('ul', { class: 'list' }, d.signals.map(sigRow)) : h('p', { class: 'note' }, run ? '이번 분석에서 분석하지 않았다.' : '아직 분석하지 않았다.')) : null];
  }

  if (d.kind === 'issue') {
    const i = d.issue;
    return [h('section', { class: 'sec' }, h('div', { class: 'row' }, h('span', { class: 'chip fill' }, i.id), i.root ? h('span', { class: 'chip red' }, '근본 이슈') : null),
      h('p', { class: 'lead' }, i.title || '(이슈)'), i.detail ? h('p', { class: 'note' }, i.detail) : null, i.test ? h('p', { class: 'note' }, h('strong', null, '판정 질문 '), i.test) : null,
      d.hints.length ? h('p', { class: 'small' }, `사람이 지목한 노드: ${d.hints.map((x) => lensName(x.lens)).join(' · ')}`) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { S.tab = 'mission'; renderPanel(); } }, '미션에서 고치기'))),
    h('section', { class: 'sec' }, h('h2', null, `이 이슈에 대입된 판단 ${d.signals.length}건`),
      ...Object.keys(FAMILIES).map((f) => { const mine = d.signals.filter((s) => s.family === f); return mine.length ? h('div', null, h('p', { class: 'small' }, `${FAMILIES[f].short} ${mine.length}건`), h('ul', { class: 'list' }, mine.map(sigRow))) : null; }))];
  }

  // 판단 — 연결을 고치는 자리
  const s = d.signal; const sig = new Map(run.signals.map((x) => [x.id, x]));
  const touch = (e, patch, redraw) => { Object.assign(e, patch, { by: 'human' }); S.dirty = true; persist(); refreshGraph(); if (redraw) rerender(); else renderChrome(); };
  const others = run.signals.filter((x) => x.lens !== s.lens && !d.edges.some((e) => e.from === x.id || e.to === x.id));
  const draft = { to: others[0]?.id, type: 'cause', why: '' };
  return [h('section', { class: 'sec' },
    h('div', { class: 'row' }, h('span', { class: `chip ${s.family}` }, lensName(s.lens)), h('span', { class: 'chip ghost' }, STANCE[s.stance]), h('span', { class: 'chip ghost' }, s.source), s.hinted ? h('span', { class: 'chip y' }, '사람이 지목') : null, h('span', { class: 'id' }, s.id)),
    h('p', { class: 'lead' }, s.claim),
    h('div', null, h('p', { class: 'small' }, '판단에 이른 단계'), h('ol', { class: 'chain' }, (s.ladder || []).map((x, i) => h('li', null, h('span', { class: 'step dim' }, i + 1), h('div', null, x))))),
    h('dl', { class: 'kv' },
      s.origin ? [h('dt', null, '사조가 겨눈 것'), h('dd', null, s.origin), h('dt', null, '이 이슈의 같은 구조'), h('dd', null, s.parallel), h('dt', null, '다루는 방식'), h('dd', null, s.treatment || '—'), h('dt', null, '이 사조여야 하는 이유'), h('dd', null, s.swap)] : null,
      s.against ? [h('dt', null, '통념의 틀린 점'), h('dd', null, s.against)] : null,
      h('dt', null, '달라지는 것'), h('dd', null, s.effect), h('dt', null, '근거'), h('dd', null, s.basis || '—'),
      s.leave ? [h('dt', null, '두고 올 것'), h('dd', null, s.leave)] : null,
      h('dt', null, '대입한 이슈'), h('dd', null, h('button', { class: 'link', type: 'button', onclick: () => selectNode(s.issue, true) }, `${s.issue} ${clip(p.issues.find((i) => i.id === s.issue)?.title, 36)}`)),
      h('dt', null, '강도 → 지지도'), h('dd', null, `${s.strength.toFixed(2)} → ${(run.energy?.[s.id] ?? 0).toFixed(2)} (다른 노드의 판단가 뒷받침할수록 오른다)`),
      d.insights.length ? [h('dt', null, '쓰인 인사이트'), h('dd', null, d.insights.map((n) => h('button', { class: 'link', type: 'button', style: 'display:block', onclick: () => onSelect({ id: n.id, type: 'insight' }) }, n.title)))] : null),
    h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { s.muted = !s.muted; S.dirty = true; persist(); refreshGraph(); rerender(); } }, s.muted ? '판단 다시 켜기' : '이 판단 끄기'))),
  h('section', { class: 'sec' }, h('h2', null, `연결 ${d.edges.length}건`, h('small', null, '수정 후 다시 묶기')),
    d.edges.length ? h('ul', { class: 'list' }, d.edges.map((e) => { const out = e.from === s.id; const o = sig.get(out ? e.to : e.from); const directed = e.type === 'cause' || e.type === 'condition';
      return h('li', null, h('div', { class: 'edge-row' },
        h('div', null, h('div', { class: 'row' }, h('span', { class: `chip ${e.type === 'tension' ? 'red' : 'ghost'}` }, `${directed ? (out ? '→ ' : '← ') : '↔ '}${TYPE[e.type]}`), h('span', { class: `chip ${o.family}` }, lensName(o.lens)), h('button', { class: 'link id', type: 'button', onclick: () => selectNode(o.id, true) }, o.id), e.by === 'human' ? h('span', { class: 'chip y' }, '사람') : null),
          h('p', null, clip(o.claim, 90)), h('p', { class: 'small' }, e.why),
          h('div', { class: 'ctl' },
            h('select', { 'aria-label': '관계', id: `type-${e.id}`, onchange: (ev) => touch(e, { type: ev.target.value }, true) }, Object.keys(TYPE).map((t) => h('option', { value: t, selected: t === e.type }, TYPE[t]))),
            h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: e.weight, 'aria-label': '분명한 정도', id: `w-${e.id}`, oninput: (ev) => touch(e, { weight: +ev.target.value }) }),
            directed ? h('button', { class: 'btn sm', type: 'button', onclick: () => touch(e, { from: e.to, to: e.from }, true) }, '방향 뒤집기') : null)),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { run.edges = run.edges.filter((x) => x !== e); S.dirty = true; persist(); refreshGraph(); rerender(); } }, '끊기'))); }))
      : h('p', { class: 'note' }, '다른 판단와 이어지지 않았다.'),
    others.length ? h('div', { class: 'card' }, h('strong', null, '연결 더하기'),
      field('어느 판단와', h('select', { id: 'add-to', onchange: (e) => { draft.to = e.target.value; } }, others.map((x) => h('option', { value: x.id }, `${x.id} · ${clip(x.claim, 44)}`)))),
      h('div', { class: 'grid2' }, field('관계 (이 판단 → 고른 판단)', h('select', { id: 'add-type', onchange: (e) => { draft.type = e.target.value; } }, Object.keys(TYPE).map((t) => h('option', { value: t }, TYPE[t])))),
        field('이유 한 문장', h('input', { type: 'text', id: 'add-why', oninput: (e) => { draft.why = e.target.value; } }))),
      h('div', { class: 'row' }, h('button', { class: 'btn sm solid', type: 'button', onclick: () => {
        if (!draft.why.trim()) { toast('이유 없는 연결은 받지 않는다. 한 문장으로 적는다.', true); return; }
        run.edges.push({ id: uid('H'), from: s.id, to: draft.to, type: draft.type, weight: 0.7, why: draft.why.trim(), by: 'human' }); S.dirty = true; persist(); refreshGraph(); rerender();
      } }, '잇기'))) : null)];
}

// ---------- 동작 ----------
async function propose() {
  if (!S.project.brief.what.trim()) { toast('미션의 "무엇을"부터 적는다.', true); return; }
  try { toast('이슈 후보를 뽑는 중이다.'); S.proposals = await proposeIssues(S.project, await getProvider()); rerender(); }
  catch (e) { toast(e.message, true); }
}
function newBlank() {
  const p = newProject({ title: '새 프로젝트', issues: [{ root: true }] });
  S.projects[p.id] = p; switchProject(p.id, 'mission');
}
function switchProject(id, tab) {
  if (S.running) { toast('분석이 끝난 뒤에 바꾼다.', true); renderChrome(); return; }
  S.project = S.projects[id]; S.selected = null; S.open = null; S.dirty = false; S.proposals = null; S.confirmDelete = false;
  S.tab = tab || (S.project.run ? 'insight' : 'mission');
  view.trace(null); view.select(null); persist(true); render(); view.fit();
}
function removeProject() {
  if (!S.confirmDelete) { S.confirmDelete = true; rerender(); setTimeout(() => { if (S.confirmDelete) { S.confirmDelete = false; if (S.tab === 'mission') rerender(); } }, 4000); return; }
  delete S.projects[S.project.id];
  if (!Object.keys(S.projects).length) { const p = newProject(SAMPLE); S.projects[p.id] = p; }
  switchProject(Object.keys(S.projects)[0]);
}
const fileName = (p) => (p.title || 'brain').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'brain';
async function saveFile(filename, text) {
  try {
    const dl = globalThis.claude?.use ? await globalThis.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename, data: text }); return; }
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), download: filename });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { if (e?.code !== 'declined') toast('이 화면에서는 파일로 받을 수 없다. 복사를 쓴다.', true); }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했다.'); } catch { toast('복사하지 못했다. 보고서 받기를 쓴다.', true); }
}
async function importFile(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.brief || !Array.isArray(data.issues)) throw new Error('형식');
    const p = newProject({ ...data, id: S.projects[data.id] ? undefined : data.id });
    S.projects[p.id] = p; switchProject(p.id); toast(`"${p.title}"을 가져왔다.`);
  } catch { toast('THE FROM BRAIN 프로젝트 파일이 아니다.', true); }
}

// ---------- 시작 ----------
async function init() {
  const saved = load();
  S.projects = saved?.projects || {};
  for (const id of Object.keys(S.projects)) S.projects[id] = newProject(S.projects[id]);
  S.config = { provider: 'mock', key: '', code: '', ...(saved?.config || {}) };
  S.config.openai = { ...OPENAI_DEFAULTS, ...(S.config.openai || {}), models: { ...OPENAI_DEFAULTS.models, ...(S.config.openai?.models || {}) } };
  if (!Object.keys(S.projects).length) { const p = newProject(SAMPLE); S.projects[p.id] = p; }
  S.project = S.projects[saved?.current] || Object.values(S.projects)[0];
  // 예시는 열자마자 결과가 보이게 한다 (목업 · 지연 없음)
  if (S.project.id === SAMPLE_ID && !S.project.run) { try { S.project.run = await think(S.project, createMock()); } catch { /* 예시 없이도 화면은 뜬다 */ } }
  S.tab = S.project.run ? 'insight' : 'mission';
  S.open = S.project.run?.insights?.[0]?.id || null;

  view = createView($('universe'), { onSelect, onHover });
  $('btn-think').addEventListener('click', () => go('full'));
  $('btn-new').addEventListener('click', newBlank);
  $('project-select').addEventListener('change', (e) => switchProject(e.target.value));
  $('show-signals').addEventListener('change', (e) => view.show('signals', e.target.checked));
  $('show-dormant').addEventListener('change', (e) => view.show('dormant', e.target.checked));
  $('zoom-in').addEventListener('click', () => view.zoom(1.25));
  $('zoom-out').addEventListener('click', () => view.zoom(0.8));
  $('zoom-fit').addEventListener('click', () => view.fit());
  for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.addEventListener('click', () => { S.tab = t.dataset.tab; renderPanel(); });
  render();
  if (S.open) traceInsight(S.open);
  // 아티팩트로 열렸으면 Claude 공급자를 미리 찾아 둔다
  createClaudePage().then((c) => { S.claude = c; if (c && !saved?.config) { S.config.provider = 'claude'; if (S.tab === 'mission') rerender(); else renderChrome(); } });
}
init();
