// THE FROM BRAIN — 화면. 빌드 단계 없는 ES 모듈 (standalone/ 은 같은 코드를 한 파일로 묶은 것).
// 모델이 쓴 문장은 모두 textContent로만 넣는다 — innerHTML을 쓰지 않는다.
import { newProject, buildGraph, describe, nextIssueId, lensName, activeLenses, uid, validateProject } from './graph/model.js';
import { CATEGORIES, TAGS, COMMON_INPUT, SEED_INPUT, PERSPECTIVES, tagById, categoryById, categoriesOf, recommendTags, recommendCategory } from '../knowledge/tags.js';
import { createView } from './graph/view.js';
import { shapeFor, PRESETS, LAYER_ROLES, LAYER_FORMS, FIGURES, figureParts } from './graph/shapes.js';
import { think, proposeIssues, researchFacts } from './engine/think.js';
import { FACT_KINDS, SOURCE_TYPES, factKind, sourceType, factProblem, validFacts, nextFactId, factsToMarkdown, parseFactbook } from '../knowledge/facts.js';
import { WEIGHTS, SEED_PRECEDENTS, normalizeWeights } from '../knowledge/viewpoint.js';
import { DIFFERENTIATION, EFFECTIVENESS } from '../knowledge/criteria.js';
import { ISM_DEPTH } from '../knowledge/ism-depth.js';
import { ISM_PLAIN } from '../knowledge/ism-plain.js';
import { reportMarkdown } from './engine/report.js';
import { createMock } from './providers/mock.js';
import { createOpenAI, OPENAI_DEFAULTS } from './providers/openai.js';
import { createClaudePage } from './providers/claude-page.js';
import { createAnthropic, ANTHROPIC_DEFAULTS } from './providers/anthropic.js';
import { TIERS } from '../knowledge/orchestration.js';
import { CLOUD, cloudOn } from './cloud/config.js';
import { createCloud, ROLES, canUse, isAdmin } from './cloud/supabase.js';
import { SAMPLE, SAMPLE_ID } from '../knowledge/sample-project.js';
import { FAMILIES, LENSES, DEFAULTS, IDENTITY } from '../knowledge/nodes.js';

const LS = 'thefrom-brain:v1';
// 판정 사례 — 프로젝트와 따로 저장한다. 프로젝트가 바뀌어도 더프롬의 판정은 이어진다.
const LS_CASES = 'thefrom-brain:precedents';
function loadCases() { try { const raw = JSON.parse(localStorage.getItem(LS_CASES) || 'null'); if (Array.isArray(raw)) return raw; } catch { /* 저장소를 못 쓰면 기본 사례만 */ } return SEED_PRECEDENTS.map((c) => ({ ...c })); }
function saveCases(list) { try { localStorage.setItem(LS_CASES, JSON.stringify(list)); } catch { /* 저장 실패는 화면을 막지 않는다 */ } }
const $ = (id) => document.getElementById(id);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPE = { cause: '원인', condition: '조건', reinforce: '강화', tension: '충돌' };
const STANCE = { keep: '지킬 관성', change: '바꿀 해석', limit: '넘지 않을 경계', open: '비어 있는 자리' };
const STAGE = { plan: '기획 틀로 정리하는 중', creative: '디자인 틀로 정리하는 중', baseline: '기본안 받는 중', reframe: '문제 다시 정의하는 중', cross: '충돌하는 안 교배 중', screen: '기본안과 대조 중', duel: '점수 없이 1:1로 겨루는 중', forge: '이긴 안 공격 · 보완 중', verdict: '더프롬 판정 중', route: '사조 고르는 중', link: '연결 판단 중', propagate: '판단 묶는 중', direct: '디렉션 정리 중' };

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

// ---------- 패널 컴포넌트 ----------
const TIPS = {
  충돌: '두 판단이 같은 자리에서 서로 반대를 요구하는 관계다. 한쪽을 따르면 다른 쪽을 지킬 수 없다. 브레인은 충돌하는 두 안을 둘 다 살리는 안을 따로 만들어 후보에 넣는다.',
  차별화: '다르기만 한 것은 차별화가 아니다. 타겟에게 의미가 있고 경쟁이 대신할 수 없어야 한다. 4단계로 본다.',
  실효성: '성공 기준과 목적에 실제로 닿는 정도다. 성공 기준에 닿지 못하면 "목적 미달"이다. 3단계로 본다.',
  기조: '이 안이 공격을 받기 전에 정한, 끝까지 지킬 방향이다. 무엇에 거는지와 그 대신 포기한 것을 적는다. 고칠 때 이 방향은 바꾸지 않는다.',
  강점: '이 안의 근거가 된 판단을 낸 노드, 안에서 풀어낸 충돌, 이긴 대결, 공격을 받고 고친 곳이다.',
  약점: '이 안이 따르지 않은 판단(충돌), 진 대결과 그 이유, 고치지 못한 공격, 미달인 점검, 판단을 미룬 것이다.',
};
/** 낱말 옆 물음표 — 올리면 설명이 뜬다 */
const tip = (label, text = TIPS[label], cls = '') => h('span', { class: `help ${cls}`, tabindex: '0', 'data-tip': text }, label, h('i', { 'aria-hidden': 'true' }, '?'));
/** 숫자 타일 */
const tile = (num, label, sub = '', cls = '') => h('div', { class: `tile ${cls}` }, h('b', null, num), h('span', null, label), sub ? h('small', null, sub) : null);
/** 단계 막대 — 수준을 글 대신 칸으로 보여 준다 */
const meter = (name, levels, cur, note = '') => { const at = levels.indexOf(cur); return h('div', { class: `meter${at < 0 ? ' none' : at === 0 ? ' low' : ''}` },
  h('div', { class: 'meter-h' }, tip(name), h('strong', null, cur || '판단 보류'), note ? h('small', null, note) : null),
  h('div', { class: 'meter-b', role: 'img', 'aria-label': `${name} ${levels.length}단계 중 ${at + 1}단계` }, levels.map((l, i) => h('i', { class: i <= at ? 'on' : '', title: l })))); };
/** 접는 구역 — 다시 그려도 열림 상태를 지킨다 */
const fold = (key, title, note, kids, cls = '') => h('details', { class: `fold ${cls}`, open: S.folds.has(key), ontoggle: (e) => { if (e.target.open) S.folds.add(key); else S.folds.delete(key); } }, h('summary', null, h('strong', null, title), note ? h('small', null, note) : null), kids);
/** 노드 칩 — 누르면 브레인 맵에서 그 노드를 고른다 */
const nodeChip = (lens, family, title = '', extra = '') => h('button', { class: `chip nodechip ${family}`, type: 'button', title, onclick: () => { document.querySelector('.modal-back')?.remove(); selectNode(lens, true); } }, lensName(lens), extra ? h('em', null, extra) : null);

/**
 * 인사이트의 강점과 약점 — 노드 연결에서 읽는다.
 *   강점  근거 판단을 낸 노드 · 안에서 푼 충돌 · 고친 공격
 *   약점  이 안이 따르지 않은 판단(충돌 연결의 반대편) · 고치지 못한 공격 · 미달 점검 · 미룬 판단
 */
/** 받은 공격과 고친 것을 짝짓는다 — 고친 것마다 낱말이 가장 많이 겹치는 공격 하나에 붙인다. 고친 안이 채택됐을 때만. */
function fixMap(n) {
  const out = new Map(); if (!n.revised) return out;
  const words = (t) => new Set(String(t || '').split(/[\s,.·()'"]+/).filter((w) => w.length > 1));
  const attacks = n.attacks || [];
  for (const f of n.fixed || []) {
    const fw = words(f.hit); let best = null; let top = 0;
    for (const x of attacks) { if (out.has(x)) continue; let k = 0; for (const w of words(x.hit)) if (fw.has(w)) k++; if (k > top) { top = k; best = x; } }
    if (best && top >= 2) out.set(best, f);
  }
  return out;
}
function insightLinks(n, run) {
  const sig = new Map(run.signals.map((x) => [x.id, x]));
  const used = new Set(n.check.used);
  const byLens = new Map();
  for (const id of n.check.used) { const x = sig.get(id); if (x) byLens.set(x.lens, [...(byLens.get(x.lens) || []), x]); }
  const tens = run.edges.filter((e) => e.type === 'tension' && sig.has(e.from) && sig.has(e.to));
  const solved = tens.filter((e) => used.has(e.from) && used.has(e.to));
  const against = tens.filter((e) => used.has(e.from) !== used.has(e.to)).map((e) => ({ e, mine: sig.get(used.has(e.from) ? e.from : e.to), other: sig.get(used.has(e.from) ? e.to : e.from) }));
  const attacks = n.attacks || [];
  const fx = fixMap(n);
  const fixed = attacks.filter((x) => fx.has(x));
  const answered = new Set([...(n.costs || []), ...(n.refused || [])].map((r) => r.hit));
  const open = attacks.filter((x) => !fx.has(x) && !answered.has(x.hit)).slice(0, Math.max(0, attacks.length - fx.size - answered.size));
  const v = n.from;
  // 대결 기록 — 이 안이 진 대결의 상대와 이유는 약점이고, 이긴 대결은 강점이다
  const cands = new Map((run.arena?.candidates || []).map((c) => [c.id, c]));
  const mine = (run.arena?.duels || []).filter((d) => n.candidate && (d.a === n.candidate || d.b === n.candidate) && d.stage !== '재대결' && !d.split && d.winner);
  const won = mine.filter((d) => d.winner === n.candidate);
  const lost = mine.filter((d) => d.winner !== n.candidate).map((d) => ({ d, by: cands.get(d.winner) }));
  return { byLens, solved, against, fixed, open, won, lost, failed: v ? v.checks.filter((c) => c.result === '미달') : [], held: v ? v.held.length + v.blank.length : 0, sig };
}
function prosCons(n, run) {
  const L = insightLinks(n, run);
  const empty = h('p', { class: 'small' }, '없음');
  const pros = [
    L.byLens.size ? h('div', null, h('p', { class: 'pc-h' }, `받치는 노드 ${L.byLens.size}개`), h('div', { class: 'row' }, [...L.byLens].map(([lens, list]) => nodeChip(lens, list[0].family, list.map((x) => x.claim).join('\n'), list.length > 1 ? ` ${list.length}` : '')))) : null,
    L.solved.length ? h('div', null, h('p', { class: 'pc-h' }, tip(`푼 충돌 ${L.solved.length}건`, TIPS.충돌)), L.solved.map((e) => h('p', { class: 'pc-row', title: e.why }, nodeChip(L.sig.get(e.from).lens, L.sig.get(e.from).family), ' ↔ ', nodeChip(L.sig.get(e.to).lens, L.sig.get(e.to).family)))) : null,
    L.won.length ? h('p', { class: 'pc-h', title: L.won.map((d) => d.why).join('\n') }, `이긴 대결 ${L.won.length}건`) : null,
    L.fixed.length ? h('div', null, h('p', { class: 'pc-h' }, `고친 공격 ${L.fixed.length}건`), h('div', { class: 'row tight' }, [...new Set(L.fixed.map((x) => x.from))].map((from) => { const list = L.fixed.filter((x) => x.from === from); return h('span', { class: 'chip ghost', title: list.map((x) => x.hit).join('\n') }, from, list.length > 1 ? ` ${list.length}` : ''); }))) : null,
  ].filter(Boolean);
  const cons = [
    L.against.length ? h('div', null, h('p', { class: 'pc-h' }, tip(`부딪히는 노드 ${new Set(L.against.map((a) => a.other.lens)).size}개`, '이 안이 따르지 않은 판단이다. 그 판단을 낸 노드의 기준에서는 이 안이 약하다.')), L.against.map((a) => h('p', { class: 'pc-row', title: a.e.why }, nodeChip(a.other.lens, a.other.family), h('span', null, clip(a.other.claim, 46))))) : null,
    L.lost.length ? h('div', null, h('p', { class: 'pc-h' }, `진 대결 ${L.lost.length}건`), L.lost.slice(0, 2).map((x) => h('p', { class: 'pc-row', title: `${x.by?.title || ''}\n${x.d.why}` }, h('span', { class: 'chip ghost' }, clip(x.by?.from || x.d.winner, 18)), h('span', null, clip(x.d.why, 46)))), L.lost.length > 2 ? h('p', { class: 'small', title: L.lost.slice(2).map((x) => x.d.why).join('\n') }, `외 ${L.lost.length - 2}건`) : null) : null,
    L.open.length ? h('div', null, h('p', { class: 'pc-h' }, `남은 공격 ${L.open.length}건`), h('ul', { class: 'bullets small' }, L.open.map((x) => h('li', { title: x.hit }, `${x.from} — ${clip(x.hit, 44)}`)))) : null,
    (n.costs || []).length ? h('div', null, h('p', { class: 'pc-h' }, tip(`감수한 대가 ${n.costs.length}건`, '기조를 택했기 때문에 따라오는 약점이다. 고치지 않고 감수하기로 한 것이다.')), h('ul', { class: 'bullets small' }, n.costs.map((x) => h('li', { title: x.hit }, clip(x.note, 60))))) : null,
    (n.refused || []).length ? h('div', null, h('p', { class: 'pc-h' }, tip(`받지 않은 공격 ${n.refused.length}건`, '이 공격을 받으면 다른 안이 된다고 보고 고치지 않은 것이다. 사람이 다시 판단할 수 있다.')), h('ul', { class: 'bullets small' }, n.refused.map((x) => h('li', { title: x.note }, clip(x.hit, 60))))) : null,
    L.failed.length ? h('div', null, h('p', { class: 'pc-h' }, `미달 점검 ${L.failed.length}건`), h('div', { class: 'row' }, L.failed.map((c) => h('span', { class: 'chip warn', title: c.why }, c.item)))) : null,
    L.held ? h('p', { class: 'pc-h' }, `판단을 미룬 것 ${L.held}건`) : null,
  ].filter(Boolean);
  return h('div', { class: 'pc' },
    h('div', { class: 'pro' }, h('h4', null, tip('강점')), pros.length ? pros : empty),
    h('div', { class: 'con' }, h('h4', null, tip('약점')), cons.length ? cons : empty));
}

// ---------- 상태 ----------
const S = { projects: {}, project: null, config: null, tab: 'insight', selected: null, open: null, running: null, dirty: false, claude: null, proposals: null, confirmDelete: false, folds: new Set() };
let view;

function load() {
  try { const raw = JSON.parse(localStorage.getItem(LS) || 'null'); if (raw && raw.projects) return raw; } catch { /* 저장소를 못 쓰면 빈 상태로 */ }
  return null;
}
let saveTimer = 0;
function persist(now = false) {
  clearTimeout(saveTimer);
  // 로그인해서 쓸 때는 프로젝트를 서버에 둔다. 이 브라우저에는 예시와 설정만 남긴다
  const local = S.cloud ? Object.fromEntries(Object.entries(S.projects).filter(([, p]) => p.example)) : S.projects;
  const write = () => { try { localStorage.setItem(LS, JSON.stringify({ projects: local, current: S.project.id, config: S.config })); } catch { /* 저장 실패는 화면을 막지 않는다 */ } };
  if (now) write(); else saveTimer = setTimeout(write, 400);
  cloudSave(now);
}
/** 고칠 수 있는 프로젝트인가 — 만든 사람과 관리자만. 서버(RLS)도 같은 규칙으로 막는다 */
const canEdit = (p) => !S.cloud || !p || p.example || !p.owner || p.owner === S.me?.id || isAdmin(S.me?.role);
let cloudTimer = 0;
function cloudSave(now = false) {
  const p = S.project;
  if (!S.cloud || !S.me || !p || p.example || p._stub || !canEdit(p)) return;
  clearTimeout(cloudTimer);
  const run = async () => { try { await S.cloud.saveProject(p); S.saveError = ''; } catch (e) { if (S.saveError !== e.message) toast(`저장하지 못했다 — ${e.message}`, true); S.saveError = e.message; } };
  if (now) run(); else cloudTimer = setTimeout(run, 1500);
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
  if (c.provider === 'anthropic') return createAnthropic(S.cloud ? { ...c.anthropic, mode: 'proxy' } : c.anthropic, { getKey: () => c.akey, getCode: () => c.code, getToken: async () => (S.cloud ? S.cloud.token() : '') });
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
      mode, signal: ctrl.signal, precedents: loadCases(),
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
function refreshGraph() { view.setShape(shapeFor(S.project)); view.setData(buildGraph(S.project)); }

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
  if (node.type === 'insight') { S.tab = 'insight'; S.open = node.id; S.selected = null; traceInsight(node.id); view.select(node.id); renderPanel(); insightModal(node.id); return; }
  if (node.type === 'project') { S.tab = 'mission'; S.selected = null; view.trace(null); renderPanel(); return; }
  selectNode(node.id);
}

/** 통합 인사이트 상세 — 브레인 맵의 노란 노드를 누르면 크게 띄운다. 어느 기본 노드에서 나왔는지(계보)를 맨 위에 둔다 */
function insightModal(id) {
  document.querySelector('.modal-back')?.remove();
  const run = S.project.run; const n = run?.insights?.find((x) => x.id === id); if (!n) return;
  const sig = new Map(run.signals.map((x) => [x.id, x]));
  const used = n.check.used.map((x) => sig.get(x)).filter(Boolean);
  const fams = Object.keys(FAMILIES).filter((f) => used.some((x) => x.family === f));
  const close = () => back.remove();
  const v = n.from;
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': '통합 인사이트 상세' },
      h('div', { class: 'row' }, h('span', { class: 'chip y fill' }, `통합 인사이트 ${n.id}`), v ? h('span', { class: `chip ${v.verdict === '기각' ? 'warn' : 'y'}` }, `더프롬 ${v.verdict}`) : null, n.contested ? h('span', { class: 'chip warn' }, '판정 갈림') : null, h('button', { class: 'btn sm', type: 'button', style: 'margin-left:auto', onclick: close }, '닫기')),
      h('h2', null, n.title),
      h('p', { class: 'lead' }, n.concept),
      h('div', { class: 'lineage' }, h('span', { class: 'small' }, '계보'), ...fams.flatMap((f, i) => [i ? h('span', { class: 'small' }, '+') : null, h('span', { class: `chip ${f}` }, FAMILIES[f].short), h('span', { class: 'arrow' }, '→'), ...[...new Set(used.filter((x) => x.family === f).map((x) => x.lens))].map((l) => h('span', { class: 'chip pink' }, lensName(l)))]), h('span', { class: 'arrow' }, '→'), h('span', { class: 'chip y fill' }, n.id)),
      h('div', { class: 'grid2' },
        h('dl', { class: 'kv' }, h('dt', null, '보이는 표현'), h('dd', null, n.visual), h('dt', null, '사용자가 얻는 것'), h('dd', null, `${n.substitute.who} ${n.substitute.changes}`.trim()), h('dt', null, '기본안과 다른 점'), h('dd', null, n.without?.difference || '—')),
        v ? h('div', { class: 'meters' }, meter('차별화', DIFFERENTIATION.levels, v.differentiation.level), v.differentiation.place ? h('p', { class: 'small' }, `기억되는 자리: ${v.differentiation.place}`) : null, meter('실효성', EFFECTIVENESS.levels, v.effectiveness.level, v.effectiveness.confidence), v.effectiveness.success ? h('p', { class: 'small' }, `성공 기준: ${v.effectiveness.success}`) : null, v.push ? h('p', { class: 'push' }, h('b', null, '더 밀 곳'), v.push) : null) : null),
      prosCons(n, run),
      h('p', { class: 'small' }, `근거 판단 ${used.length}건 · 근거 팩트 ${(n.facts || []).length}건 · 받은 공격 ${(n.attacks || []).length}건. 노드 이름을 누르면 브레인 맵에서 그 노드로 간다.`)));
  document.body.append(back);
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
  sel.replaceChildren(...Object.values(S.projects).map((p) => h('option', { value: p.id, selected: p.id === S.project.id }, `${p.example ? '[예시] ' : ''}${p.title || '(이름 없음)'}${S.me && p.owner && p.owner !== S.me.id ? ` · ${String(p.ownerEmail || '').split('@')[0]}` : ''}`)));
  const r = S.running;
  $('btn-think').textContent = r ? '멈춤' : S.project.run ? '처음부터 다시 분석' : '분석 시작';
  $('run-status').className = `status${r ? ' live' : ''}`;
  $('run-status').textContent = r
    ? (r.stage === 'activate' ? `분석 ${r.fired}/${r.total}` : r.stage === 'integrate' ? `통합 ${r.done}/${r.count}` : STAGE[r.stage] || '준비 중')
    : `MODEL · ${{ mock: 'MOCK', claude: 'CLAUDE', anthropic: 'CLAUDE API', openai: 'OPENAI' }[S.config.provider]}`;

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

// ---------- 팩트북 ----------
const FACT_STATE = (f) => (f.by === 'ai' ? (f.checked ? 'AI 조사 · 확인함' : 'AI 조사 · 확인 전') : '직접 입력');
function factbookBoard(p) {
  p.facts = p.facts || [];
  const { facts: ok } = validFacts(p);
  const unchecked = ok.filter((f) => f.by === 'ai' && !f.checked).length;
  const touch = () => { p.updated = new Date().toISOString(); S.dirty = true; persist(); rerender(); };
  const draft = S.factDraft || (S.factDraft = { kind: 'stat', sourceType: 'stat', text: '', source: '', date: '', url: '' });
  const set = (k) => (e) => { draft[k] = e.target.value; };
  const add = () => {
    const f = { id: nextFactId(p), ...draft, text: draft.text.trim(), source: draft.source.trim(), by: 'human', checked: true };
    const why = factProblem(f);
    if (why) { toast(`팩트를 넣지 못했다 — ${why}`, true); return; }
    p.facts.push(f); S.factDraft = null; touch();
  };
  const research = async () => {
    if (S.researching) return;
    S.researching = true; rerender();
    try {
      const provider = await getProvider();
      const got = await researchFacts(p, provider);
      p.facts.push(...got.facts);
      S.researchNote = { added: got.facts.length, rejected: got.rejected, missing: got.missing };
      toast(`팩트 ${got.facts.length}건 추가 · 출처 조건으로 제외 ${got.rejected.length}건`);
    } catch (e) { toast(e.message, true); } finally { S.researching = false; touch(); }
  };
  const importMd = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const list = parseFactbook(await file.text());
    const have = new Set(p.facts.map((f) => f.id));
    for (const f of list) { if (have.has(f.id)) f.id = nextFactId({ facts: [...p.facts] }); p.facts.push(f); have.add(f.id); }
    toast(`팩트북에서 ${list.length}건을 읽었다`); e.target.value = ''; touch();
  };
  const note = S.researchNote;
  return h('section', { class: 'sec' }, h('h2', null, '팩트북', h('small', null, '출처가 있는 실제 자료')),
    h('p', { class: 'lead sm' }, ok.length ? `팩트 ${ok.length}건${unchecked ? ` · 사람이 원문을 확인하지 않은 것 ${unchecked}건` : ''}${p.facts.length - ok.length ? ` · 출처 조건 미달로 제외 ${p.facts.length - ok.length}건` : ''}` : '팩트가 없다. 터널(시장 · 브랜드 · 타겟 · 사용 습관) 판단이 모두 추정으로 표시된다.'),
    h('p', { class: 'small' }, `받는 출처: ${SOURCE_TYPES.filter((t) => t.ai).map((t) => t.name).join(' · ')}. 언론 기사 · 블로그 · 출처 없는 자료는 받지 않는다.`),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', disabled: S.researching ? '' : null, onclick: research }, S.researching ? '조사하는 중…' : 'AI 조사로 채우기'),
      h('label', { class: 'btn', style: 'display:inline-flex;align-items:center' }, '팩트북 md 불러오기', h('input', { type: 'file', accept: '.md,text/markdown,text/plain', class: 'sr', onchange: importMd })),
      h('button', { class: 'btn', type: 'button', onclick: () => saveFile(`${fileName(p)}-팩트북.md`, factsToMarkdown(p)) }, '팩트북 md 내보내기')),
    note ? h('div', { class: 'banner' }, `조사 결과: 추가 ${note.added}건.`, note.rejected.length ? ` 제외 ${note.rejected.length}건 — ${note.rejected.slice(0, 4).map((r) => `${clip(r.text, 18)}(${r.why})`).join(', ')}.` : '', note.missing.length ? ` 찾지 못한 것: ${note.missing.join(' / ')}` : '') : null,
    p.facts.length ? h('ul', { class: 'list' }, p.facts.map((f) => {
      const why = factProblem(f);
      return h('li', { class: why ? 'off' : '' },
        h('div', { class: 'row' }, h('span', { class: 'chip fill' }, f.id), h('span', { class: 'chip ghost' }, factKind(f.kind)?.name || '?'), h('span', { class: `chip ${f.by === 'ai' && !f.checked ? 'warn' : 'ghost'}` }, FACT_STATE(f)), why ? h('span', { class: 'chip warn' }, `제외 — ${why}`) : null),
        f.text,
        h('p', { class: 'small' }, `${sourceType(f.sourceType)?.name || '출처 유형 없음'} — ${f.source || '출처 없음'}${f.date ? ` · ${f.date}` : ''}`, f.quote ? ` · "${f.quote}"` : ''),
        h('div', { class: 'row' },
          /^https?:\/\//i.test(f.url || '') ? h('a', { class: 'link', href: f.url, target: '_blank', rel: 'noopener noreferrer' }, '원문 열기') : null,
          f.by === 'ai' ? h('button', { class: 'btn sm', type: 'button', onclick: () => { f.checked = !f.checked; touch(); } }, f.checked ? '확인 취소' : '원문 확인함') : null,
          h('button', { class: 'btn sm', type: 'button', onclick: () => { p.facts = p.facts.filter((x) => x !== f); touch(); } }, '지우기')));
    })) : null,
    h('details', null, h('summary', { class: 'small' }, '직접 넣기'),
      h('div', { class: 'grid3' },
        field('종류', h('select', { onchange: set('kind') }, FACT_KINDS.map((k) => h('option', { value: k.id, selected: draft.kind === k.id ? '' : null }, k.name)))),
        field('출처 유형', h('select', { onchange: set('sourceType') }, SOURCE_TYPES.map((t) => h('option', { value: t.id, selected: draft.sourceType === t.id ? '' : null }, t.name)))),
        field('날짜', h('input', { type: 'text', placeholder: '2026-03', value: draft.date, oninput: set('date') }))),
      field('사실 한 문장', h('input', { type: 'text', value: draft.text, oninput: set('text') })),
      field('출처 (기관 · 문서 이름)', h('input', { type: 'text', value: draft.source, oninput: set('source') })),
      field('원문 주소', h('input', { type: 'text', placeholder: 'https://', value: draft.url, oninput: set('url') })),
      h('button', { class: 'btn', type: 'button', onclick: add }, '팩트 추가')));
}

// ---------- 더프롬의 관점 ----------
function weightRow(p) {
  const w = normalizeWeights(p.settings.weights || WEIGHTS);
  return h('div', null, h('p', { class: 'small' }, '더프롬 판정의 기준별 무게 (%) — 합은 자동으로 100에 맞춘다'),
    h('div', { class: 'grid3' }, IDENTITY.map((l) => field(l.name, h('input', { type: 'number', min: 0, max: 100, step: 5, value: Math.round(w[l.id] * 100), onchange: (e) => { p.settings.weights = normalizeWeights({ ...w, [l.id]: Math.max(0, +e.target.value || 0) / 100 }); S.dirty = true; persist(); rerender(); } })))));
}
function casesBoard() {
  const list = loadCases();
  return h('section', { class: 'sec' }, h('h2', null, '판정 사례', h('small', null, `${list.length}건 · 모든 분석에 들어간다`)),
    h('p', { class: 'small' }, '대표와 디렉터가 실제로 내린 판정이다. 인사이트에서 채택 · 기각을 누르면 여기에 쌓이고, 다음 분석부터 같은 잣대로 쓴다. 최근 12건이 쓰인다.'),
    h('ul', { class: 'list' }, list.map((c) => h('li', null, h('div', { class: 'row' }, h('span', { class: `chip ${c.verdict === '기각' ? 'warn' : 'y'}` }, c.verdict), h('strong', null, clip(c.what, 60)),
      h('button', { class: 'btn sm', type: 'button', onclick: () => { saveCases(loadCases().filter((x) => x.id !== c.id)); rerender(); } }, '지우기')), c.why))));
}
/** 사람의 판정 — 인사이트에 채택 · 기각과 이유를 남기면 판정 사례가 된다 */
function humanVerdict(n) {
  const d = (S.caseDraft && S.caseDraft.id === n.id) ? S.caseDraft : (S.caseDraft = { id: n.id, why: '' });
  const save = (verdict) => {
    if (!d.why.trim()) { toast('이유를 한 문장 적어야 사례로 쓸 수 있다.', true); return; }
    const list = loadCases();
    list.push({ id: `PR-${Date.now().toString(36)}`, verdict, what: `${n.title} — ${clip(n.insight, 90)}`, why: d.why.trim(), at: new Date().toISOString().slice(0, 10) });
    saveCases(list); n.human = { verdict, why: d.why.trim() }; S.caseDraft = null; persist(); toast(`판정 사례로 저장했다 (${verdict})`); rerender();
  };
  return h('div', { class: 'tension' }, h('b', null, n.human ? `내 판정: ${n.human.verdict}` : '내 판정 남기기'),
    n.human ? n.human.why : h('div', null,
      h('input', { type: 'text', placeholder: '이유 한 문장 — 다음 분석의 잣대가 된다', value: d.why, oninput: (e) => { d.why = e.target.value; } }),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => save('채택') }, '채택'), h('button', { class: 'btn sm', type: 'button', onclick: () => save('기각') }, '기각'))));
}
function fromBoard(n) {
  const v = n.from; if (!v) return null;
  const answers = (c, a) => c.questions.filter((q) => a[q.id]).map((q) => h('li', null, a[q.id]));
  const mark = { 통과: 'ghost', 미달: 'warn', '확인 필요': 'ghost' };
  return h('div', null,
    h('p', { class: 'small' }, '더프롬 판정 — 점수를 매기지 않는다. 물음에 답한 판정문과 수준, 판단을 미룬 것을 적는다'),
    h('div', { class: 'row' }, v.checks.map((c) => h('span', { class: `chip ${mark[c.result]}`, title: c.why }, `${c.item} · ${c.result}`))),
    h('dl', { class: 'kv' },
      h('dt', null, `차별화 — ${v.differentiation.level || '판단 보류'}`), h('dd', null, h('ul', { class: 'bullets' }, answers(DIFFERENTIATION, v.differentiation))),
      h('dt', null, `실효성 — ${v.effectiveness.level || '판단 보류'} (${v.effectiveness.confidence})`), h('dd', null, h('ul', { class: 'bullets' }, answers(EFFECTIVENESS, v.effectiveness)))),
    v.capped ? h('p', { class: 'small' }, '성공 기준에 닿지 못해 실효성을 "목적 미달"로 두고 채택하지 않았다.') : null,
    v.held.length || v.blank.length ? h('div', { class: 'tension' }, h('b', null, `판단을 미룬 것 ${v.held.length + v.blank.length}건`), h('ul', { class: 'bullets' }, v.held.map((x) => h('li', null, x)), v.blank.length ? h('li', null, `답하지 못한 물음: ${v.blank.join(', ')}`) : null)) : null,
    v.safe ? h('p', { class: 'small' }, `무난해서 고르기 쉬운 부분: ${v.safe}`) : null,
    v.push ? h('p', null, h('strong', null, `더 밀 곳: ${v.push}`)) : null,
    v.precedent ? h('p', { class: 'small' }, `쓴 판정 사례: ${v.precedent}`) : null);
}

function missionTab() {
  const p = S.project; const b = p.brief; const c = S.config;
  const out = [];
  if (p.example) out.push(h('div', { class: 'banner' }, '예시 프로젝트다. 판단·연결·인사이트는 구조를 보여 주려고 미리 써 둔 답이며, 목업 공급자에서만 나온다. 내 과제는 ', h('button', { class: 'link', type: 'button', onclick: newBlank }, '새 프로젝트'), '로 시작한다.'));

  // 계정 — 로그인해서 쓸 때만
  if (S.me) out.push(h('section', { class: 'sec' }, h('h2', null, '계정', h('small', null, ROLES[S.me.role])),
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, S.me.email),
      isAdmin(S.me.role) ? h('button', { class: 'btn sm', type: 'button', id: 'btn-users', onclick: usersModal }, '사용자 관리') : null,
      h('button', { class: 'btn sm', type: 'button', id: 'btn-logout', onclick: async () => { await S.cloud.signOut(); location.reload(); } }, '로그아웃'))));
  if (S.me && !canEdit(p)) out.push(h('div', { class: 'banner warn' }, h('strong', null, '읽기 전용 — '), `${p.ownerEmail || '다른 사람'}이 만든 프로젝트다. 여기서 고치거나 분석한 내용은 저장되지 않는다. `,
    h('button', { class: 'link', type: 'button', onclick: copyAsMine }, '내 프로젝트로 복사'), '하면 고칠 수 있다.'));

  const allText = () => [p.title, ...Object.values(b), ...p.issues.flatMap((i) => [i.title, i.detail])].join(' ');
  out.push(h('section', { class: 'sec' }, h('h2', null, '공통 인풋', h('small', null, '모든 프로젝트 공통')),
    field('프로젝트', bind(p, 'title', { graph: true, id: 'f-title' })),
    h('div', { class: 'grid2' }, COMMON_INPUT.map((f) => field(`${f.label}${f.required ? ' · 필수' : ''}`, bind(b, f.id, { area: true, id: `f-${f.id}`, placeholder: f.hint }))))));

  // 분류는 여러 개 고를 수 있다 — 마케팅 + 운영처럼 걸치는 과제가 있다. 고른 분류마다 특화 인풋이 열린다
  const cats = categoriesOf(p);
  const guess = recommendCategory(allText());
  const toggleCat = (id) => { const list = cats.includes(id) ? cats.filter((x) => x !== id) : [...cats, id]; p.categories = list; p.category = list[0] || null; persist(); rerender(); };
  for (const id of cats) p.seed[id] = p.seed[id] || {};
  out.push(h('section', { class: 'sec' }, h('h2', null, '분류와 특화 인풋', h('small', null, '여러 개 고를 수 있다')),
    h('div', { class: 'row' }, CATEGORIES.map((c) => h('button', { type: 'button', class: `chip pick${cats.includes(c.id) ? ' y' : ''}`, 'aria-pressed': String(cats.includes(c.id)), title: c.role, onclick: () => toggleCat(c.id) }, c.name))),
    !cats.length && guess ? h('p', { class: 'small' }, '입력한 글로 보면 ', h('button', { class: 'link', type: 'button', onclick: () => toggleCat(guess) }, categoryById(guess).name), ' 분류에 가깝다.') : null,
    cats.map((id) => { const cat = categoryById(id); return [h('p', { class: 'small' }, h('strong', null, cat.name), ` — ${cat.role}`),
      h('div', { class: 'grid2' }, SEED_INPUT[id].map((f) => field(`${f.label}${f.required ? ' · 필수' : ''}`, bind(p.seed[id], f.id, { area: true, id: `seed-${id}-${f.id}`, placeholder: f.hint }))))]; })));

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
      h('ul', { class: 'list' }, S.proposals.map((c) => h('li', null, h('div', { class: 'row' }, h('span', { class: `chip ${c.root ? 'red' : 'ghost'}` }, c.root ? '근본 이슈' : '이슈'), h('strong', { class: 'grow' }, c.title), c.misses ? h('span', { class: 'chip warn', title: c.misses }, '목적 일부만 덮음') : null,
        h('button', { class: 'btn sm', type: 'button', onclick: () => { p.issues.push({ id: nextIssueId(p), title: c.title, detail: c.detail, test: c.test, tags: [], root: c.root && !p.issues.some((x) => x.root) }); S.proposals = S.proposals.filter((x) => x !== c); persist(); S.keepScroll = true; render(); } }, '더하기')),
      c.detail ? h('p', { class: 'small' }, c.detail) : null, c.test ? h('p', { class: 'small' }, `판정 질문: ${c.test}`) : null)))) : null));

  const v = validateProject(p);
  out.push(factbookBoard(p));

  out.push(h('section', { class: 'sec' }, h('h2', null, '세팅 점검', h('small', null, `분석에 들어가는 이슈 ${v.ready.length}/${p.issues.length}건`)),
    v.ok ? h('p', { class: 'note' }, '빠진 칸이 없다.')
      : h('ul', { class: 'bullets' }, v.problems.map((x) => h('li', null, h('strong', null, `${x.where} `), x.what))),
    v.ok ? null : h('p', { class: 'small' }, v.blocking ? '근본 이슈의 틀이 채워져야 사고를 시작할 수 있다.' : '빠진 칸이 있어도 시작할 수 있다. 틀을 채우지 못한 이슈는 분석에서 빠지고, 빈 인풋에 기대는 디렉션은 "확인할 것"으로 남는다.')));

  const num = (key, label, min, max) => field(label, h('select', { id: `set-${key}`, onchange: (e) => { p.settings[key] = +e.target.value; persist(); } },
    Array.from({ length: max - min + 1 }, (_, n) => h('option', { value: min + n, selected: (p.settings[key] ?? DEFAULTS[key]) === min + n }, min + n))));
  out.push(h('section', { class: 'sec' }, h('h2', null, '분석 설정'),
    h('div', { class: 'grid3' }, num('ismCount', '분석할 사조 수', 2, 6), num('insightCount', '통합 인사이트 수', 1, 5), num('signalsPerLens', '노드·이슈당 판단', 1, 3)),
    h('p', { class: 'small' }, `호출 수 = 기본안 1 + 사조 고르기 1 + 노드 ${10 + (p.settings.ismCount ?? DEFAULTS.ismCount)} + 연결 1 + 인사이트 ${p.settings.insightCount ?? DEFAULTS.insightCount} + 경쟁 약 25 + 더프롬 판정 1 + 디렉션 1 + 기획 틀 1 + 디자인 틀 2`),
    ));
  out.push(casesBoard());

  const o = c.openai;
  const cfg = (obj, key, attrs) => h('input', { type: 'text', value: obj[key] || '', ...attrs, oninput: (e) => { obj[key] = e.target.value.trim(); persist(); } });
  // 브레인 맵 모양 — 프로젝트마다 고른다. 노드와 판단은 그대로이고 자리와 색만 바뀐다
  {
    const st = p.settings; const look = st.look || { kind: 'brain' };
    const setLook = (next) => { st.look = next; persist(); refreshGraph(); rerender(); };
    const fig = FIGURES[look.kind] ? look.kind : null;
    const layers = fig ? null : look.kind === 'stack' ? look.layers : look.kind !== 'brain' && PRESETS[look.kind] ? PRESETS[look.kind].layers : null;
    const edit = (i, key, value) => { const list = layers.map((l) => ({ ...l })); list[i][key] = value; setLook({ kind: 'stack', name: look.name || PRESETS[look.kind]?.name || '내 형상', layers: list }); };
    const parts = fig ? figureParts(fig, look.parts) : null;
    const editPart = (id, key, value) => setLook({ kind: fig, parts: { ...(look.parts || {}), [id]: { ...(look.parts?.[id] || {}), [key]: value } } });
    out.push(h('section', { class: 'sec' }, h('h2', null, '브레인 맵 모양', h('small', null, '이 프로젝트에만 적용')),
      field('형상', h('select', { id: 'set-look', onchange: (e) => setLook({ kind: e.target.value }) },
        h('option', { value: 'brain', selected: look.kind === 'brain' }, '뇌 — 기본'),
        Object.entries(PRESETS).map(([id, d]) => h('option', { value: id, selected: look.kind === id }, `${d.name} — 층 ${d.layers.length}개`)),
        Object.entries(FIGURES).map(([id, d]) => h('option', { value: id, selected: look.kind === id }, `${d.name} — 부분 ${d.parts().length}개`)),
        look.kind === 'stack' ? h('option', { value: 'stack', selected: true }, `${look.name || '내 형상'} — 고친 것`) : null)),
      layers ? [h('p', { class: 'small' }, '위에서 아래 순서다. 층마다 이름, 색, 맡는 노드군을 고친다.'),
        h('div', { class: 'layers' }, layers.map((l, i) => h('div', { class: 'layer' },
          h('input', { type: 'color', value: l.color, 'aria-label': `${l.name} 색`, onchange: (e) => edit(i, 'color', e.target.value) }),
          h('input', { type: 'text', value: l.name, 'aria-label': '층 이름', onchange: (e) => edit(i, 'name', e.target.value.trim() || l.name) }),
          h('select', { 'aria-label': `${l.name}이 맡는 것`, onchange: (e) => edit(i, 'role', e.target.value) }, LAYER_ROLES.map((r) => h('option', { value: r.id, selected: l.role === r.id }, r.name))),
          h('select', { 'aria-label': `${l.name}의 모양`, onchange: (e) => edit(i, 'form', e.target.value) }, LAYER_FORMS.map((f) => h('option', { value: f.id, selected: l.form === f.id }, f.name)))))),
      ] : parts ? [h('p', { class: 'small' }, '부분마다 이름, 색, 맡는 노드군을 고친다. 외곽선은 정해져 있다.'),
        h('div', { class: 'layers' }, parts.map((l) => h('div', { class: 'layer part' },
          h('input', { type: 'color', value: l.color, 'aria-label': `${l.name} 색`, onchange: (e) => editPart(l.id, 'color', e.target.value) }),
          h('input', { type: 'text', value: l.name, 'aria-label': '부분 이름', onchange: (e) => editPart(l.id, 'name', e.target.value.trim() || l.name) }),
          h('select', { 'aria-label': `${l.name}이 맡는 것`, onchange: (e) => editPart(l.id, 'role', e.target.value) }, LAYER_ROLES.map((r) => h('option', { value: r.id, selected: l.role === r.id }, r.name)))))),
      ] : h('p', { class: 'small' }, '층이나 외곽선 형상으로 바꾸면 부분마다 색과 맡는 노드군을 정할 수 있다.')));
  }

  out.push(h('section', { class: 'sec' }, h('h2', null, '모델'),
    field('공급자', h('select', { id: 'set-provider', onchange: (e) => { c.provider = e.target.value; persist(); rerender(); } },
      h('option', { value: 'mock', selected: c.provider === 'mock' }, '목업 — API 없이 구조 확인'),
      h('option', { value: 'anthropic', selected: c.provider === 'anthropic' }, 'Claude API — 주 모델 Opus · 보조 모델 Sonnet'),
      h('option', { value: 'claude', selected: c.provider === 'claude' }, 'Claude — claude.ai 아티팩트로 열었을 때'),
      h('option', { value: 'openai', selected: c.provider === 'openai' }, 'OpenAI — FREATIVE 1.x와 같은 모델'))),
    c.provider === 'mock' ? h('p', { class: 'small' }, '목업 문장은 판단이 아니다. "[목업]"이 붙은 틀 문장이 나온다.') : null,
    c.provider === 'claude' ? h('p', { class: 'small' }, '보는 사람의 Claude에게 묻는다. 첫 실행에서 동의를 묻고, 키는 필요 없다. 로컬 파일로 연 화면에서는 쓸 수 없다.') : null,
    c.provider === 'anthropic' && S.cloud ? [
      h('p', { class: 'small' }, '서버에 둔 키로 부른다. 로그인하고 승인된 사용자만 쓸 수 있다. 주 모델은 방향을 정하는 호출, 보조 모델은 정리와 대조를 맡는다.'),
      h('div', { class: 'grid2' }, field(TIERS.lead.name, cfg(c.anthropic.models, 'lead', { id: 'set-m-lead' })), field(TIERS.support.name, cfg(c.anthropic.models, 'support', { id: 'set-m-support' }))),
    ] : null,
    c.provider === 'anthropic' && !S.cloud ? [
      h('p', { class: 'small' }, '호출마다 급을 붙여 모델을 고른다. 주 모델은 방향을 정하는 호출(근본 이슈 · 문제 정의 · 판단 도출 · 충돌 교배 · 기조 · 보완 · 최종 판정), 보조 모델은 정리와 대조를 맡는다.'),
      field('키를 두는 곳', h('select', { id: 'set-amode', onchange: (e) => { c.anthropic.mode = e.target.value; persist(); rerender(); } },
        h('option', { value: 'direct', selected: c.anthropic.mode === 'direct' }, '내 키 — 이 브라우저에만 저장'),
        h('option', { value: 'proxy', selected: c.anthropic.mode === 'proxy' }, '서버 키 — server.js 또는 Vercel 함수가 대신 호출'))),
      c.anthropic.mode === 'direct' ? field('Claude API 키', cfg(c, 'akey', { type: 'password', id: 'set-akey', autocomplete: 'off', placeholder: 'sk-ant-…' }))
        : h('div', { class: 'grid2' }, field('프록시 주소', cfg(c.anthropic, 'proxyUrl', { id: 'set-aproxy' })), field('접속 코드 (설정한 경우)', cfg(c, 'code', { type: 'password', id: 'set-acode', autocomplete: 'off' }))),
      h('div', { class: 'grid2' }, field(TIERS.lead.name, cfg(c.anthropic.models, 'lead', { id: 'set-m-lead' })), field(TIERS.support.name, cfg(c.anthropic.models, 'support', { id: 'set-m-support' }))),
      c.anthropic.mode === 'direct' ? h('p', { class: 'small' }, '브라우저에서 직접 부른다. 조직 설정에 따라 직접 호출이 막혀 있으면 "서버 키"로 바꾼다.') : null,
    ] : null,
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
  const rec = recommendTags(`${i.title} ${i.detail}`, { category: categoriesOf(p)[0] || null, limit: 4 }).filter((r) => !i.tags.includes(r.id));
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

/** 프레임 — 기획 틀(Concept Theme까지)과 디자인 틀(Creative 방향까지). 확정은 사람이 한다 */
function frameBoard(run) {
  const p = run.plan; if (!p) return null;
  const src = (ids) => (ids?.length ? h('span', { class: 'small' }, ` (${ids.join(', ')})`) : null);
  const confirm = (obj, label) => h('button', { class: `btn sm ${obj.confirmed ? 'solid' : ''}`, type: 'button', onclick: () => { obj.confirmed = !obj.confirmed; persist(); rerender(); } }, obj.confirmed ? `${label} 확정됨` : `${label} 확정`);
  const out = [h('section', { class: 'sec' }, h('h2', null, '기획 틀', h('small', null, 'JTBD → 경쟁 구도 → 포지셔닝 → KSF → Key Claim → Concept Theme')),
    p.check.ok ? null : h('div', { class: 'banner warn' }, h('strong', null, '채우지 못한 칸 — '), p.check.problems.join(' / ')),
    h('p', { class: 'lead sm' }, `Concept Theme: ${p.theme.theme || '—'}`), p.theme.why ? h('p', { class: 'small' }, p.theme.why, src(p.theme.from)) : null,
    h('dl', { class: 'kv' },
      h('dt', null, 'JTBD'), h('dd', null, [p.jtbd.situation, p.jtbd.motivation, p.jtbd.outcome].filter(Boolean).join(' → ') || '—', src(p.jtbd.from)),
      h('dt', null, '경쟁 구도'), h('dd', null, p.competition.length ? p.competition.map((c) => h('div', null, `${c.who}: ${c.does} / 못 하는 것: ${c.gap}`, src(c.from))) : '—'),
      h('dt', null, '포지셔닝'), h('dd', null, p.positioning.place ? `${p.positioning.axis} — 모두가 선 자리: ${p.positioning.crowd} / 빈자리: ${p.positioning.place}` : '—', src(p.positioning.from)),
      h('dt', null, 'KSF'), h('dd', null, p.ksf.length ? h('ul', { class: 'bullets' }, p.ksf.map((k) => h('li', null, k.factor, src(k.from)))) : '—'),
      h('dt', null, 'Key Claim'), h('dd', null, h('strong', null, p.claim.claim || '—'), p.claim.rtb.length ? h('div', { class: 'small' }, `믿게 하는 근거: ${p.claim.rtb.join(' / ')}`) : null, src(p.claim.from))),
    p.need.length ? h('p', { class: 'small' }, `확인할 것: ${p.need.join(' / ')}`) : null,
    h('div', { class: 'row' }, confirm(p, 'Concept Theme')))];
  const c = run.creative;
  if (c) out.push(h('section', { class: 'sec' }, h('h2', null, '디자인 틀', h('small', null, 'FoR → PoP → PoD → Creative 방향')),
    c.check.problems.length ? h('div', { class: `banner ${c.check.ok ? '' : 'warn'}` }, c.check.problems.join(' / ')) : null,
    h('p', { class: 'lead sm' }, `Creative 방향: ${c.direction || '—'}`),
    h('dl', { class: 'kv' },
      h('dt', null, 'FoR'), h('dd', null, c.for.frame || '—', src(c.for.from)),
      h('dt', null, 'PoP'), h('dd', null, h('ul', { class: 'bullets' }, c.pop.map((x) => h('li', null, x.point, src(x.from))))),
      h('dt', null, 'PoD'), h('dd', null, h('ul', { class: 'bullets' }, c.pod.map((x) => h('li', null, x.core ? h('strong', null, `[코어] ${x.point}`) : x.point, ` — ${x.matters}`, x.rtb.length ? ` · 근거: ${x.rtb.join(' / ')}` : '', src(x.from))))),
      h('dt', null, '보이는 방향'), h('dd', null, h('div', null, `지킬 것: ${c.look.keep}`), h('div', null, `바꿀 것: ${c.look.change}`), h('div', null, `하지 않을 것: ${c.look.not}`)),
      c.isms.length ? [h('dt', null, '쓰인 사조의 읽기'), h('dd', null, h('ul', { class: 'bullets' }, c.isms.map((x) => h('li', null, `${x.signal} · ${x.strand} · ${x.layer} — ${x.changed}`))))] : null,
      h('dt', null, `노하우북 ${c.knowhow.length}건`), h('dd', null, c.knowhow.length ? h('ul', { class: 'bullets' }, c.knowhow.map((k) => h('li', null, h('strong', null, `${c.chapters.find((x) => x.id === k.chapter)?.name || k.chapter} · ${k.operation}`), ` — ${k.from} → ${k.to}`, h('div', { class: 'small' }, `푸는 문제: ${k.solves} · 빼면: ${k.without}`)))) : '—')),
    h('p', { class: 'small' }, `불려 온 장: ${c.chapters.map((x) => x.name).join(' · ') || '없음'} — 조형 문제 ${c.problems.length}건에서 불렀다`),
    c.held.length ? h('p', { class: 'small' }, `시안에서 정할 것: ${c.held.join(' / ')}`) : null,
    h('div', { class: 'row' }, confirm(c, 'Creative 방향'))));
  return out;
}

/** 경쟁 기록 — 후보가 어디서 나와 어디서 떨어졌는지 */
function arenaBoard(run) {
  const a = run.arena; if (!a) return null;
  const c = a.counts;
  const rows = [...a.candidates].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99) || (y.swiss ?? -1) - (x.swiss ?? -1));
  const lost = rows.filter((k) => k.screen?.verdict === '다름' && k.status.startsWith('탈락'));
  const row = (k) => h('li', { class: k.status === '결선 통과' ? '' : 'off' },
    h('div', { class: 'row' }, h('span', { class: `chip ${k.status === '결선 통과' ? 'y' : 'ghost'}` }, k.status), h('span', { class: 'chip ghost' }, k.from), k.screen ? h('span', { class: `chip ${k.screen.verdict === '같음' ? 'warn' : 'ghost'}` }, `기본안과 ${k.screen.verdict}`) : null,
      k.seat ? h('span', { class: 'chip ghost' }, `결선 자리: ${k.seat}`) : null, k.swiss != null ? h('span', { class: 'chip ghost' }, `조별 ${k.swiss}승${k.wins != null ? ` · 결선 ${k.wins}승` : ''}`) : null, k.contested ? h('span', { class: 'chip warn' }, '판정 갈림') : null),
    h('strong', null, k.title), h('p', { class: 'small' }, k.concept), k.notable ? h('p', { class: 'small' }, `뚜렷한 점: ${k.notable}`) : null, k.screen?.breaks ? h('p', { class: 'small' }, `걸리는 제약: ${k.screen.breaks}`) : null);
  return h('section', { class: 'sec' }, h('h2', null, '경쟁 기록', h('small', null, `후보 ${c.candidates}개 → ${run.insights.length}개`)),
    h('p', { class: 'lead sm' }, `후보 ${c.candidates}개(노드의 완성안 ${c.node} · 묶음 통합안 ${c.cluster} · 충돌 교배 ${c.cross}). 사유가 있어 탈락 `, h('em', null, `${c.screened}개`), `, 나머지는 점수 없이 ${c.duels}번 겨뤘다. 결선에서 판정이 갈린 대결 ${c.splits}건.`, c.groups != null ? ` 결선 ${c.finalists}개를 다시 견주니 서로 다른 해법은 ${c.groups}개였다. 같은 해법이라 빠진 안 ${c.merged}개, 예비에서 올린 안 ${c.reserve}개.` : ''),
    run.frames?.length ? h('div', null, h('p', { class: 'small' }, '다시 정의한 문제'), h('ul', { class: 'list' }, run.frames.map((f) => h('li', null, h('div', { class: 'row' }, h('span', { class: 'chip ghost' }, f.id), h('strong', null, f.frame)), f.why, f.risk ? h('p', { class: 'small' }, `부딪히는 요구: ${f.risk}`) : null)))) : null,
    lost.length ? h('div', null, h('p', { class: 'small' }, `기본안에 없는 해법인데 떨어진 후보 ${lost.length}개 — 살릴 안이 있으면 인사이트처럼 판정을 남긴다`), h('ul', { class: 'list' }, lost.map((k) => h('li', null, [...row(k).childNodes], rescue(k))))) : null,
    h('details', null, h('summary', { class: 'small' }, `후보 ${c.candidates}개 전체 보기`), h('ul', { class: 'list' }, rows.map(row))));
}
/** 떨어진 후보를 사람이 살린다 — 판정 사례로 남아 다음 분석의 잣대가 된다 */
function rescue(k) {
  const d = (S.caseDraft && S.caseDraft.id === k.id) ? S.caseDraft : null;
  if (!d) return h('button', { class: 'btn sm', type: 'button', onclick: () => { S.caseDraft = { id: k.id, why: '' }; rerender(); } }, '이 안을 살린다');
  return h('div', null, h('input', { type: 'text', placeholder: '살리는 이유 한 문장', value: d.why, oninput: (e) => { d.why = e.target.value; } }),
    h('button', { class: 'btn sm', type: 'button', onclick: () => { if (!d.why.trim()) { toast('이유를 한 문장 적어야 사례로 쓸 수 있다.', true); return; } const list = loadCases(); list.push({ id: `PR-${Date.now().toString(36)}`, verdict: '채택', what: `${k.title} — ${clip(k.concept, 90)}`, why: `경쟁에서 떨어졌지만 살렸다: ${d.why.trim()}`, at: new Date().toISOString().slice(0, 10) }); saveCases(list); S.caseDraft = null; toast('판정 사례로 저장했다. 다음 분석부터 반영된다.'); rerender(); } }, '채택으로 저장'));
}

function insightTab() {
  const p = S.project; const run = p.run;
  if (!run || !run.insights?.length) {
    return [h('section', { class: 'sec' }, h('p', { class: 'lead' }, S.running ? '분석하는 중이다.' : '아직 분석하지 않았다.'),
      h('p', { class: 'note' }, '분석 시작을 누르면 아래 일곱 단계가 이어서 진행된다.'),
      h('ol', { class: 'steps' }, [
        ['기본안과 문제 다시 정의', '브리프만 읽고 낸 안 3개를 먼저 받고, 그 안을 넘으려면 문제를 어떻게 달리 물어야 하는지 정한다.'],
        ['노드별 분석', '각 기준 노드가 같은 미션과 이슈를 받아 따로 판단을 낸다. 근거 단계를 쓰지 못한 판단은 제외한다.'],
        ['연결', '판단끼리 원인·조건·강화·충돌 관계를 찾는다. 이유가 없는 연결은 제외한다.'],
        ['묶기', '서로 강하게 연결된 판단을 계산으로 묶는다. 입력이 같으면 결과도 같다.'],
        ['후보 모으기', '노드가 자기 기준을 끝까지 민 완성안, 묶음 통합안, 충돌하는 두 안의 교배안을 모은다.'],
        ['경쟁', '기본안과 같은 안만 떨어뜨리고, 나머지는 점수 없이 1:1로 겨룬다. 최종안은 서로 다른 해법이어야 하고, 이긴 안은 공격을 받고 고친다.'],
        ['디렉션', '인사이트를 기획·디자인·개발·서비스 담당의 할 일로 정리하고, 인사이트가 기본안과 같은 해법인지 판정한다.'],
      ].map(([t, d], i) => h('li', null, h('b', null, i + 1), h('div', null, h('strong', null, t), h('p', { class: 'note' }, d))))))];
  }
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const u = run.usage; const k = run.link;
  const flagged = run.insights.filter((i) => !i.check.ok).length;
  const out = [];
  const vcount = (v) => (run.verdict?.items || []).filter((x) => x.verdict === v).length;

  // 요약 — 숫자 타일 4개와 노드군별 사용 막대
  out.push(h('section', { class: 'sec' },
    h('div', { class: 'tiles' },
      tile(run.insights.length, '인사이트', run.verdict?.items?.length ? `채택 ${vcount('채택')} · 보완 ${vcount('보완')}${vcount('기각') ? ` · 기각 ${vcount('기각')}` : ''}${vcount('보류') ? ` · 보류 ${vcount('보류')}` : ''}` : '', 'y'),
      tile(`${u.used}/${u.signals}`, '쓰인 판단', `${pct(u.used, u.signals)}%`),
      tile(k.byType.tension, tip('충돌'), `연결 ${k.edges}건 중`, 'red'),
      u.tunnel ? tile(`${u.tunnel.backed}/${u.tunnel.signals}`, '팩트 근거', u.tunnel.assumed ? `추정 ${u.tunnel.assumed}건` : '터널 판단') : null),
    h('div', { class: 'bars' }, Object.keys(FAMILIES).flatMap((f) => { const b = u.byFamily[f]; return [h('span', null, FAMILIES[f].short), h('div', { class: 'track' }, h('i', { style: `width:${pct(b.used, b.signals)}%` })), h('span', null, `${b.used}/${b.signals}건`)]; })),
    flagged ? h('p', { class: 'small' }, `검증을 통과하지 못한 인사이트 ${flagged}건.`) : null,
    run.scope?.gap ? h('div', { class: 'banner warn' }, h('strong', null, '근본 이슈가 덮지 못한 것 — '), run.scope.gap) : null,
    run.facts?.unchecked ? h('p', { class: 'small' }, `사람이 확인하지 않은 팩트 ${run.facts.unchecked}건.`) : null,
    p.example && run.provider === 'mock' ? h('p', { class: 'small' }, '예시 결과다. 미리 써 둔 답이라 실제 모델의 품질과 다르다.') : null));

  // 인사이트 — 결과를 먼저 보여 준다
  out.push(h('section', { class: 'sec' }, h('h2', null, '통합 인사이트', h('small', null, '누르면 브레인 맵에 근거 경로가 켜진다')),
    ...run.insights.map((n, idx) => {
      const open = S.open === n.id; const c = n.check; const v = n.from; const ov = overlapOf(run, n.id);
      const L = insightLinks(n, run);
      const weak = new Set(L.against.map((a) => a.other.lens)).size + L.lost.length + L.open.length + L.failed.length;
      const pass = v ? v.checks.filter((x) => x.result === '통과').length : 0;
      return h('article', { class: `insight${c.ok ? '' : ' flag'}${open ? ' on' : ''}` },
        h('button', { class: 'open', type: 'button', 'aria-expanded': String(open), onclick: () => { S.open = open ? null : n.id; S.selected = null; if (S.open) traceInsight(n.id); else { view.trace(null); view.select(null); } rerender(); } },
          h('span', { class: 'no' }, idx + 1), h('div', null, h('h3', null, n.title),
            h('div', { class: 'row tight' },
              v ? h('span', { class: `chip ${v.verdict === '기각' ? 'warn' : v.verdict === '채택' ? 'y fill' : 'y'}` }, v.verdict) : null,
              v ? h('span', { class: 'chip ghost' }, v.differentiation.level || '차별화 보류') : null,
              v ? h('span', { class: `chip ${v.effectiveness.level === '목적 미달' ? 'warn' : 'ghost'}` }, v.effectiveness.level || '실효성 보류') : null,
              n.contested ? h('span', { class: 'chip warn' }, '판정 갈림') : null,
              ov && ov.verdict === '같음' ? h('span', { class: 'chip warn' }, OVERLAP_LABEL[ov.verdict]) : null,
              h('span', { class: 'chip ghost' }, `강점 ${L.byLens.size} · 약점 ${weak}`)))),
        open ? h('div', { class: 'more' },
          c.ok ? null : h('div', { class: 'banner warn' }, h('strong', null, '검증 미통과 — '), c.problems.join(' / ')),
          h('p', { class: 'concept' }, n.concept),
          n.stance?.bet ? h('div', { class: 'push stance' }, h('b', null, tip('기조')), n.stance.bet, n.stance.givesUp ? h('small', null, `포기한 것: ${n.stance.givesUp}`) : null, n.reverted ? h('small', null, n.rematch) : n.kept ? h('small', null, `고친 뒤 기조: ${n.kept}`) : null) : null,
          v ? h('div', { class: 'meters' },
            meter('차별화', DIFFERENTIATION.levels, v.differentiation.level),
            meter('실효성', EFFECTIVENESS.levels, v.effectiveness.level, v.effectiveness.confidence),
            h('div', { class: 'row tight' }, h('span', { class: 'chip ghost' }, `점검 ${v.checks.length}개 중 통과 ${pass}`), v.checks.filter((x) => x.result !== '통과').map((x) => h('span', { class: `chip ${x.result === '미달' ? 'warn' : 'ghost'}`, title: x.why }, `${x.item} · ${x.result}`)))) : null,
          v?.capped ? h('p', { class: 'small' }, '성공 기준에 닿지 못해 실효성을 "목적 미달"로 두고 채택하지 않았다.') : null,
          prosCons(n, run),
          v?.push ? h('p', { class: 'push' }, h('b', null, '더 밀 곳'), v.push) : null,
          h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => insightModal(n.id) }, '크게 보기')),
          h('div', { class: 'folds' }, fold(`${n.id}:look`, '보이는 표현 · 사용자가 얻는 것', '', h('dl', { class: 'kv' },
            h('dt', null, '보이는 표현'), h('dd', null, n.visual),
            h('dt', null, '얻는 것'), h('dd', null, `${n.substitute.who} ${n.substitute.changes}`.trim()),
            h('dt', null, '지킬 관성'), h('dd', null, n.keep),
            h('dt', null, '바꿀 해석'), h('dd', null, n.change),
            n.without?.difference ? [h('dt', null, n.without.nearest ? `기본안 ${n.without.nearest}과 다른 점` : '기본안과 다른 점'), h('dd', null, n.without.difference)] : null)),
          v ? fold(`${n.id}:verdict`, '판정문', `미룬 판단 ${v.held.length + v.blank.length}건`, fromBoard(n)) : null,
          fold(`${n.id}:chain`, '근거', `판단 ${c.used.length}건 · 노드 ${c.lenses.length}개 · 팩트 ${(n.facts || []).length}건`, [
            h('div', null, h('div', { class: 'cover', role: 'img', 'aria-label': '근거 판단의 노드군 구성' }, Object.keys(FAMILIES).map((f) => h('i', { class: f, style: `width:${pct(c.byFamily[f], c.used.length)}%` }))),
              h('div', { class: 'cover-key' }, Object.keys(FAMILIES).map((f) => h('span', null, `${FAMILIES[f].short} ${c.byFamily[f]}건`)))),
            h('ol', { class: 'chain' }, n.chain.map((x, i) => h('li', null, h('span', { class: 'step' }, i + 1),
              h('div', null, x.says, h('div', { class: 'meta' }, h('span', { class: 'chip ghost' }, x.role), nodeChip(sig.get(x.signal).lens, sig.get(x.signal).family),
                h('button', { class: 'link id', type: 'button', onclick: () => selectNode(x.signal, true) }, x.signal)))))),
            n.tension ? h('div', { class: 'tension' }, h('b', null, tip(`충돌 ${n.tension.a} ↔ ${n.tension.b}`, TIPS.충돌)), n.tension.resolve) : null,
            n.facts?.length ? h('ul', { class: 'bullets small' }, n.facts.map((id) => { const f = (p.facts || []).find((x) => x.id === id); return h('li', null, `${id} ${f ? `${clip(f.text, 60)} (${f.source})` : ''}`); })) : h('p', { class: 'small' }, '근거 팩트 없음. 시장과 타겟에 대한 말은 추정이다.')]),
          n.attacks?.length ? fold(`${n.id}:attack`, '받은 공격', `${n.attacks.length}건 중 ${L.fixed.length}건 고침`, [
            n.bold ? h('p', { class: 'small' }, `공격한 쪽이 짚은 지킬 것: ${n.bold}`) : null,
            h('ul', { class: 'bullets' }, n.attacks.map((x) => { const fx = fixMap(n).get(x); return h('li', null, h('span', { class: `chip ${x.severity >= 3 ? 'warn' : 'ghost'}` }, `${x.from} · ${x.severity}`), ` ${x.hit}`, fx ? h('div', { class: 'small' }, `→ ${fx.fix}`) : null); }))]) : null,
          n.open.length ? fold(`${n.id}:open`, '사람이 확인할 것', `${n.open.length}건`, h('ul', { class: 'bullets' }, n.open.map((x) => h('li', null, x)))) : null,
          fold(`${n.id}:human`, '내 판정 남기기', '다음 분석의 판정 사례가 된다', humanVerdict(n)))) : null);
    })));

  // 나머지는 접어 둔다
  const fb = frameBoard(run); if (fb) out.push(fold('frames', '기획 틀 · 디자인 틀', '이긴 안을 틀로 정리한 것', fb, 'big'));
  const board = directionBoard(run); if (board) out.push(fold('direction', '관점별 디렉션', '기획 · 디자인 · 개발 · 서비스', board, 'big'));
  const base = baselineBoard(run); if (base) out.push(fold('baseline', '기본안 대조', '방법론 없이 낸 안과 비교', base, 'big'));
  const ar = arenaBoard(run); if (ar) out.push(fold('arena', '경쟁 기록', `후보 ${run.arena.counts.candidates}개 · 대결 ${run.arena.counts.duels}번`, ar, 'big'));

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
  if (!d || d.kind === 'project' || d.kind === 'insight') return [h('section', { class: 'sec' }, h('p', { class: 'lead' }, '왼쪽 브레인에서 노드를 선택하세요.'), h('p', { class: 'note' }, '기준 노드는 판단 기준과 낸 판단을, 판단은 다른 판단과의 연결을 보여 준다. 연결은 여기서 고치거나 끊을 수 있다.'))];
  const sigRow = (s) => h('li', null, h('div', { class: 'row' }, h('button', { class: 'link id', type: 'button', onclick: () => selectNode(s.id, true) }, s.id), h('span', { class: 'chip ghost' }, s.issue), h('span', { class: 'chip ghost' }, STANCE[s.stance]), s.muted ? h('span', { class: 'chip red' }, '꺼짐') : null), s.claim);

  if (d.kind === 'fact') {
    const f = d.fact;
    return [h('section', { class: 'sec' }, h('div', { class: 'row' }, h('span', { class: 'chip fill' }, f.id), h('span', { class: 'chip ghost' }, factKind(f.kind)?.name || '팩트'), h('span', { class: `chip ${f.by === 'ai' && !f.checked ? 'warn' : 'ghost'}` }, FACT_STATE(f))),
      h('p', { class: 'lead' }, f.text),
      h('dl', { class: 'kv' }, h('dt', null, '출처'), h('dd', null, `${sourceType(f.sourceType)?.name || ''} — ${f.source}${f.date ? ` · ${f.date}` : ''}`), f.quote ? [h('dt', null, '근거 구절'), h('dd', null, f.quote)] : null,
        /^https?:\/\//i.test(f.url || '') ? [h('dt', null, '원문'), h('dd', null, h('a', { class: 'link', href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.url))] : null)),
    h('section', { class: 'sec' }, h('h2', null, `이 팩트에 기댄 판단 ${d.signals.length}건`), h('ul', { class: 'list' }, d.signals.map(sigRow)))];
  }

  if (d.kind === 'hub') {
    return [h('section', { class: 'sec' }, h('span', { class: `chip ${d.hub.family}` }, '기본 노드군'), h('p', { class: 'lead' }, d.hub.name), h('p', { class: 'note' }, d.hub.role),
      h('p', { class: 'small' }, `기준 노드 ${d.lenses.length}개 · 이번 분석의 판단 ${d.signals.length}건`)),
    h('section', { class: 'sec' }, h('h2', null, '기준 노드'), h('ul', { class: 'list' }, d.lenses.map((l) => h('li', null, h('button', { class: 'link', type: 'button', onclick: () => selectNode(l.id, true) }, h('strong', null, l.name)), h('span', { class: 'small' }, (ISM_PLAIN[l.id]?.summary || l.summary) || l.criteria)))))];
  }

  if (d.kind === 'lens' || d.kind === 'gate') {
    const l = d.lens; const ism = l.family === 'airplane';
    const muted = p.settings.muted.includes(l.id); const pinned = p.settings.pinned.includes(l.id);
    const flip = (key) => { const a = p.settings[key]; p.settings[key] = a.includes(l.id) ? a.filter((x) => x !== l.id) : [...a, l.id]; persist(); refreshGraph(); rerender(); };
    return [h('section', { class: 'sec' }, h('div', { class: 'row' }, h('span', { class: `chip ${l.family}` }, FAMILIES[l.family].short), d.kind === 'gate' ? h('span', { class: 'chip red' }, '점검 항목') : null, h('span', { class: 'id' }, `${l.id} · ${l.source}`)),
      h('p', { class: 'lead' }, l.name), ism ? h('p', { class: 'note' }, ISM_PLAIN[l.id]?.summary || l.summary) : null,
      ism ? (d.pick ? h('div', { class: 'push' }, h('b', null, '이번 과제에 고른 이유'), d.pick.why) : null)
        : h('dl', { class: 'kv' }, h('dt', null, '기준'), h('dd', null, l.criteria), l.ask ? [h('dt', null, '이슈에 던지는 질문'), h('dd', null, l.ask)] : null),
      d.kind === 'gate' ? h('p', { class: 'small' }, '점검 항목은 이슈를 분석하지 않고, 통합 인사이트마다 통과 여부만 확인한다.')
        : h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => flip('muted') }, muted ? '다음 분석부터 다시 켠다' : '다음 분석부터 끈다'),
          ism ? h('button', { class: 'btn sm', type: 'button', onclick: () => flip('pinned') }, pinned ? '고정 풀기' : '다음 분석에 반드시 분석') : null)),
    ism ? h('section', { class: 'sec' },
      ISM_PLAIN[l.id] ? [h('h2', null, '원리', h('small', null, '초안 · 사내 검수 전')), h('ol', { class: 'plain' }, ISM_PLAIN[l.id].principles.map((x) => h('li', null, x)))] : null,
      h('div', { class: 'folds' },
        ISM_DEPTH[l.id] ? fold(`${l.id}:depth`, '배경', '시대 조건 · 갈래 · 모순', h('dl', { class: 'kv' },
          h('dt', null, '시대 조건'), h('dd', null, ISM_DEPTH[l.id].era),
          h('dt', null, '던진 질문'), h('dd', null, h('strong', null, ISM_DEPTH[l.id].question)),
          h('dt', null, '갈래'), h('dd', null, ISM_DEPTH[l.id].strands.map((x) => h('div', null, h('strong', null, x.name), ` ${x.how}`))),
          h('dt', null, '내부 모순'), h('dd', null, ISM_DEPTH[l.id].paradox),
          h('dt', null, '후대의 변용'), h('dd', null, ISM_DEPTH[l.id].after))) : null,
        fold(`${l.id}:orig`, '카탈로그 원문', '스킬 저장소의 문장 그대로', [h('ul', { class: 'bullets small' }, l.principles.map((x) => h('li', null, x))), h('p', { class: 'small' }, '지난 적용 메모 (규칙이 아니다)'), h('ul', { class: 'bullets small' }, [...l.take, ...l.leave].map((x) => h('li', null, x)))]))) : null,
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
      s.origin ? [h('dt', null, '시대'), h('dd', null, s.origin), h('dt', null, '지금의 같은 압력'), h('dd', null, s.parallel),
        s.strand ? [h('dt', null, '고른 갈래'), h('dd', null, s.strand)] : null, s.paradox ? [h('dt', null, '사조의 모순'), h('dd', null, s.paradox)] : null,
        s.reading ? [h('dt', null, '읽기'), h('dd', null, h('strong', null, s.reading))] : null,
        s.layer ? [h('dt', null, '층 · 세기'), h('dd', null, `${s.layer} · ${Math.round((s.degree ?? 0.5) * 100)}%`)] : null, s.expression ? [h('dt', null, '표현'), h('dd', null, s.expression)] : null,
        h('dt', null, '이 사조여야 하는 이유'), h('dd', null, s.swap || '—')] : null,
      s.facts?.length ? [h('dt', null, '근거 팩트'), h('dd', null, s.facts.map((id) => { const f = (p.facts || []).find((x) => x.id === id); return h('div', null, `${id} ${f ? `${clip(f.text, 60)} (${f.source})` : ''}`); }))] : null,
      s.assumed ? [h('dt', null, '주의'), h('dd', null, '팩트 없이 쓴 추정이다. 비중을 낮췄다.')] : null, s.need ? [h('dt', null, '필요한 자료'), h('dd', null, s.need)] : null,
      s.against ? [h('dt', null, '통념의 틀린 점'), h('dd', null, s.against)] : null,
      h('dt', null, '달라지는 것'), h('dd', null, s.effect), h('dt', null, '근거'), h('dd', null, s.basis || '—'),
      s.leave ? [h('dt', null, '두고 올 것'), h('dd', null, s.leave)] : null,
      h('dt', null, '대입한 이슈'), h('dd', null, h('button', { class: 'link', type: 'button', onclick: () => selectNode(s.issue, true) }, `${s.issue} ${clip(p.issues.find((i) => i.id === s.issue)?.title, 36)}`)),
      h('dt', null, '강도 → 지지도'), h('dd', null, `${s.strength.toFixed(2)} → ${(run.energy?.[s.id] ?? 0).toFixed(2)} (다른 노드의 판단이 뒷받침할수록 오른다. 아이덴티티 판단의 지지는 더 무겁다)`),
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
  if (S.me) { p.owner = S.me.id; p.ownerEmail = S.me.email; }
  S.projects[p.id] = p; switchProject(p.id, 'mission');
}
async function switchProject(id, tab) {
  if (S.running) { toast('분석이 끝난 뒤에 바꾼다.', true); renderChrome(); return; }
  if (!(await openStub(id))) { renderChrome(); return; }
  S.project = S.projects[id]; S.selected = null; S.open = null; S.dirty = false; S.proposals = null; S.confirmDelete = false;
  S.tab = tab || (S.project.run ? 'insight' : 'mission');
  view.trace(null); view.select(null); persist(true); render(); view.fit();
}
function removeProject() {
  if (!S.confirmDelete) { S.confirmDelete = true; rerender(); setTimeout(() => { if (S.confirmDelete) { S.confirmDelete = false; if (S.tab === 'mission') rerender(); } }, 4000); return; }
  if (S.cloud && !S.project.example) {
    if (!canEdit(S.project)) { toast('만든 사람이나 관리자만 지울 수 있다.', true); S.confirmDelete = false; rerender(); return; }
    S.cloud.deleteProject(S.project.id).catch((e) => toast(`지우지 못했다 — ${e.message}`, true));
  }
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
    const raw = JSON.parse(await file.text()); const data = raw?.project || raw;   // 실행 기록({ project, log })도 받는다
    if (!data || !data.brief || !Array.isArray(data.issues)) throw new Error('형식');
    const p = newProject({ ...data, id: S.projects[data.id] ? undefined : data.id });
    if (S.me) { p.owner = S.me.id; p.ownerEmail = S.me.email; }
    S.projects[p.id] = p; switchProject(p.id); toast(`"${p.title}"을 가져왔다.`);
  } catch { toast('THE FROM BRAIN 프로젝트 파일이 아니다.', true); }
}

// ---------- 로그인 · 권한 · 서버 저장 (수파베이스가 연결돼 있을 때만) ----------
/** 이름만 받아 둔 프로젝트를 서버에서 연다 */
async function openStub(id) {
  const stub = S.projects[id];
  if (!stub?._stub) return true;
  try {
    const row = await S.cloud.getProject(id);
    if (!row) throw new Error('프로젝트를 찾을 수 없다. 지워졌을 수 있다.');
    S.projects[id] = Object.assign(newProject({ ...row.data, id }), { owner: row.owner, ownerEmail: row.owner_email });
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
/** 남의 프로젝트를 내 것으로 복사한다 — 읽기 전용 프로젝트를 고쳐 보고 싶을 때 */
function copyAsMine() {
  const src = S.project; const q = newProject({ ...JSON.parse(JSON.stringify(src)), id: undefined, title: `${src.title} (복사)`, example: false });
  q.owner = S.me.id; q.ownerEmail = S.me.email; S.projects[q.id] = q; switchProject(q.id, 'mission'); toast('내 프로젝트로 복사했다.');
}

/** 로그인 화면 — 로그인 · 가입 · 승인 대기. 쓸 수 있게 되면 닫힌다 */
function enter() {
  return new Promise((resolve) => {
    const draft = { mode: 'login', email: '', password: '', name: '', msg: '', busy: false };
    const close = () => { document.getElementById('gate')?.remove(); resolve(true); };
    const check = async () => {
      if (!S.cloud.user || !(await S.cloud.token())) { draft.mode = draft.mode === 'signup' || draft.mode === 'sent' ? draft.mode : 'login'; return paint(); }
      try { S.me = await S.cloud.profile(); } catch (e) { draft.msg = e.message; draft.mode = 'login'; return paint(); }
      if (!S.me) { draft.msg = '프로필을 찾을 수 없습니다. 관리자에게 알려 주세요.'; draft.mode = 'login'; return paint(); }
      if (!canUse(S.me.role)) { draft.mode = 'pending'; return paint(); }
      close();
    };
    const submit = async (e) => {
      e.preventDefault(); if (draft.busy) return;
      const email = draft.email.trim().toLowerCase();
      if (!email.endsWith(`@${CLOUD.domain}`)) { draft.msg = `회사 메일(@${CLOUD.domain})만 쓸 수 있습니다.`; return paint(); }
      if (draft.password.length < 8) { draft.msg = '비밀번호는 8자 이상으로 정해 주세요.'; return paint(); }
      draft.busy = true; draft.msg = ''; paint();
      try {
        if (draft.mode === 'signup') { const r = await S.cloud.signUp(email, draft.password, draft.name); draft.busy = false; if (!r.confirmed) { draft.mode = 'sent'; return paint(); } }
        else await S.cloud.signIn(email, draft.password);
        draft.busy = false; await check();
      } catch (err) { draft.busy = false; draft.msg = err.message; paint(); }
    };
    const input = (key, attrs) => h('input', { value: draft[key], ...attrs, oninput: (e) => { draft[key] = e.target.value; } });
    function paint() {
      const m = draft.mode;
      const box = m === 'pending' ? [
        h('h1', null, '승인을 기다리는 중입니다'),
        h('p', { class: 'note' }, `${S.me.email} 로 가입했습니다. 관리자가 승인하면 쓸 수 있습니다. 승인을 요청할 때 본인 메일 주소를 관리자에게 직접 알려 주세요.`),
        h('div', { class: 'row' }, h('button', { class: 'btn go', type: 'button', onclick: check }, '다시 확인'), h('button', { class: 'btn', type: 'button', onclick: async () => { await S.cloud.signOut(); S.me = null; draft.mode = 'login'; paint(); } }, '로그아웃')),
      ] : m === 'sent' ? [
        h('h1', null, '확인 메일을 보냈습니다'),
        h('p', { class: 'note' }, `${draft.email} 로 온 메일의 링크를 누른 뒤 로그인해 주세요. 로그인하면 관리자 승인을 기다립니다.`),
        h('div', { class: 'row' }, h('button', { class: 'btn go', type: 'button', onclick: () => { draft.mode = 'login'; draft.msg = ''; paint(); } }, '로그인으로')),
      ] : [
        h('h1', null, m === 'signup' ? '가입' : '로그인'),
        h('p', { class: 'note' }, m === 'signup' ? `회사 메일(@${CLOUD.domain})로 가입합니다. 관리자가 승인하면 쓸 수 있습니다.` : 'THE FROM BRAIN은 승인된 사용자만 씁니다.'),
        h('form', { class: 'gate-form', onsubmit: submit },
          m === 'signup' ? field('이름', input('name', { type: 'text', id: 'gate-name', autocomplete: 'name', required: true })) : null,
          field('회사 메일', input('email', { type: 'email', id: 'gate-email', autocomplete: 'username', placeholder: `이름@${CLOUD.domain}`, required: true })),
          field('비밀번호', input('password', { type: 'password', id: 'gate-password', autocomplete: m === 'signup' ? 'new-password' : 'current-password', required: true })),
          draft.msg ? h('p', { class: 'gate-msg', role: 'alert' }, draft.msg) : null,
          h('div', { class: 'row' }, h('button', { class: 'btn go', type: 'submit', disabled: draft.busy }, draft.busy ? '확인하는 중' : m === 'signup' ? '가입하기' : '로그인'),
            h('button', { class: 'btn', type: 'button', onclick: () => { draft.mode = m === 'signup' ? 'login' : 'signup'; draft.msg = ''; paint(); } }, m === 'signup' ? '이미 가입했다' : '처음이라 가입한다'))),
      ];
      const gate = document.getElementById('gate') || document.body.appendChild(h('div', { id: 'gate', class: 'gate' }));
      gate.replaceChildren(h('div', { class: 'gate-box' }, h('p', { class: 'gate-brand' }, 'THE FROM BRAIN'), box));
    }
    // 확인 메일의 링크를 누르고 돌아왔으면 그대로 로그인한다
    const hash = location.hash;
    if (/access_token=|error_description=/.test(hash)) {
      history.replaceState(null, '', location.pathname + location.search);
      S.cloud.adoptHash(hash).catch((e) => { draft.msg = e.message; }).finally(check);
    } else check();
  });
}

/** 사용자 관리 — 관리자는 승인과 중지, 수퍼관리자는 관리자 지정까지 */
async function usersModal() {
  document.querySelector('.modal-back')?.remove();
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } }, h('div', { class: 'modal', role: 'dialog', 'aria-label': '사용자 관리' }));
  document.body.append(back);
  const boss = S.me.role === 'super_admin';
  const paint = async (msg = '') => {
    let rows = []; try { rows = await S.cloud.listProfiles(); } catch (e) { msg = e.message; }
    const act = (u, role, label) => h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await S.cloud.setRole(u.id, role); paint(`${u.email} → ${ROLES[role]}`); } catch (e) { paint(e.message); } } }, label);
    const actions = (u) => u.id === S.me.id ? h('span', { class: 'small' }, '나') : [
      u.role === 'pending' ? act(u, 'member', '승인') : null,
      u.role === 'member' ? act(u, 'pending', '사용 중지') : null,
      boss && u.role === 'member' ? act(u, 'admin', '관리자로') : null,
      boss && u.role === 'admin' ? act(u, 'member', '사용자로') : null,
      boss && u.role === 'admin' ? act(u, 'super_admin', '수퍼관리자로') : null,
      boss && u.role === 'super_admin' ? act(u, 'admin', '관리자로') : null,
    ];
    const wait = rows.filter((u) => u.role === 'pending').length;
    back.firstChild.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'chip y fill' }, '사용자 관리'), h('span', { class: 'chip ghost' }, `전체 ${rows.length}명 · 승인 대기 ${wait}명`), h('button', { class: 'btn sm', type: 'button', style: 'margin-left:auto', onclick: () => back.remove() }, '닫기')),
      msg ? h('p', { class: 'small' }, msg) : null,
      h('ul', { class: 'list users' }, rows.map((u) => h('li', null, h('div', { class: 'row' }, h('strong', { class: 'grow' }, u.email), h('span', { class: `chip ${u.role === 'pending' ? 'warn' : u.role === 'member' ? 'ghost' : 'y'}` }, ROLES[u.role]), actions(u)), u.name ? h('span', { class: 'small' }, u.name) : null))),
      h('p', { class: 'small' }, boss ? '승인, 사용 중지, 관리자 지정을 할 수 있다.' : '승인과 사용 중지를 할 수 있다. 관리자 지정은 수퍼관리자가 한다.'));
  };
  paint();
}

// ---------- 시작 ----------
async function init() {
  const saved = load();
  S.projects = saved?.projects || {};
  for (const id of Object.keys(S.projects)) S.projects[id] = newProject(S.projects[id]);
  S.config = { provider: 'mock', key: '', code: '', ...(saved?.config || {}) };
  S.config.openai = { ...OPENAI_DEFAULTS, ...(S.config.openai || {}), models: { ...OPENAI_DEFAULTS.models, ...(S.config.openai?.models || {}) } };
  S.config.anthropic = { ...ANTHROPIC_DEFAULTS, ...(S.config.anthropic || {}), models: { ...ANTHROPIC_DEFAULTS.models, ...(S.config.anthropic?.models || {}) } };
  if (cloudOn()) {
    S.cloud = createCloud(CLOUD);
    await enter();
    // 서버의 프로젝트는 이름만 먼저 받고, 열 때 내용을 받는다. 이 브라우저에 있던 것은 예시만 남긴다
    S.projects = Object.fromEntries(Object.entries(S.projects).filter(([, p]) => p.example));
    try { for (const row of await S.cloud.listProjects()) S.projects[row.id] = { id: row.id, title: row.title, owner: row.owner, ownerEmail: row.owner_email, _stub: true }; } catch (e) { toast(`프로젝트 목록을 받지 못했다 — ${e.message}`, true); }
    if (!saved?.config) { S.config.provider = 'anthropic'; }
  }
  if (!Object.keys(S.projects).length) { const p = newProject(SAMPLE); S.projects[p.id] = p; }
  let first = S.projects[saved?.current] ? saved.current : Object.keys(S.projects)[0];
  if (S.projects[first]._stub && !(await openStub(first))) { const p = newProject(SAMPLE); S.projects[p.id] = p; first = p.id; }
  S.project = S.projects[first];
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
