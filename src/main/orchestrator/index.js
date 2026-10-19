'use strict';
/**
 * Creative Travel 오케스트레이터 — 화가 · 조수 · 더프롬 판단 브레인
 *
 *  화가(director)가 미션을 접수하고 계획(사조·레이어·모델 배정)을 세운다.
 *  조수(sub)들이 병렬로 사조를 여행(Airplane)하고 레이어를 겹친다(Tunnel).
 *  더프롬 판단 브레인(brain)은 단계마다 개입한다 —
 *    · 방향 제시(direct): 단계 시작 전, 철학 렌즈와 노하우로 이 단계의 방향·지킬 것·피할 것을 준다
 *    · 검증(verify): 단계가 끝나면 렌즈별 점수와 판정(통과/보완/재작업). 재작업이면 그 단계를 다시 그린다
 *    · 공동 추론: FoR/PoP/PoD의 발상의 전환(5→3, 3→1), Concept 3→1 자체 검증은 브레인이 직접 한다
 *
 *  stage       scene       주체                          브레인
 *  brief       mission     화가                          —  (브리프 게이트)
 *  canvas      canvas      화가                          방향 · 검증
 *  airplane    airplane    조수 N → 화가                 방향(사조 계획 조정 가능) · 검증
 *  tunnel      tunnel      조수 N → 화가                 방향 · 검증
 *  positioning exit        화가                          방향 · 검증
 *  forpop      compass     화가(검증·FoR 4방식·후보5) → 조수 웹 정찰 ×3 → 브레인 전환 ×2 → 브레인 차별성 판정   발상의 전환 · 공통 범례 판정
 *  concept     newcanvas   화가 5안·1차 3안 → 브레인 3→1 → 화가 키트   방향 · 자체 검증 → C 게이트(사람)
 *  creative    gallery     화가 + 이미지 조수            방향 · 검증
 */
const path = require('path');
const knowledge = require('../knowledge');
const settings = require('../settings');
const store = require('../services/storage');
const attachments = require('../attachments');
const providers = require('../providers');
const cost = require('../cost');
const models = require('../models');
const facts = require('../facts');
const { render } = require('./prompts');
const voice = require('../voice');

const STAGES = [
  { id: 'brief', scene: 'mission', label: '미션 접수', sub: '브리프 게이트' },
  { id: 'canvas', scene: 'canvas', label: '캔버스', sub: '나로부터 · S0' },
  { id: 'airplane', scene: 'airplane', label: 'Airplane', sub: '사조 여행' },
  { id: 'tunnel', scene: 'tunnel', label: 'Tunnel', sub: '인사이트 레이어링' },
  { id: 'think', scene: 'exit', label: '생각의 회차', sub: '깊이 · 넓이 · 비틀기 · 중간 리뷰' },
  { id: 'positioning', scene: 'exit', label: 'Positioning Map', sub: '5 → 4 → 3 → 1' },
  { id: 'forpop', scene: 'compass', label: 'FoR · PoP · PoD', sub: '최종 검증 · 발상의 전환' },
  { id: 'concept', scene: 'newcanvas', label: 'Concept · Theme', sub: '5 → 3 → 1 · C 게이트' },
  { id: 'creative', scene: 'gallery', label: 'Creative', sub: '설계 · 핵심 장면' },
];
const ORDER = STAGES.map((s) => s.id);
const LABEL = Object.fromEntries(STAGES.map((s) => [s.id, `${s.label} — ${s.sub}`]));
const INTRINSIC = new Set(['forpop', 'concept']);
const SELF_BRAIN = new Set(['brief', 'think']); // 브레인이 단계 안에서 직접 움직이는 단계 — withBrain으로 감싸지 않는다
const ROUND_CAP = 8; // 생각의 회차 절대 상한 (사람이 계속 이어 가도)
const MOVES = ['깊이', '넓이', '비틀기', '조합'];
const QTYPES = ['전제 빼기', '극단 밀기', '반대편 서기', '하나만 남기기', '실패 먼저'];
const ANSWER_KO = { question: '이 질문으로 가자', half: '반만', other: '아니다 — 다른 방향', deeper: '더 깊이', wider: '더 넓게', twist: '비틀어', done: '지금 안으로 가자' };
const BASELINE_STAGES = new Set(['positioning', 'forpop', 'concept', 'creative']); // 기본안을 보고 작업하는 단계
const BASELINE_FLOOR = new Set(['creative']); // 브레인 검증에서 기본안과 같으면 자동 재작업 (concept은 3→1에서 코드로 강제)
const SCOPE_STAGES = new Set(['concept', 'creative']); // 사업 범위를 모두 다뤄야 하는 단계 // 브레인이 단계 안에서 직접 추론하는 단계

const LAYER_DEFAULTS = [
  { key: 'market', label: '시장', question: '이 카테고리는 지금 어떻게 말하고 있는가' },
  { key: 'brand', label: '브랜드', question: '무엇이 이 클라이언트만의 것인가' },
  { key: 'target', label: '타겟', question: '누가 어떤 순간에 보는가' },
  { key: 'usage', label: '사용 습관', question: '실제로 어떻게 만나고, 그 순간 무엇을 원하는가' },
];

// FoR · PoP · PoD 차별성 검토 — 세 범위 (knowledge/method/forpop.md §4)
const SCOPES = [
  { id: 'category', title: '동일 카테고리', desc: '같은 FoR 안의 직접 경쟁자 — 그들이 이미 말하는 약속 · 기능 · 경험' },
  { id: 'expanded', title: '확장 범주 · 타겟 관점', desc: '타겟이 같은 시간·돈·주의를 쓰는 대체재 — 카테고리 밖이지만 타겟에게는 같은 선택지' },
  { id: 'creative', title: '크리에이티브', desc: '광고·소재 표현 자체 — 카피 · 비주얼 문법 · 매체 사용 · 톤의 관습' },
];

const runs = new Map(); // projectId → controller

function now() { return new Date().toISOString(); }
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));

function emptyRun() {
  return {
    status: 'running',
    stage: 'brief',
    startedAt: now(),
    stages: Object.fromEntries(ORDER.map((id) => [id, { status: 'pending', progress: 0, cost: 0 }])),
    results: {},
    brain: {},
    gates: { brief: { rounds: [] }, C: { history: [] } },
    inspirations: [],
    versions: [],
    agents: [],
    lines: [],
    modelPlan: [],
    usage: { calls: 0, prompt: 0, completion: 0, cost: 0, images: 0 },
    models: { ...settings.get().openai.models },
    knowledge: knowledge.status().version,
    error: null,
  };
}

async function pLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

function typeById(id) { return knowledge.load().types.types.find((t) => t.id === id); }

function formatBrief(b) {
  const L = [];
  const row = (k, v) => { if (v && (!Array.isArray(v) || v.length)) L.push(`- **${k}**: ${Array.isArray(v) ? v.join(', ') : v}`); };
  row('프로젝트명', b.projectName);
  row('작업자', b.worker);
  row('★1 만들 것(결과물 유형)', (b.deliverables || []).map((id) => (typeById(id) || {}).label || id));
  row('결과물 범위·설명', b.deliverableNote);
  row('★6 목적', [...(b.purposes || []), b.purposeNote].filter(Boolean));
  row('★2 타겟', b.target);
  row('★1 제품/서비스', b.product);
  row('★2 채널', b.channel);
  row('★2 주 노출 디바이스', b.devices);
  row('★3 핵심 순간 — 얻고 싶은 것', b.keyMoment || '(비어 있음 — 도출 가능하면 도출)');
  row('★4 브랜드', b.brand || '(비어 있음)');
  row('★5 제약·금지·재료', b.constraints);
  row('비교·레퍼런스', b.references);
  row('★6 깊이', b.depth === 'full' ? '끝까지 (C 게이트 예비 통과 후 가이드까지)' : 'C 게이트까지 (컨셉 판정 후 가이드 생성)');
  row('지금의 나 — 요즘 꽂힌 것', b.nowFocus);
  row('메모', b.memo);
  return L.join('\n');
}

class Controller {
  constructor(projectId, emit) {
    this.id = projectId;
    this.emit = emit;
    this.abort = new AbortController();
    this.project = store.get(projectId);
    this.run = this.project.run || emptyRun();
    // 이전 버전 실행 기록 보정
    this.run.brain = this.run.brain || {};
    this.run.inspirations = this.run.inspirations || [];
    this.run.versions = this.run.versions || [];
    this.run.modelPlan = this.run.modelPlan || [];
    this.run.usage = { cost: 0, images: 0, ...this.run.usage };
    this.media = null;
  }

  get provider() { return providers.get(); }
  get brief() { return this.project.brief; }
  get type() {
    const ids = this.brief.deliverables || [];
    const types = ids.map(typeById).filter(Boolean);
    if (!types.length) return typeById('proposal');
    if (types.length === 1) return types[0];
    // 여러 유형이면 해부도를 합친다 (같은 key는 한 번만)
    const anatomy = [];
    for (const t of types) for (const sec of t.anatomy || []) {
      const same = anatomy.find((x) => x.key === sec.key);
      if (!same) anatomy.push({ ...sec, type: t.id });
      else if (same.label !== sec.label) anatomy.push({ ...sec, key: `${sec.key}_${t.id}`, type: t.id });
    }
    // 공간 유형의 해부도를 앞에 — 제안서 유형이 먼저 골라져도 사이니지의 조형·운영 절이 밀리지 않게
    anatomy.sort((a, b) => (a.type === 'proposal') - (b.type === 'proposal'));
    const uniq = (xs) => [...new Set(xs)];
    const inertia = { keep: uniq(types.flatMap((t) => (t.inertia || {}).keep || [])), interpret: uniq(types.flatMap((t) => (t.inertia || {}).interpret || [])) };
    return { ...types[0], anatomy, inertia, focus: uniq(types.flatMap((t) => t.focus || [])), checks: uniq(types.flatMap((t) => t.checks || [])), also: types.slice(1).map((t) => ({ id: t.id, label: t.label, unit: t.unit, focus: t.focus })) };
  }
  get mission() { return (this.run.results.brief && this.run.results.brief.mission) || {}; }

  save() { store.saveRun(this.id, this.run); }
  /** 실제 진행 신호 — 저장 없이 가볍게 보낸다. 화면은 마지막 신호 이후 경과 시간으로 '멈춤'을 판단한다 */
  agentProgress(a, pr) {
    a.live = { ...pr, at: Date.now() };
    this.emit({ projectId: this.id, kind: 'agent-progress', agentId: a.id, live: a.live });
  }
  send(kind, extra = {}) { this.save(); this.emit({ projectId: this.id, kind, ...extra, run: this.run }); }
  line(who, text, stage) {
    if (!text) return;
    this.run.lines.push({ at: now(), who, text, stage: stage || this.run.stage });
    if (this.run.lines.length > 300) this.run.lines.shift();
  }
  setStage(id, patch) {
    const prev = this.run.stages[id] || {};
    this.run.stages[id] = { ...prev, ...patch };
    // 단계 기록 — '과정 다시 보기'가 다시 그린 단계(영감·수정 요청)까지 순서대로 보이도록 시각을 남긴다
    const log = (ev) => { (this.run.stageLog = this.run.stageLog || []).push({ id, ev, at: now() }); if (this.run.stageLog.length > 400) this.run.stageLog.shift(); };
    if ((patch.startedAt && patch.startedAt !== prev.startedAt) || (patch.status === 'running' && prev.status !== 'running')) log('start');
    if (patch.status === 'done' && prev.status !== 'done') log('end');
    else if (patch.status === 'waiting' && prev.status !== 'waiting') log('wait');
    else if (['error', 'canceled'].includes(patch.status) && prev.status !== patch.status) log(patch.status);
  }

  async prepareMedia() {
    if (this.media) return this.media;
    const files = (this.project.attachments || []).filter((a) => a.rel).map((a) => path.join(store.projectDir(this.id), a.rel));
    this.media = await attachments.prepare(files);
    return this.media;
  }

  /* ---------- 모델 배정 — 화가의 판단 ---------- */
  modelFor(stage, role) {
    const o = settings.get().openai;
    const e = models.effective();
    const st = (e.stages[stage] || {})[role];
    const def = st
      ? { model: st.model, effort: st.effort || '', why: st.why || '추천 구성 · 단계 지정' }
      : { model: e.models[role] || e.models.director, effort: e.efforts[role] || '', why: e.source === 'recommended' ? '추천 구성' : '기본 설정' };
    if (!o.autoModel) return def;
    const pool = new Set((role === 'image' ? e.imagePool : e.pool).map((p) => p.id));
    const plan = (this.run.modelPlan || []).find((p) => p.stage === stage && p.role === role);
    if (plan && pool.has(plan.model)) return { model: plan.model, effort: plan.effort || def.effort, why: plan.why || '화가 배정' };
    return def;
  }

  /** 근거 자료 — 사람이 쓴 것(의뢰서·답·영감) · 첨부 원문 · 웹 정찰. 화가가 만든 결과는 근거가 아니다 */
  async factSources() {
    if (!this._factSrc) {
      const m = await this.prepareMedia().catch(() => ({ texts: [] }));
      this._factSrc = [formatBrief(this.brief), ...arr(m.texts).map((t) => t.text)];
    }
    const R = this.run.results;
    const human = [
      JSON.stringify(this.run.gates || {}), JSON.stringify(this.run.root || {}), JSON.stringify(arr(this.run.inspirations)),
      ...arr(R.think && R.think.rounds).map((r) => JSON.stringify(r.answer || {})),
    ];
    // PDF 첨부(제안요청서)는 원문 텍스트가 없다 — 화가가 첨부에서 옮겨 적은 발주 사실·범위·첨부 요약을 근거로 함께 쓴다
    const rfp = R.brief ? [JSON.stringify(R.brief.rfp || {}), JSON.stringify(arr(R.brief.attachment_insights)), JSON.stringify(arr(R.brief.scope))] : [];
    const web = [...rfp, JSON.stringify(arr(R.forpop && R.forpop.scan && R.forpop.scan.scopes)), ...arr(R.tunnel && R.tunnel.layers).filter((l) => arr(l.citations).length).map((l) => JSON.stringify(l))];
    return [...this._factSrc, ...human, ...web];
  }

  /** 사실 가드 — 근거 없는 수치는 '(값 미정 · 목업)'으로, 문장 끝 고지는 지운다 (src/main/facts.js) */
  async factGuard(stage) {
    const GUARD = { airplane: 'airplane', tunnel: 'tunnel', think: 'think', positioning: 'positioning', forpop: 'forpop', concept: 'concept', creative: 'creative', canvas: 'canvas' };
    const obj = GUARD[stage] && this.run.results[GUARD[stage]];
    if (!obj || settings.get().run.factGuard === false) return;
    const src = await this.factSources();
    // 웹 정찰 결과(scan)는 확인한 사실이라 건드리지 않는다
    const scan = stage === 'forpop' ? obj.scan : null;
    if (scan) delete obj.scan;
    const st = facts.guard(obj, src);
    if (scan) obj.scan = scan;
    (this.run.factStats = this.run.factStats || {})[stage] = st;
    if (st.numbers) this.line('시스템', `근거 없는 수치 ${st.numbers}개를 '값 미정 · 목업'으로 바꿨습니다 — 예: ${st.samples.slice(0, 4).join(', ')}`, stage);
  }

  /** 이미지 모델 — '직접 지정'에서 이미지 칸이 비었거나 글 모델이 들어가 있으면 글 모델로 이미지를 부르게 된다. 그때는 추천 이미지 모델로 */
  imageModel() {
    const pick = this.modelFor('creative', 'image');
    if (isImageModel(pick.model)) return pick;
    const e = models.effective();
    const fb = [(e.imagePool[0] || {}).id, settings.DEFAULTS && settings.DEFAULTS.openai.models.image, 'gpt-image-1'].find(isImageModel);
    return { model: fb, effort: '', why: `이미지 모델 칸이 '${pick.model || '비어 있음'}'이라 ${fb}로 대신 그림` };
  }

  /** 화가에게 보여줄 모델 구성 — 역할 기본값 · 단계 지정 · 고를 수 있는 풀(모델 × 추론 강도) · 이미지 풀 */
  modelPoolForPainter() {
    const e = models.effective();
    return {
      defaults: Object.fromEntries(Object.entries(e.models).map(([k, v]) => [k, { model: v, effort: e.efforts[k] || '' }])),
      stage_overrides: e.stages,
      pool: e.pool.map((p) => ({ model: p.id, effort: p.effort || '', tier: p.tier, use: p.note })),
      image_pool: e.imagePool.map((p) => ({ model: p.id, tier: p.tier, use: p.note })),
    };
  }

  addCost(stage, usd, entry) {
    this.run.usage.cost += usd;
    this.setStage(stage, { cost: (this.run.stages[stage].cost || 0) + usd });
    cost.record({ projectId: this.id, stage, usd, mock: providers.isMock(), ...entry });
    const budget = settings.get().run.budgetUsd;
    if (budget && this.run.usage.cost > budget && !this.run.budgetWarned) {
      this.run.budgetWarned = true;
      this.line('시스템', `예산 $${budget}를 넘었습니다 (현재 $${this.run.usage.cost.toFixed(2)}). 설정에서 한도를 바꿀 수 있습니다.`);
      this.send('budget');
    }
  }

  /* ---------- 단계 공통 컨텍스트: 브레인 지시 · 노하우 · 영감 · 고칠 점 ---------- */
  inspirationFor(stage) {
    const idx = ORDER.indexOf(stage);
    const list = this.run.inspirations.filter((i) => ORDER.indexOf(i.stage) <= idx);
    return list.length ? list.map((i) => `- [${LABEL[i.stage]}] ${i.text}`).join('\n') : '(없음)';
  }

  knowhowRows(ids) {
    const all = knowledge.load().knowhow;
    return ids.map((x) => all.find((k) => k.id === (x.id || x))).filter(Boolean);
  }

  extras(stage, role) {
    const parts = [];
    const b = this.run.brain[stage];
    if (role !== 'brain' && b && b.direct) {
      const d = b.direct;
      parts.push(`## 더프롬 판단 브레인의 지시 — 이 단계의 방향\n${d.direction || ''}\n${(d.lens_guides || []).map((g) => `- [${g.lens}] ${g.guide}`).join('\n')}\n- 반드시: ${(d.must || []).join(' / ')}\n- 피할 것: ${(d.avoid || []).join(' / ')}${d.shift_hint ? `\n- 발상의 전환 힌트: ${d.shift_hint}` : ''}`);
      const rows = this.knowhowRows(d.knowhow || []);
      if (rows.length) {
        const use = Object.fromEntries((d.knowhow || []).map((k) => [k.id, k.use]));
        parts.push(`## 이 단계에서 쓸 더프롬 노하우 (원문)\n${rows.map((r) => `- \`${r.id}\` ${r.name} — ${r.desc}${use[r.id] ? `\n  → 쓰는 곳: ${use[r.id]}` : ''}`).join('\n')}`);
      }
    }
    if (b && b.fixPending && b.fixPending.length) parts.push(`## 브레인의 재작업 지시 — 반드시 반영\n${b.fixPending.map((f) => `- ${f}`).join('\n')}`);
    const prev = ORDER[ORDER.indexOf(stage) - 1];
    const pv = prev && this.run.brain[prev] && this.run.brain[prev].verify;
    if (pv && (pv.fixes || []).length) parts.push(pv.verdict === '보완' ? `## 앞 단계 검증에서 넘어온 보완점 — 반드시 반영\n${pv.fixes.map((f) => `- ${f}`).join('\n')}` : `## 앞 단계 검증에서 나온 고칠 점 — 참고해 반영\n${pv.fixes.map((f) => `- ${f}`).join('\n')}`);
    const root = this.root();
    if (root && stage !== 'brief') parts.push(`## 근본 이슈 — 모든 결과를 여기에 대입한다\n- 근본 이슈: ${root.issue}\n- 판정 질문: ${root.test || '(없음)'}\n- 이 단계의 결과가 근본 이슈에서 **누구의 무엇을** 바꾸는지 행동·시간·장소로 밝혀라. 달라지는 것이 없으면 그 결과는 버린다.`);
    const iv = this.inertiaNote();
    if (iv && role !== 'brain') parts.push(iv.replace('### ', '## '));
    const bl = this.run.results.baseline;
    if (bl && BASELINE_STAGES.has(stage)) parts.push(`## 기본안 — 이 정도는 아무나 낸다 (판단 브레인)\n이것과 같거나 이것의 장식만 바꾼 결과는 실패다. 무엇이 다른지 스스로 밝혀라.\n- 기본안: ${bl.overall || ''}\n- 뻔한 형태·표현: ${arr(bl.cliches).join(' / ')}\n- 넘어야 할 기준: ${arr(bl.bar).join(' / ')}`);
    if (SCOPE_STAGES.has(stage) && this.scope().length) parts.push(`## 사업 범위 — 결과는 이 항목을 모두 다뤄야 한다\n${this.scope().map((x) => `- ${x.id} ${x.item}${x.kind ? ` (${x.kind})` : ''}`).join('\n')}`);
    const insp = this.inspirationFor(stage);
    if (insp !== '(없음)') parts.push(`## 디자이너의 영감 — 판단의 출발점(나로부터)으로 존중하라\n${insp}`);
    return parts.length ? `\n\n---\n${parts.join('\n\n')}` : '';
  }

  /** 계보 — 앞선 모든 단계의 코어. 뒤 단계가 무엇에서 출발하는지 잃지 않도록 컨셉·Creative에 함께 넘긴다 */
  lineage() {
    const R = this.run.results;
    const s = R.airplane && R.airplane.synth;
    const t = R.tunnel && R.tunnel.synth;
    const p = R.positioning;
    const chosen = p && arr(p.territories).find((x) => p.final && x.id === p.final.id);
    return {
      canvas: R.canvas && { from_me: R.canvas.from_me, tension: R.canvas.tension, inertia: R.canvas.inertia, concept_draft: R.canvas.concept_draft },
      airplane: s && { hybrid: s.hybrid, split: s.split, suitcase: s.suitcase, treatments: s.treatments, leave: s.leave_together, selected: s.selected, travels: arr(R.airplane.travels).filter((t) => !t.error && (!arr(s.selected).length || arr(s.selected).includes(t.id))).map((t) => ({ id: t.id, name: t.name, take: t.take, apply: t.apply, treatments: t.treatments, form_moves: t.form_moves, leave: t.leave })) },
      tunnel: t && { exit_light: t.exit_light, keep: t.keep, change: t.change, conflicts: t.conflicts },
      positioning: p && { whitespace: p.whitespace, chosen, reason: p.final && p.final.reason },
      root: this.root(),
      think: this.thinkDigest(),
    };
  }

  /** 지금의 나 — 접수 폼의 '요즘 내가 꽂힌 것'. 그 프로젝트에만 쓰고 쌓지 않는다 */
  nowNote() { const v = this.brief && String(this.brief.nowFocus || '').trim(); return v || null; }

  /** 근본 이슈 — 사람이 확정한 것, 없으면 화가의 추천 */
  root() {
    const b = this.run.results.brief;
    if (this.run.root) return this.run.root;
    const ri = b && b.root_issue;
    if (!ri) return null;
    const c = arr(ri.candidates).find((x) => x.id === ri.recommended) || arr(ri.candidates)[0];
    return c ? { id: c.id, issue: c.issue, test: c.test, task: ri.task, purpose: ri.purpose, confirmed: false } : null;
  }

  /** 생각의 회차 결과 — 뒤 단계로 넘기는 형태 */
  thinkDigest() {
    const T = this.run.results.think;
    if (!T || !arr(T.rounds).length) return null;
    const best = T.final || (T.rounds[T.rounds.length - 1].painter || {}).best;
    return {
      best,
      rounds: T.rounds.map((r) => ({ n: r.n, idea: r.card && r.card.now, snag: r.card && r.card.snag, question: r.card && r.card.question, answer: r.answer ? `${ANSWER_KO[r.answer.choice] || r.answer.choice}${r.answer.text ? ` — ${r.answer.text}` : ''}` : '(답 없음 — 화가 제안대로)' })),
      kept: arr(T.rounds).flatMap((r) => arr(r.painter && r.painter.moves).filter((m) => m.keep).map((m) => `${m.move}${m.how ? `(${m.how})` : ''}: ${m.result}`)).slice(-8),
      discarded: arr(T.rounds).flatMap((r) => arr(r.painter && r.painter.moves).filter((m) => !m.keep).map((m) => m.result)).slice(-6),
    };
  }

  /** FoR · PoP · PoD 결과 — 뒤 단계로 넘기는 형태 (차별성 판정 · 보완점 · RTB 포함) */
  forpopHandoff() {
    const fp = this.run.results.forpop || {};
    const cmp = fp.compare || {};
    return {
      for: fp.for, pop: [...arr(fp.pop), ...arr(cmp.pop_add)], core_pod: fp.core_pod, rtb: fp.rtb, coherence: fp.coherence,
      positioning: cmp.positioning,
      differentiation: arr(cmp.scopes).map((x) => ({ scope: x.title, verdict: x.verdict, similar: arr(x.similar).map((d) => d.item), different: arr(x.different).map((d) => d.item), note: x.note })),
      core_triangle: cmp.core_triangle,
      brain_fixes: arr(cmp.fixes).filter(Boolean),
    };
  }

  /** 지금까지의 판단 요약 — 브레인·리포트용 */
  digest(full = false) {
    const R = this.run.results;
    const d = {};
    if (R.brief) d.mission = (({ title, one_line, deliverable, target, key_moment, objective }) => ({ title, one_line, deliverable, target, key_moment, objective }))(R.brief.mission || {});
    if (R.canvas) d.canvas = { from_me: R.canvas.from_me, concept_draft: R.canvas.concept_draft, tension: R.canvas.tension, inertia: R.canvas.inertia };
    if (R.airplane && R.airplane.synth) d.airplane = { hybrid: R.airplane.synth.hybrid, suitcase: R.airplane.synth.suitcase, selected: R.airplane.synth.selected };
    if (R.tunnel && R.tunnel.synth) d.tunnel = { narrowed: R.tunnel.synth.narrowed, keep: R.tunnel.synth.keep, change: R.tunnel.synth.change, exit_light: R.tunnel.synth.exit_light };
    if (R.positioning) { const p = R.positioning; const t = (p.territories || []).find((x) => p.final && x.id === p.final.id); d.positioning = { axes: p.axes && { x: p.axes.x && p.axes.x.name, y: p.axes.y && p.axes.y.name }, whitespace: p.whitespace && p.whitespace.label, chosen: t && t.name, reason: p.final && p.final.reason }; }
    if (R.forpop) d.forpop = { for: R.forpop.for && R.forpop.for.frame, for_kind: R.forpop.for && R.forpop.for.chosen, pop: (R.forpop.pop || []).map((x) => x.item), core_pod: R.forpop.core_pod, positioning: R.forpop.compare && R.forpop.compare.positioning && R.forpop.compare.positioning.sentence, differentiation: R.forpop.compare && (R.forpop.compare.scopes || []).map((x) => `${x.title}: ${x.verdict || ''}`), shifts: (R.forpop.shifts || []).map((s) => s.shift && `${s.shift.type} ${s.shift.name}`), coherence: R.forpop.coherence };
    if (R.concept) d.concept = { concept: R.concept.concept, theme: R.concept.theme, keywords: R.concept.keywords, philosophy_core: R.concept.philosophy_core, ...(full ? { metaphor: R.concept.metaphor, tone_manner: R.concept.tone_manner, interpretation: R.concept.interpretation, benefit: R.concept.benefit, proposals: (R.concept.proposals || []).map((p) => ({ id: p.id, theme: p.theme, concept: p.concept })), first_round: R.concept.first_round, brain_select: R.concept.brain_select && R.concept.brain_select.final } : {}) };
    if (R.creative) d.creative = (R.creative.examples || []).map((e) => ({ direction: e.direction, touchpoint: e.touchpoint, scope_ids: e.scope_ids, title: e.title, headline: e.headline, one_liner: e.one_liner, ...(full ? { structure: (e.structure || []).map((s) => s.name), detail: e.detail } : {}) }));
    if (this.root()) d.root = this.root();
    const td = this.thinkDigest();
    if (td) d.think = full ? td : { best: td.best, questions: td.rounds.map((r) => `${r.question || ''} → ${r.answer}`) };
    if (R.brief && R.brief.scope) d.scope = R.brief.scope.map((x) => `${x.id} ${x.item}`);
    if (R.baseline) d.baseline = { overall: R.baseline.overall, cliches: R.baseline.cliches, bar: R.baseline.bar };
    if (R.creative && R.creative.blueprint) { const bp = R.creative.blueprint; d.blueprint = full ? this.blueprintDigest(bp) : { summary: bp.summary, baseline_gap: bp.baseline_gap, sections: arr(bp.sections).map((x) => `${x.label}: ${arr(x.items).map((it) => it.name).join(', ')}`) }; }
    const bv = Object.entries(this.run.brain).filter(([, v]) => v && v.verify).map(([k, v]) => ({ stage: k, verdict: v.verify.verdict, issues: (v.verify.issues || []).slice(0, 2) }));
    if (bv.length) d.brain = bv;
    if (this.run.inspirations.length) d.inspirations = this.run.inspirations.map((i) => ({ stage: i.stage, text: i.text }));
    if (full && R.creative && R.creative.selection) d.selection = R.creative.selection;
    if (full && R.creative) { d.prelim_review = R.creative.prelim_review; d.human_todo = R.creative.human_todo; }
    if (full && R.forpop) { d.forpop.rtb = R.forpop.rtb; d.forpop.audit = R.forpop.audit; d.forpop.coherence = R.forpop.coherence; }
    return d;
  }

  /* ---------- 모델 호출 ---------- */
  async call({ role, prompt, ctx, agent, stage, withMedia = false, meta = {}, extras = true, search = false }) {
    if (this.abort.signal.aborted) throw new Error('취소됨');
    const { system, user } = render(prompt, ctx);
    const content = [{ type: 'text', text: user + (extras ? this.extras(stage, role) : '') }];
    if (withMedia) {
      const m = await this.prepareMedia();
      for (const t of m.texts) content.push({ type: 'text', text: `\n\n---\n[첨부: ${t.name}]\n${t.text}` });
      for (const im of m.images) { content.push({ type: 'text', text: `[첨부 이미지: ${im.name}]` }); content.push({ type: 'image_url', image_url: { url: im.dataUrl } }); }
      for (const p of m.pdfs) content.push({ type: 'file', file: { filename: p.name, file_data: p.dataUrl } });
    }
    let pick = this.modelFor(stage, role);
    // 정찰은 찾아 옮기는 일이다 — 깊은 추론을 쓰지 않는다 (설정 › run.search.effort)
    if (search) pick = { ...pick, effort: (settings.get().run.search || {}).effort || 'low' };
    // 같은 검색을 다시 하지 않는다 — 영감·재작업으로 단계를 다시 돌려도 같은 정찰은 저장된 결과를 쓴다
    const cacheKey = search ? require('crypto').createHash('sha1').update(`${pick.model}\n${system}\n${content[0].text}`).digest('hex') : null;
    if (cacheKey && this.run.searchCache && this.run.searchCache[cacheKey]) {
      const hit = this.run.searchCache[cacheKey];
      const a0 = { id: `${stage}:${agent.key}:${this.run.agents.length}`, stage, role, name: agent.name, task: `${agent.task || ''} (저장된 정찰 재사용)`, key: agent.key, model: (providers.isMock() ? 'mock:' : '') + pick.model, why: '같은 정찰 — 다시 검색하지 않음', status: 'done', startedAt: now(), endedAt: now(), cost: 0, cached: true };
      this.run.agents.push(a0); this.send('agent-start', { agent: a0 }); this.send('agent-done', { agent: a0 });
      return JSON.parse(JSON.stringify(hit));
    }
    const a = {
      id: `${stage}:${agent.key}:${this.run.agents.length}`,
      stage, role, name: agent.name, task: agent.task || '', key: agent.key,
      model: (providers.isMock() ? 'mock:' : '') + pick.model, why: pick.why,
      status: 'working', startedAt: now(),
    };
    this.run.agents.push(a);
    this.send('agent-start', { agent: a });
    try {
      const fn = search && this.provider.search ? this.provider.search : this.provider.chat;
      const onProgress = (pr) => this.agentProgress(a, pr);
      const r = await fn({ role, model: pick.model, effort: pick.effort, system, content, signal: this.abort.signal, onProgress, meta: { stage, prompt, ...meta, ctx } });
      a.status = 'done'; a.endedAt = now();
      this.run.usage.calls++;
      if (r.usage) { this.run.usage.prompt += r.usage.prompt_tokens || 0; this.run.usage.completion += r.usage.completion_tokens || 0; }
      const c = cost.chatCost(pick.model, r.usage);
      a.cost = c.usd; a.tokens = { in: c.input, out: c.output };
      this.addCost(stage, c.usd, { model: pick.model, role, input: c.input, output: c.output });
      if (search) {
        const sc = cost.searchCost(r.searches);
        if (sc.usd) { a.cost += sc.usd; this.addCost(stage, sc.usd, { model: 'web_search', role, searches: sc.searches }); }
        a.searches = r.searches || 0;
        this.run.usage.searches = (this.run.usage.searches || 0) + (r.searches || 0);
        const res = { ...r.json, _citations: r.citations || [], _searches: r.searches || 0 };
        this.run.searchCache = this.run.searchCache || {};
        this.run.searchCache[cacheKey] = res;
        return res;
      }
      return r.json;
    } catch (e) {
      a.status = 'error'; a.endedAt = now(); a.error = e.message;
      this.send('agent-done', { agent: a });
      throw e;
    } finally {
      if (a.status === 'done') this.send('agent-done', { agent: a });
    }
  }

  /* ---------- 교열 — 사람이 읽는 문장으로 ---------- */
  /** 단계 결과에서 사람이 읽을 문장을 모아, 고쳐야 할 것만 고친다. 사실·ID·URL·카피는 건드리지 않는다 */
  async polish(stage, obj, { skip = [], keys = [] } = {}) {
    if (!obj || settings.get().run.polish === false) return;
    const KEYS = new Set([...keys, 'theme', 'statement', 'sentence', 'one_line', 'one_liner', 'coherence', 'why', 'reason', 'note', 'gain', 'how', 'summary', 'concept', 'keep', 'change', 'visible', 'task', 'headline', 'subhead', 'exec_summary', 'bullets', 'rationale', 'desc', 'target_view', 'exit_light', 'from_me', 'tension', 'cost', 'what', 'fixes', 'issues']);
    const SKIP = new Set(['scan', 'rtb', 'citations', 'series', 'image_prompt', 'painter_line', 'line', 'source', 'url', 'id', 'polished', ...skip]);
    const found = [];
    const walk = (x, p, key, parent) => {
      if (found.length >= 90) return;
      if (typeof x === 'string') {
        if (KEYS.has(key) && /[가-힣]/.test(x) && x.length >= (key === 'theme' ? 6 : 18) && x.length <= 420 && !/^https?:/.test(x)) found.push({ id: `S${found.length + 1}`, path: p, text: x, ctx: parent && !Array.isArray(parent) ? Object.entries(parent).filter(([k, v]) => k !== key && typeof v === 'string' && !SKIP.has(k)).map(([k, v]) => `${k}: ${v}`).join(' / ').slice(0, 300) : '' });
        return;
      }
      if (Array.isArray(x)) { x.forEach((v, i) => walk(v, [...p, i], key, parent)); return; }
      if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (!SKIP.has(k)) walk(v, [...p, k], k, x);
    };
    walk(obj, [], '', null);
    if (!found.length) return;
    // AI투 검사기 — 걸린 문장 · 100자 넘는 문장 · 사람이 바로 읽는 칸(keys, 예: 리뷰 카드)만 교열에 보낸다
    const must = new Set(keys);
    const before = voice.tally(found.map((f) => f.text));
    const targets = found.filter((f) => must.has(f.path[f.path.length - 1]) || voice.lint(f.text).length);
    const stat = (after) => {
      this.run.polishStats = this.run.polishStats || {};
      const prev = keys.length && this.run.polishStats[stage];
      const sum = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };
      this.run.polishStats[stage] = prev
        ? { sentences: prev.sentences + found.length, sent: prev.sent + targets.length, before: prev.before + before.total, after: prev.after + after.total, byKindBefore: sum(prev.byKindBefore, before.byKind), byKindAfter: sum(prev.byKindAfter, after.byKind) }
        : { sentences: found.length, sent: targets.length, before: before.total, after: after.total, byKindBefore: before.byKind, byKindAfter: after.byKind };
    };
    if (!targets.length) { stat(before); return; }
    let res;
    try {
      res = await this.call({
        role: 'editor', prompt: 'p_polish', stage, extras: false,
        agent: { key: 'editor', name: '조수 · 교열', task: `문장 다듬기 · ${targets.length}/${found.length}문장` },
        ctx: { stageLabel: LABEL[stage] || stage, mission: this.mission && { deliverable: this.mission.deliverable, product: this.mission.product, target: this.mission.target, channel: this.mission.channel }, sentences: targets.map(({ id, text, ctx }) => ({ id, text, context: ctx || undefined, flags: voice.lint(text).map((h) => `${h.kind}: ${h.phrase}`) })) },
      });
    } catch (e) { stat(before); this.line('시스템', `교열을 건너뜀 — ${e.message}`, stage); return; }
    const by = Object.fromEntries(found.map((f) => [f.id, f]));
    const applied = [];
    for (const ed of arr(res.edits)) {
      const f = by[ed.id];
      if (!f || !ed.after || typeof ed.after !== 'string' || ed.after === f.text) continue;
      if (ed.after.length > f.text.length * 2.2 + 30) continue; // 내용이 지나치게 불어나면 받지 않는다
      let t = obj; for (const k of f.path.slice(0, -1)) t = t[k];
      if (t && t[f.path[f.path.length - 1]] === f.text) { t[f.path[f.path.length - 1]] = ed.after; applied.push({ before: f.text, after: ed.after, issue: ed.issue || '' }); }
    }
    const finals = found.map((f) => { let t = obj; for (const k of f.path) t = t == null ? t : t[k]; return typeof t === 'string' ? t : f.text; });
    stat(voice.tally(finals));
    this.run.polish = this.run.polish || {};
    this.run.polish[stage] = [...(keys.length ? arr(this.run.polish[stage]) : []), ...applied];
    const ps = this.run.polishStats[stage];
    if (applied.length) this.line('조수', `교열 — ${targets.length}문장을 검토해 ${applied.length}곳을 다듬었어요 (AI투 ${before.total} → ${ps && !keys.length ? ps.after : '…'}).`, stage);
  }

  /* ---------- 더프롬 판단 브레인 ---------- */
  brainCfg(stage) { return (knowledge.load().brain.stages || {})[stage]; }
  brainEnabled(stage) {
    const mode = settings.get().run.brain || 'standard';
    const c = this.brainCfg(stage);
    return mode !== 'off' && !!c && (c.intensity || []).includes(mode);
  }
  lensTable() { return (knowledge.load().brain.lenses || []).map((l) => `| ${l.id} | ${l.name} | ${l.question} | ${l.source} |`).join('\n').replace(/^/, '| ID | 렌즈 | 질문 | 출처 |\n|---|---|---|---|\n') + '\n\n' + this.inertiaNote(); }
  /** 이 결과물에서 관성(지킬 구조)과 해석(바꿀 수 있는 것)의 경계 — 공간 작업에서 형태를 '구조'로 얼리지 않게 */
  inertiaNote() { const iv = (this.type && this.type.inertia) || {}; if (!arr(iv.keep).length) return ''; return `### 이 결과물에서 관성과 해석의 경계\n- 관성(지킨다): ${arr(iv.keep).join(' · ')}\n- 해석(바꿀 수 있다 — 여기서 새로움을 만든다): ${arr(iv.interpret).join(' · ')}\n- INERTIA 렌즈는 '관성' 목록에만 적용한다. 해석 목록을 바꾼 것을 관성 위반으로 감점하지 않는다.`; }
  stageLenses(stage) { const ids = (this.brainCfg(stage) || {}).lenses || []; const L = knowledge.load().brain.lenses || []; return ids.map((id) => { const l = L.find((x) => x.id === id); return l ? `- ${l.id} · ${l.name}` : `- ${id}`; }).join('\n'); }
  knowhowIndex(stage) {
    const k = knowledge.load();
    const groups = ((this.brainCfg(stage) || {}).knowhow || []).concat('custom');
    const prefixes = new Set(groups.flatMap((g) => ((k.brain.knowhowGroups || {})[g] || {}).prefixes || []));
    const rows = k.knowhow.filter((r) => prefixes.has(r.prefix) || (r.custom && prefixes.has('KH')));
    return rows.length ? rows.map((r) => `- ${r.id} · ${r.name} — ${r.desc.slice(0, 90)}`).join('\n') : '(이 단계는 노하우를 쓰지 않는다)';
  }
  brainCtx(stage) {
    const c = this.brainCfg(stage) || {};
    return {
      stageLabel: LABEL[stage], mission: this.mission, root: this.root(), digest: this.digest(), inspiration: this.inspirationFor(stage),
      lensTable: this.lensTable(), stageLenses: this.stageLenses(stage), stageFocus: c.direct || '', knowhowIndex: this.knowhowIndex(stage),
      ismIds: knowledge.load().isms.map((i) => `${i.id}(${i.name})`).join(', '),
    };
  }

  async brainDirect(stage) {
    const d = await this.call({
      role: 'brain', prompt: 'b_direct', stage, extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: `방향 제시 · ${LABEL[stage]}` },
      ctx: this.brainCtx(stage), meta: { stage, mode: 'direct' },
    });
    // 노하우 ID 검증
    const valid = new Set(knowledge.load().knowhow.map((k) => k.id));
    d.knowhow = (d.knowhow || []).filter((k) => valid.has(k.id)).slice(0, 6);
    this.run.brain[stage] = { ...(this.run.brain[stage] || {}), direct: d, attempts: [] };
    this.line('판단 브레인', d.line || d.direction, stage);
    // Airplane: 영감에 따른 사조 계획 조정
    if (stage === 'airplane' && d.plan_adjust && this.run.results.brief) {
      const plan = this.run.results.brief.plan;
      const valid2 = new Set(knowledge.load().isms.map((i) => i.id));
      const rm = new Set(d.plan_adjust.remove_isms || []);
      plan.isms = plan.isms.filter((x) => !rm.has(x.id));
      for (const id of d.plan_adjust.add_isms || []) if (valid2.has(id) && !plan.isms.find((x) => x.id === id)) plan.isms.push({ id, why: `브레인 조정 — ${d.plan_adjust.reason || '디자이너의 영감'}` });
      plan.isms = plan.isms.slice(0, 6);
    }
    this.send('brain', { stage, mode: 'direct' });
    return d;
  }

  async brainVerify(stage, output) {
    const v = await this.call({
      role: 'brain', prompt: 'b_verify', stage, extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: `검증 · ${LABEL[stage]}` },
      ctx: { ...this.brainCtx(stage), directive: (this.run.brain[stage] || {}).direct || null, output, baseline: BASELINE_FLOOR.has(stage) ? this.run.results.baseline || null : null, scope: SCOPE_STAGES.has(stage) ? this.scope() : null, known: this.knownIssues(stage) },
      meta: { stage, mode: 'verify' },
    });
    this.logIssues(stage, v);
    // 기본안과 다르지 않으면 렌즈 점수와 무관하게 재작업 — 우리 이름을 건 결과가 뻔한 답이면 안 된다
    const gap = v.baseline_gap && Number(v.baseline_gap.score);
    if (BASELINE_FLOOR.has(stage) && this.run.results.baseline && (!Number.isFinite(gap) || gap <= 2) && v.verdict !== '재작업') {
      v.verdict = '재작업';
      v.issues = [Number.isFinite(gap) ? `기본안과 다르지 않음 (${gap}/5) — ${(v.baseline_gap && v.baseline_gap.note) || ''}` : '기본안 대조 점수가 없음 — 검증을 다시 받는다', ...arr(v.issues)];
      v.fixes = [...arr(v.baseline_gap && v.baseline_gap.fixes), ...arr(v.fixes)];
    }
    const miss = arr(v.coverage && v.coverage.missing).filter(Boolean);
    if (SCOPE_STAGES.has(stage) && miss.length && v.verdict === '통과') { v.verdict = '보완'; v.issues = [`다루지 않은 범위: ${miss.join(', ')}`, ...arr(v.issues)]; }
    const b = this.run.brain[stage] = this.run.brain[stage] || {};
    b.verify = v;
    (b.attempts = b.attempts || []).push({ at: now(), verdict: v.verdict, issues: v.issues });
    this.line('판단 브레인', `${v.verdict} — ${v.line || (v.issues || [])[0] || ''}`, stage);
    this.send('brain', { stage, mode: 'verify', verdict: v.verdict });
    return v;
  }

  /* ---------- 지적 원장 — 같은 지적이 단계마다 기계적으로 되풀이되지 않게 ---------- */
  knownIssues(stage) {
    const L = arr(this.run.issueLog).filter((x) => x.stage !== stage);
    return L.length ? L.map((x, i) => `${i}. [${LABEL[x.stage] || x.stage}] ${x.text}`).join('\n') : '(없음)';
  }
  logIssues(stage, v) {
    const L = (this.run.issueLog = this.run.issueLog || []);
    const others = L.filter((x) => x.stage !== stage);
    const known = (t) => others.find((x) => facts.similar(x.text, t) >= 0.5);
    // 브레인이 이미 있는 지적을 다시 썼으면 걸러 낸다 — 다음 단계로 '반드시 반영'이 되풀이되는 것을 막는다
    v.issues = arr(v.issues).map(facts.stripBoiler).filter((t) => t && t.length > 4);
    v.fixes = arr(v.fixes).map(facts.stripBoiler).filter((t) => t && t.length > 4);
    const fresh = (list) => arr(list).filter((t) => { const k = known(t); if (k) { k.n = (k.n || 1) + 1; return false; } return true; });
    v.issues = fresh(v.issues);
    v.fixes = fresh(v.fixes);
    for (const i of arr(v.still_open)) { const x = others[Number(i)]; if (x) x.n = (x.n || 1) + 1; }
    for (const t of arr(v.issues).slice(0, 3)) if (!L.some((x) => x.stage === stage && facts.similar(x.text, t) >= 0.5)) L.push({ stage, text: String(t).slice(0, 200), n: 1, at: now() });
    // 현장·도면이 있어야 풀리는 것 — 검증 계획 하나로 모은다
    const plan = (this.run.verifyPlan = this.run.verifyPlan || []);
    for (const x of arr(v.verify)) if (x && x.what && !plan.some((y) => facts.similar(y.what, x.what) >= 0.5)) plan.push({ ...x, stage });
  }

  /** 단계 실행을 브레인으로 감싼다: 방향 → 실행 → 검증 (→ 재작업) */
  async withBrain(stage, fn, outputOf) {
    if (!this.brainEnabled(stage)) return fn();
    await this.brainDirect(stage);
    if (INTRINSIC.has(stage)) return fn();
    const retry = Math.max(0, settings.get().run.brainRetry ?? 1);
    for (let attempt = 0; ; attempt++) {
      await fn();
      const v = await this.brainVerify(stage, outputOf());
      if (v.verdict !== '재작업') break;
      if (!arr(v.fixes).length) {
        // 고칠 곳을 짚지 못한 재작업(이미 기록된 지적의 반복)은 다시 그리지 않는다 — 같은 결과에 비용만 든다
        this.line('시스템', `${LABEL[stage]} — 브레인이 재작업을 냈지만 새로 고칠 곳이 없어 다시 그리지 않습니다.`, stage);
        break;
      }
      if (attempt >= retry) {
        (this.run.warnings = this.run.warnings || []).push({ stage, at: now(), text: `판단 브레인이 '재작업'으로 판정했지만 재작업 횟수(${retry})를 다 썼습니다 — ${arr(v.issues)[0] || ''}` });
        this.line('시스템', `${LABEL[stage]} — 브레인 판정은 재작업이지만 횟수를 다 써서 진행합니다. 결과를 꼭 확인하세요.`, stage);
        break;
      }
      this.run.brain[stage].fixPending = v.fixes || [];
      this.line('화가', '브레인의 지적을 반영해 다시 그립니다.', stage);
      this.setStage(stage, { progress: 0.3, redo: attempt + 1 });
      this.send('progress', { stage });
    }
    if (this.run.brain[stage]) delete this.run.brain[stage].fixPending;
  }

  /** 사조 교차 참조(A-99) — 같은 문제에 반대 답을 내는 짝 */
  ismPairs() {
    const md = knowledge.load().files['skill/references/catalog-ism.md'] || '';
    const sec = md.split(/^## A-99/m)[1] || '';
    const pairs = [];
    for (const line of sec.split('\n')) {
      const m = line.match(/^\|\s*([^|]+?)\s*\|\s*`(ISM-[A-Z]+)`\s*([^|]*)\|\s*`(ISM-[A-Z]+)`\s*([^|]*)\|/);
      if (m) pairs.push({ issue: m[1].trim(), a: m[2], aSays: m[3].trim(), b: m[4], bSays: m[5].trim() });
    }
    return pairs;
  }

  /** 같은 편 사조만 고르면 넷이 같은 답을 낸다 — 짝이 하나도 없으면 첫 사조의 반대편을 넣는다 */
  ensureContrast(plan) { ensureContrast(plan, this.ismPairs(), new Set(knowledge.load().isms.map((i) => i.id))); }

  ismIndex() { return knowledge.load().isms.map((i) => `- ${i.id} · ${i.name} (${i.era}) — ${i.summary}`).join('\n'); }

  /* ---------------- stages ---------------- */

  async stageBrief() {
    const m = await this.prepareMedia();
    const note = [
      ...(this.project.attachments || []).map((a) => `- ${a.name}${a.error ? ' (복사 실패)' : ''}`),
      ...m.skipped.map((s) => `- ${s.name}: 읽지 못함 (${s.reason})`),
    ].join('\n') || '(첨부 없음)';
    const rounds = this.run.gates.brief.rounds;
    const answers = rounds.length
      ? rounds.map((r, i) => `### ${i + 1}차 답변\n` + (r.questions || []).map((q) => `- ${q.q}\n  → ${r.answers[q.id] || '(답 없음)'}`).join('\n')).join('\n\n')
      : '(없음)';
    const o = settings.get().openai;
    const json = await this.call({
      role: 'director', prompt: '01_brief', stage: 'brief', withMedia: true,
      agent: { key: 'painter', name: '화가', task: '미션 접수 · 브리프 게이트 · 계획' },
      ctx: { brief: formatBrief(this.brief), attachmentsNote: note, answers, type: this.type, ismIndex: this.ismIndex(), modelPool: o.autoModel ? this.modelPoolForPainter() : '(자동 배정 꺼짐 — model_plan 비움)' },
    });
    const valid = new Set(knowledge.load().isms.map((i) => i.id));
    json.plan = json.plan || {};
    json.plan.isms = (json.plan.isms || []).filter((x) => valid.has(x.id)).slice(0, 5);
    for (const d of ['ISM-BAUHAUS', 'ISM-JP', 'ISM-SWISS', 'ISM-POSTMOD']) {
      if (json.plan.isms.length >= 3) break;
      if (!json.plan.isms.find((x) => x.id === d)) json.plan.isms.push({ id: d, why: '기본 후보' });
    }
    this.ensureContrast(json.plan);
    const typeLayers = [...arr(this.type.layers), ...arr(this.type.also).flatMap((a) => arr((typeById(a.id) || {}).layers))];
    const allowed = [...LAYER_DEFAULTS, ...typeLayers];
    let layers = (json.plan.layers || []).filter((l) => allowed.find((d) => d.key === l.key)).map((l) => ({ ...allowed.find((d) => d.key === l.key), ...l }));
    if (layers.length < 3) layers = [...LAYER_DEFAULTS];
    // 결과물 유형의 조사 레이어(현장 조건 · 운영 · 선행 사례)는 화가가 빼도 붙인다 — 일반론으로 끝나지 않게
    for (const tl of typeLayers) if (!layers.find((l) => l.key === tl.key)) layers.push(tl);
    json.plan.layers = layers.slice(0, 8);
    json.plan.example_count = Math.max(3, Math.min(5, parseInt(json.plan.example_count, 10) || 3));
    const eff = models.effective();
    const pool = new Set(eff.pool.map((p) => p.id));
    const ipool = new Set(eff.imagePool.map((p) => p.id));
    this.run.modelPlan = (json.plan.model_plan || []).filter((p) => (['sub', 'director', 'brain'].includes(p.role) && pool.has(p.model)) || (p.role === 'image' && ipool.has(p.model)));
    // 사업 범위 — 비거나 한 항목이면 해부도로 보탠다 (결과물을 한 단어로 뭉뚱그리지 않게)
    let scope = arr(json.scope).map((x) => (typeof x === 'string' ? { item: x } : x)).filter((x) => x && x.item).map((x, i) => ({ id: `S${i + 1}`, item: String(x.item), kind: x.kind || '', from: x.from || '추론', must: !(x.must === false || x.must === 'false') }));
    if (scope.length < 2) {
      for (const sec of arr(this.type.anatomy)) if (scope.length < 4 && !scope.find((x) => x.item.includes(sec.label))) scope.push({ id: `S${scope.length + 1}`, item: `${sec.label} — ${sec.ask}`, kind: '', from: '추론 · 결과물 해부도', must: true });
    }
    json.scope = scope;
    // 근본 이슈 — 과업 → 목적 → 근본 이슈. 후보는 2~3개, 사람이 확정한다
    const ri = json.root_issue || {};
    ri.candidates = arr(ri.candidates).filter((c) => c && c.issue).slice(0, 3).map((c, i) => ({ id: `R${i + 1}`, issue: String(c.issue), test: c.test ? String(c.test) : '', why: c.why || '' }));
    if (!ri.candidates.find((c) => c.id === ri.recommended)) ri.recommended = ri.candidates[0] ? ri.candidates[0].id : null;
    json.root_issue = ri.candidates.length ? ri : null;
    if (this.run.root && !this.run.root.confirmed) delete this.run.root;
    this.run.results.brief = json;
    this.line('화가', json.plan.note || (json.mission && json.mission.one_line), 'brief');
    const asking = ['질문부터', '멈춤'].includes(json.gate) && ((json.questions || []).length || json.gate === '멈춤');
    if (!asking) await this.baseline();
    return json;
  }

  /** 기본안 — 아무 방법론 없이도 나오는 답. 이후 모든 단계의 바닥선 */
  async baseline() {
    if (settings.get().run.brain === 'off') return;
    try {
      const j = await this.call({
        role: 'brain', prompt: 'b_baseline', stage: 'brief', extras: false,
        agent: { key: 'brain', name: '판단 브레인', task: '기본안(뻔한 답) 적기' },
        ctx: { mission: this.mission, scope: this.scope(), type: this.typeBrief() },
      });
      this.run.results.baseline = j;
      this.line('판단 브레인', j.line || `기본안 — ${j.overall || ''}`, 'brief');
    } catch (e) { this.line('시스템', `기본안을 적지 못함 — ${e.message}`, 'brief'); }
  }

  scope() { return arr(this.run.results.brief && this.run.results.brief.scope); }
  typeBrief() { const t = this.type || {}; return { label: t.label, unit: t.unit, focus: t.focus, anatomy: t.anatomy, inertia: t.inertia, also: t.also }; }

  async stageCanvas() {
    const b = this.run.results.brief;
    const json = await this.call({
      role: 'director', prompt: '02_canvas', stage: 'canvas',
      agent: { key: 'painter', name: '화가', task: '캔버스 — 나로부터 · 컨셉 한 문장 초안' },
      ctx: { mission: b.mission, assumptions: b.assumptions, attachment_insights: b.attachment_insights, type: this.type, now: this.nowNote() },
    });
    this.run.results.canvas = json;
    this.line('화가', json.painter_line, 'canvas');
  }

  async stageAirplane() {
    const b = this.run.results.brief;
    const isms = knowledge.load().isms;
    const plan = b.plan.isms;
    const max = settings.get().run.maxParallel || 4;
    let done = 0;
    this.run.results.airplane = { travels: [], synth: null, plan };
    if (!this.run.results.baseline && this.run.results.brief) await this.baseline();
    const bl = this.run.results.baseline || {};
    // 이미 정해진 전술 — 사조 이름으로 다시 쓰지 않게 (첨부 전략·제약·기본안)
    const given = { attachment: arr(b.attachment_insights).map((x) => x.takeaway).filter(Boolean).slice(0, 12), constraints: arr(b.mission && b.mission.constraints).slice(0, 12) };
    const baseline = { overall: bl.overall, cliches: arr(bl.cliches) };
    const pairs = this.ismPairs();
    const roleOf = (p) => {
      const pr = pairs.find((x) => (x.a === p.id && plan.some((y) => y.id === x.b)) || (x.b === p.id && plan.some((y) => y.id === x.a)));
      if (!pr) return '이번 여행에서 이 사조의 원리를 가져온다. 다른 사조와 겹치는 조작은 버린다.';
      const other = pr.a === p.id ? pr.b : pr.a;
      return `'${pr.issue}'에서 ${other}와 반대 답을 내는 쪽이다(${pr.a === p.id ? pr.aSays : pr.bSays}). 그 반대를 흐리지 말고 끝까지 밀어라 — 하이브리드에서 ${p.contrast ? '해석' : '구조 또는 해석'} 쪽을 맡는다.`;
    };
    const visit = (p, retryNote = '') => {
      const card = isms.find((i) => i.id === p.id);
      return this.call({
        role: 'sub', prompt: '03_ism', stage: 'airplane',
        agent: { key: p.id, name: `조수 · ${card.name} 여행자`, task: retryNote ? `${p.why} (겹친 조작 다시)` : p.why },
        ctx: { mission: b.mission, canvas: this.run.results.canvas, ismBody: card.body, ismId: card.id, typeLabel: [this.type.label, ...arr(this.type.also).map((x) => x.label)].join(' + '), scope: this.scope(), anatomy: arr(this.type.anatomy).map((a) => `${a.label} — ${a.ask}`), trip: plan.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, why: x.why })), given, baseline, tripRole: roleOf(p), retryNote },
        meta: { ism: card },
      });
    };
    const travels = await pLimit(plan, max, async (p) => {
      const card = isms.find((i) => i.id === p.id);
      if (!card) return { id: p.id, name: p.id, error: '카탈로그에 없음' };
      const json = await visit(p).catch((e) => ({ id: p.id, error: e.message }));
      json.id = p.id; json.name = card.name; json.era = card.era; json.custom = !!card.custom;
      this.run.results.airplane.travels.push(json);
      done++;
      this.setStage('airplane', { progress: 0.1 + 0.6 * (done / plan.length) });
      this.line(`조수 · ${card.name}`, json.postcard || json.core, 'airplane');
      this.send('progress', { stage: 'airplane' });
      return json;
    });
    let ok = travels.filter((t) => !t.error);
    if (!ok.length) throw new Error('사조 여행이 모두 실패했습니다');
    // 사조가 달라도 같은 조작을 냈다면(브리프 전술의 재진술) 그 사조만 한 번 더 — 겹친 조작을 보여 주고 다른 답을 요구한다
    const overlap = this.travelOverlap(ok, [...given.attachment, ...given.constraints, ...baseline.cliches]);
    for (const o of overlap.filter((x) => x.ratio >= 0.4).sort((a, b2) => b2.ratio - a.ratio).slice(0, 2)) {
      const p = plan.find((x) => x.id === o.id);
      const note = `## 다시 두는 이유 — 반드시 고친다
이 조작들은 다른 사조의 조작이나 이미 정해진 전술과 같다: 
${o.dups.map((d) => `- ${d.move.slice(0, 100)} ↔ ${d.with}`).join('\n')}
이 사조만 하는 조작으로 바꿔라(A4 바꿔치기 시험).`;
      const again = await visit(p, note).catch(() => null);
      if (again && arr(again.form_moves).length) {
        const i = travels.findIndex((t) => t.id === o.id);
        travels[i] = { ...again, id: o.id, name: travels[i].name, era: travels[i].era, custom: travels[i].custom, redo: { reason: '조작 겹침', before: o.ratio } };
      }
    }
    ok = travels.filter((t) => !t.error);
    this.run.results.airplane.overlap = this.travelOverlap(ok, [...given.attachment, ...given.constraints, ...baseline.cliches]).map(({ id, ratio }) => ({ id, ratio }));
    this.run.results.airplane.travels = travels;
    const synth = await this.call({
      role: 'director', prompt: '04_airplane_synth', stage: 'airplane',
      agent: { key: 'painter', name: '화가', task: '착륙 · 하이브리드 정리' },
      ctx: { mission: b.mission, travels: ok },
    });
    this.run.results.airplane.synth = synth;
    this.line('화가', synth.painter_line, 'airplane');
  }

  /** 사조별 조형 조작이 서로(또는 이미 정해진 전술과) 얼마나 겹치는가 — { id, ratio, dups } */
  travelOverlap(travels, given) {
    return travels.map((t) => {
      const mine = arr(t.form_moves).map((m) => m.move || '').filter(Boolean);
      const others = travels.filter((x) => x.id !== t.id).flatMap((x) => arr(x.form_moves).map((m) => ({ move: m.move || '', from: x.id })));
      const dups = [];
      for (const mv of mine) {
        const hitO = others.find((o) => facts.similar(o.move, mv) >= 0.4);
        const hitG = !hitO && given.find((g) => facts.similar(g, mv) >= 0.5);
        if (hitO || hitG) dups.push({ move: mv, with: hitO ? hitO.from : '이미 정해진 전술' });
      }
      return { id: t.id, ratio: mine.length ? dups.length / mine.length : 0, dups };
    });
  }

  async stageTunnel() {
    const b = this.run.results.brief;
    const layers = b.plan.layers;
    const max = settings.get().run.maxParallel || 4;
    let done = 0;
    this.run.results.tunnel = { layers: [], synth: null };
    const s = this.run.results.airplane.synth;
    const airplane = { hybrid: s.hybrid, suitcase: s.suitcase, leave: s.leave_together };
    const res = await pLimit(layers, max, async (layer) => {
      const web = !!layer.search && settings.get().run.webSearch !== false && !!this.provider.search;
      const req = (search) => this.call({
        role: 'sub', prompt: '05_layer', stage: 'tunnel',
        agent: { key: layer.key, name: `조수 · ${layer.label} 레이어`, task: search ? layer.question : `${layer.question} (웹 없이)` },
        search,
        ctx: { mission: b.mission, canvas: this.run.results.canvas, airplane, attachment_insights: b.attachment_insights, rfp: b.rfp || null, scope: this.scope(), layer, layerKey: layer.key, layerLabel: layer.label, type: this.typeBrief() },
        meta: { layer },
      });
      // 웹 정찰이 실패해도 레이어는 남긴다 — 웹 근거 없이 한 번 더 (근거 칸은 '확인 필요'로 남는다)
      const json = await req(web).catch((e) => {
        if (!web || this.abort.signal.aborted) throw e;
        this.line('시스템', `${layer.label} 레이어 웹 정찰 실패 — 웹 없이 다시 둔다 (${e.message})`, 'tunnel');
        return req(false);
      }).catch((e) => ({ key: layer.key, label: layer.label, error: e.message, insights: [] }));
      json.key = layer.key;
      json.label = json.label || layer.label;
      if (json._citations) { json.citations = json._citations; delete json._citations; delete json._searches; }
      this.run.results.tunnel.layers.push(json);
      done++;
      this.setStage('tunnel', { progress: 0.1 + 0.6 * (done / layers.length) });
      this.line(`조수 · ${layer.label}`, json.headline, 'tunnel');
      this.send('progress', { stage: 'tunnel' });
      return json;
    });
    const ok = res.filter((l) => !l.error);
    if (ok.length < 3 && ok.length < layers.length) throw new Error('터널 레이어가 3개 이상 겹치지 않았습니다 (실패한 레이어를 확인하세요)');
    this.run.results.tunnel.layers = res;
    const synth = await this.call({
      role: 'director', prompt: '06_tunnel_synth', stage: 'tunnel',
      agent: { key: 'painter', name: '화가', task: '터널 출구 · 범위 좁히기' },
      ctx: { mission: b.mission, airplane, layers: ok },
    });
    this.run.results.tunnel.synth = synth;
    this.line('화가', synth.painter_line, 'tunnel');
  }

  tunnelDigest() {
    const t = this.run.results.tunnel;
    return { synth: t.synth, layers: t.layers.filter((l) => !l.error).map((l) => ({ label: l.label, headline: l.headline, insights: l.insights, keep: l.keep, change: l.change, boundary: l.boundary })) };
  }
  /** 뒤 단계용 터널 요약 — 종합과 레이어 제목·인사이트 이름만 (원문은 설계 절에서 이미 썼다) */
  tunnelBrief() {
    const t = this.run.results.tunnel || {};
    const sy = t.synth || {};
    return { exit_light: sy.exit_light, keep: sy.keep, change: sy.change, narrowed: sy.narrowed, layers: arr(t.layers).filter((l) => !l.error).map((l) => ({ label: l.label, headline: l.headline, insights: arr(l.insights).map((i) => i.title || i.name || (typeof i === 'string' ? i : '')).filter(Boolean) })) };
  }
  /** 뒤 단계용 계보 요약 — 사조는 코어·조형 조작 이름만 */
  lineageBrief() {
    const L = this.lineage();
    if (L.airplane) L.airplane = { hybrid: L.airplane.hybrid, split: L.airplane.split, treatments: L.airplane.treatments, selected: L.airplane.selected, travels: arr(L.airplane.travels).map((t) => ({ id: t.id, core: t.core, form_moves: arr(t.form_moves).map((m) => (m.move || '').slice(0, 120)) })) };
    if (L.think) L.think = { final: L.think.final };
    return L;
  }

  /* ---------- 생각의 회차 — 걸림 → 수 → 대입 → 고르기 → 중간 리뷰 (method/thinking.md) ---------- */
  thinkCfg() {
    const r = settings.get().run;
    return { wait: r.midReview !== 'auto', max: Math.max(1, Math.min(ROUND_CAP, parseInt(r.maxRounds, 10) || 3)) };
  }

  /** 사람의 답을 다음 회차의 지시로 */
  roundDirective(last) {
    if (!last) return null;
    const a = last.answer;
    const q = last.card || {};
    if (!a) return `사람의 답이 없었다. 판단 브레인이 제안한 방향으로 간다: ${(last.brain && last.brain.next && `${last.brain.next.move} — ${last.brain.next.why}`) || '지난 회차의 찌르는 질문'}. 다음 카드의 '지금 안' 첫머리에 그렇게 진행했다고 적는다.`;
    const t = a.text ? ` 사람의 말: "${a.text}"` : '';
    return {
      question: `사람이 지난 질문("${q.question}")으로 가자고 했다. 그 질문을 전제로 받아들이고, 거기서 이어지는 수(${q.leads_to || '비틀기'})로 이번 회차를 둔다.${t}`,
      half: `사람이 지난 질문("${q.question}")에 '반만' 동의했다. 질문이 건드린 전제 중 무엇을 받아들이고 무엇을 지킬지 먼저 정하고, 그 경계에서 이번 회차를 둔다.${t}`,
      other: `사람이 지난 질문을 받아들이지 않고 다른 방향을 줬다. 그 방향이 이번 회차의 출발점이다.${t}`,
      deeper: `사람이 '더 깊이'를 골랐다. 이번 회차는 깊이로 간다 — 지금 안의 "왜"를 거듭해 한 층 아래의 본질을 찾는다.${t}`,
      wider: `사람이 '더 넓게'를 골랐다. 이번 회차는 넓이로 간다 — 다른 업계·다른 재료·다른 사례에서 가져온다.${t}`,
      twist: `사람이 '비틀어'를 골랐다. 이번 회차는 비틀기로 간다 — 주체·시간·방향·크기 중 지금까지 쓰지 않은 방식으로.${t}`,
    }[a.choice] || `사람의 답: ${ANSWER_KO[a.choice] || a.choice}.${t}`;
  }

  async stageThink() {
    const T = this.run.results.think = this.run.results.think || { rounds: [] };
    const cfg = this.thinkCfg();
    const b = this.run.results.brief;
    const prev = T.rounds[T.rounds.length - 1];
    if (cfg.wait && T.awaiting && prev && !prev.answer) return; // 앱을 다시 열었을 때 — 답을 기다리던 리뷰를 그대로 다시 보인다
    T.awaiting = false;
    while (true) {
      const last = T.rounds[T.rounds.length - 1];
      if (last && last.answer && last.answer.choice === 'done') break;
      const n = T.rounds.length + 1;
      if (n > ROUND_CAP || (!cfg.wait && n > cfg.max)) break;
      this.setStage('think', { progress: Math.min(0.9, 0.1 + 0.8 * ((n - 1) / cfg.max)) });
      this.send('progress', { stage: 'think' });
      const history = T.rounds.map((r) => ({ n: r.n, now: r.card && r.card.now, snag: r.card && r.card.snag, moves: arr(r.painter && r.painter.moves).map((m) => ({ move: m.move, how: m.how, result: m.result, keep: m.keep })), question: r.card && r.card.question, answer: r.answer ? `${ANSWER_KO[r.answer.choice] || r.answer.choice}${r.answer.text ? ` — ${r.answer.text}` : ''}` : null }));
      const usedMoves = arr(last && last.painter && last.painter.moves).map((m) => m.move);
      const roundCtx = { round: n, mission: this.mission, root: this.root(), lineage: this.lineage(), tunnel: this.tunnelDigest(), baseline: this.run.results.baseline || null, scope: this.scope(), rfp: (b && b.rfp) || null, type: this.typeBrief(), history, directive: this.roundDirective(last), avoidRepeat: usedMoves, now: this.nowNote(), retryNote: null };
      const callPainter = (ctx, task) => this.call({ role: 'director', prompt: '12_round', stage: 'think', agent: { key: 'painter', name: '화가', task }, ctx });
      const normalize = (p) => {
        // 대입이 비어 있으면 그 수는 버린다 — 말장난을 걸러내는 문
        p.moves = arr(p.moves).map((m) => ({ ...m, move: MOVES.includes(m.move) ? m.move : '깊이', keep: m.keep !== false && !!(m.substitute && String(m.substitute.changes || '').trim().length >= 6) }));
        p.questions = arr(p.questions).filter((q) => q && q.question).map((q) => ({ ...q, type: QTYPES.includes(q.type) ? q.type : '전제 빼기' })).slice(0, 3);
        return p;
      };
      // 회차 규칙을 코드로 지킨다 — 같은 수를 주된 수로 연속해 두지 않는다(사람이 그 수를 고른 경우는 예외) · 질문 3개는 서로 다른 방식
      const chosenMove = last && last.answer && { deeper: '깊이', wider: '넓이', twist: '비틀기' }[last.answer.choice];
      const lastMain = arr(last && last.painter && last.painter.moves)[0];
      const violations = (p) => {
        const out = [];
        const main = p.moves[0] && p.moves[0].move;
        if (main && lastMain && main === lastMain.move && main !== chosenMove) out.push(`지난 회차의 주된 수(${main})를 다시 주된 수로 두었다. 다른 수를 주된 수로 써라.`);
        const types = p.questions.map((q) => q.type);
        if (p.questions.length < 3 || new Set(types).size < types.length) out.push('찌르는 질문 3개를 서로 다른 방식으로 써라 (전제 빼기 · 극단 밀기 · 반대편 서기 · 하나만 남기기 · 실패 먼저 중 셋).');
        return out;
      };
      let painter;
      try {
        painter = normalize(await callPainter(roundCtx, `생각의 회차 ${n}`));
        const bad = violations(painter);
        if (bad.length) {
          this.line('시스템', `회차 ${n} — 회차 규칙을 어겨 한 번 다시 둡니다: ${bad.join(' ')}`, 'think');
          const retry = await callPainter({ ...roundCtx, retryNote: `지난 출력이 회차 규칙을 어겼다 — ${bad.join(' ')}` }, `생각의 회차 ${n} · 규칙 맞춰 다시`).catch(() => null);
          if (retry) painter = normalize(retry);
          const still = violations(painter);
          if (still.length) (this.run.warnings = this.run.warnings || []).push({ stage: 'think', at: now(), text: `회차 ${n}: 다시 두어도 규칙을 어김 — ${still.join(' ')}` });
        }
      } catch (e) {
        // 1회차는 출발점이 없으니 오류로 둔다. 2회차부터는 지금까지의 최선으로 이어 간다
        if (this.abort.signal.aborted || !T.rounds.length) throw e;
        this.line('시스템', `회차 ${n} 실패 — 회차 ${n - 1}의 최선으로 이어 갑니다 (${e.message})`, 'think');
        (this.run.warnings = this.run.warnings || []).push({ stage: 'think', at: now(), text: `회차 ${n} 실패: ${e.message}` });
        break;
      }
      let brain = null;
      if (settings.get().run.brain !== 'off') {
        brain = await this.call({
          role: 'brain', prompt: 'b_round', stage: 'think', extras: false,
          agent: { key: 'brain', name: '판단 브레인', task: `회차 ${n} · 질문 고르기 · 리뷰 카드` },
          ctx: { round: n, mission: this.mission, root: this.root(), baseline: this.run.results.baseline || null, scope: this.scope(), painter, history, wait: cfg.wait, max: cfg.max },
        }).catch((e) => { this.line('시스템', `판단 브레인 회차 검토를 건너뜀 — ${e.message}`, 'think'); return null; });
      }
      // 브레인이 버리라고 한 수
      for (const v of arr(brain && brain.moves)) { const m = painter.moves[v.i]; if (m && v.keep === false) { m.keep = false; m.dropped = v.why || '브레인 — 대입이 구체적이지 않음'; } }
      const qi = Math.max(0, Math.min(painter.questions.length - 1, parseInt(brain && brain.pick, 10) || 0));
      const q = painter.questions[qi] || {};
      const card = (brain && brain.card) || {};
      const round = {
        n, at: now(), painter, brain,
        card: {
          now: card.now || (painter.best && painter.best.idea) || '',
          snag: card.snag || painter.snag || '',
          question: card.question || q.question || '',
          type: card.type || q.type || '',
          leads_to: card.leads_to || q.leads_to || '',
          if_yes: card.if_yes || [q.gain && `얻는 것: ${q.gain}`, q.loss && `잃는 것: ${q.loss}`].filter(Boolean).join(' / '),
        },
        stopHint: !!(brain && brain.stop) || (painter.room === 'less' && last && last.painter && last.painter.room === 'less'),
      };
      await this.polish('think', round.card, { keys: ['now', 'snag', 'question', 'if_yes'], skip: ['type', 'leads_to'] });
      T.rounds.push(round);
      T.best = painter.best;
      this.line('화가', `회차 ${n} — ${round.card.now}`, 'think');
      if (round.card.question) this.line('판단 브레인', `찌르는 질문 — ${round.card.question}`, 'think');
      if (cfg.wait) { T.awaiting = true; return; }
      if (round.stopHint) { this.line('화가', `회차 ${n}에서 멈춥니다 — ${(brain && brain.stop_why) || painter.room_why || '더 나아질 여지가 줄었다'}`, 'think'); break; }
    }
    this.finishThink();
  }

  finishThink() {
    const T = this.run.results.think;
    const last = T.rounds[T.rounds.length - 1];
    const p = (last && last.painter) || {};
    T.awaiting = false;
    T.final = { idea: (p.best && p.best.idea) || (last && last.card.now) || '', why: p.best && p.best.why, root_change: p.best && p.best.root_change, from_round: last && last.n, open_question: last && last.answer && last.answer.choice === 'done' ? null : last && last.card.question };
  }

  async stagePositioning() {
    const json = await this.call({
      role: 'director', prompt: '07_positioning', stage: 'positioning',
      agent: { key: 'painter', name: '화가', task: 'Creative Positioning Map' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, airplane: this.run.results.airplane.synth, tunnel: this.tunnelDigest(), think: this.thinkDigest(), root: this.root() },
    });
    this.run.results.positioning = json;
    this.line('화가', json.painter_line, 'positioning');
  }

  positioningDigest() {
    const p = this.run.results.positioning;
    return { axes: p.axes, players: p.players, whitespace: p.whitespace, chosen: (p.territories || []).find((t) => p.final && t.id === p.final.id), territories: arr(p.territories).map((t) => ({ id: t.id, name: t.name })), final: p.final, rounds: p.rounds };
  }

  async stageForpop() {
    // ① 화가 — 앞선 모든 단계의 최종 검증 + FoR(네 방식) · PoP · PoD 후보 5 · 정찰 계획
    const base = await this.call({
      role: 'director', prompt: '08_forpop', stage: 'forpop',
      agent: { key: 'painter', name: '화가', task: '최종 검증 · FoR · PoP · PoD 후보 5 · 정찰 계획' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, airplane: this.run.results.airplane.synth, tunnel: this.tunnelDigest(), positioning: this.positioningDigest(), think: this.thinkDigest(), root: this.root() },
    });
    this.run.results.forpop = { ...base, shifts: [] };
    this.line('화가', base.painter_line, 'forpop');
    this.setStage('forpop', { progress: 0.25 });
    this.send('progress', { stage: 'forpop' });
    const frame = { for: base.for, pop: base.pop, coherence: base.coherence };

    // ② 조수 ×3 — 웹 정찰: 동일 카테고리 · 확장 범주 · 크리에이티브
    const scan = await this.scoutScopes(base, frame);
    this.run.results.forpop.scan = scan;
    this.setStage('forpop', { progress: 0.45 });
    this.send('progress', { stage: 'forpop' });
    const scanBrief = this.scanDigest(scan);

    // ③ 브레인 — 발상의 전환 1 (5 → 3)
    const r1 = await this.call({
      role: 'brain', prompt: 'b_shift', stage: 'forpop', extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: '발상의 전환 1 · PoD 5 → 3' },
      ctx: {
        round: 1, mission: this.mission, frame, candidates: base.pod_candidates, previous: null, scan: scanBrief, baseline: this.run.results.baseline || null, scope: this.scope(), inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
        roundRule: '이번은 1차 — 5개를 전환된 시선으로 다시 보고 3개로 좁힌다(합치거나 변형 가능). id는 P1~P3.',
        roundSchema: '{ "round": 1, "shift": { "type": "INVERT|VIEW|SCALE|TIME|SENSE|COMBINE|SUBTRACT|CONTEXT", "name": "전환 이름", "question": "전환 질문", "from": "기존 사고", "to": "전환된 사고", "reasoning": "브레인의 추론 — 렌즈 근거", "lenses": ["렌즈 ID"] }, "result": [ { "id": "P1", "item": "", "gain": "", "from_ids": ["D?"], "transformed": true, "why": "", "desirable": 0.0, "deliverable": 0.0, "defensible": 0.0 } ], "cut": [ { "id": "D?", "reason": "" } ], "line": "" }',
      },
      meta: { round: 1 },
    });
    this.run.results.forpop.shifts.push(r1);
    this.line('판단 브레인', r1.line || (r1.shift && r1.shift.to), 'forpop');
    this.setStage('forpop', { progress: 0.62 });
    this.send('progress', { stage: 'forpop' });
    // ④ 브레인 — 발상의 전환 2 (3 → 1) + 최종 점검
    const r2 = await this.call({
      role: 'brain', prompt: 'b_shift', stage: 'forpop', extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: '발상의 전환 2 · PoD 3 → 1 · 최종 점검' },
      ctx: {
        round: 2, mission: this.mission, frame, candidates: r1.result, previous: r1.shift, scan: scanBrief, baseline: this.run.results.baseline || null, scope: this.scope(), inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
        roundRule: `이번은 2차 — 1차와 다른 유형의 전환을 적용해 하나의 코어 PoD로 좁히고, 앞선 모든 단계가 이 코어로 이어지는지 렌즈별로 최종 점검한다.${this.scope().length >= 4 ? ' 사업 범위가 넓다 — SUBTRACT(하나만 남기기)는 쓰지 않는다. 코어 PoD는 한 접점의 장치가 아니라 범위 전체에서 작동하는 원리여야 한다.' : ''} 코어 PoD가 기본안과 같으면 안 된다.`,
        roundSchema: '{ "round": 2, "shift": { "type": "", "name": "", "question": "", "from": "", "to": "", "reasoning": "", "lenses": [] }, "core": { "id": "CORE", "item": "코어 PoD", "gain": "사람이 얻는 것", "from_ids": ["P?"], "statement": "무엇은 그대로 두고 무엇이 다른지, 사람이 읽는 자연스러운 한두 문장으로. 칸을 이어 붙이지 말고 FoR·PoP 같은 용어도 문장에 넣지 않는다", "why": "" }, "cut": [ { "id": "P?", "reason": "" } ], "rtb": [ { "fact": "", "source": "브리프|첨부:..|웹:<URL>|확인 필요" } ], "final_check": [ { "lens": "렌즈 ID", "ok": true, "note": "" } ], "verdict": "통과|보완", "line": "" }',
      },
      meta: { round: 2 },
    });
    const fp = this.run.results.forpop;
    fp.shifts.push(r2);
    fp.core_pod = r2.core || {};
    fp.rtb = r2.rtb || [];
    fp.final_check = r2.final_check || [];
    fp.verdict = r2.verdict;
    this.line('판단 브레인', r2.line || (fp.core_pod && fp.core_pod.statement), 'forpop');
    this.setStage('forpop', { progress: 0.8 });
    this.send('progress', { stage: 'forpop' });

    // ⑤ 브레인 — 세 범위 차별성 판정 · 공통 범례 · 포지셔닝 진술문
    const cmp = await this.call({
      role: 'brain', prompt: 'b_compare', stage: 'forpop', extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: '차별성 판정 · 세 범위 · 공통 범례' },
      ctx: {
        mission: this.mission, frame, scan: scanBrief, baseline: this.run.results.baseline || null, scope: this.scope(), inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
        pod: { core: fp.core_pod, rtb: fp.rtb, candidates: base.pod_candidates, shifted: r1.result, shifts: fp.shifts.map((x) => ({ shift: x.shift, cut: x.cut })), final_check: fp.final_check },
      },
    });
    fp.compare = this.normalizeCompare(cmp, scan);
    // 정찰에서 아무것도 확인하지 못한 범위에는 점수를 매기지 않는다 — 근거 없는 3·3·2가 표에 남지 않게
    for (const x of arr(fp.compare.scopes)) {
      const sc = arr(scan && scan.scopes).find((y) => y.scope === x.scope || y.title === x.title);
      const seen = sc && (arr(sc.players).length || arr(sc.conventions).length || arr(sc.taken).length);
      if (!seen) { x.series = []; x.verdict = '정찰 없음'; x.note = sc && sc.error ? `웹 정찰 실패 — 판정하지 않음` : '웹 정찰에서 확인한 사례가 없어 판정하지 않음'; }
    }
    const cmpOk = fp.compare.verdict !== '보완';
    const verdict = r2.verdict === '통과' && cmpOk ? '통과' : '보완';
    fp.verdict = verdict;
    this.run.brain.forpop = { ...(this.run.brain.forpop || {}), verify: {
      verdict,
      scores: (r2.final_check || []).map((c) => ({ lens: c.lens, score: c.ok ? 4 : 2, note: c.note })),
      issues: [...(r2.final_check || []).filter((c) => !c.ok).map((c) => c.note), ...fp.compare.scopes.filter((x) => x.verdict === '겹침').map((x) => `${x.title} — ${x.note || '이미 점유된 해석과 겹침'}`)],
      fixes: arr(cmp.fixes).filter(Boolean),
      line: cmp.line || r2.line,
    } };
    this.line('판단 브레인', cmp.line || (fp.compare.positioning && fp.compare.positioning.sentence), 'forpop');
    await this.polish('forpop', fp);
  }

  /** 조수 셋이 웹을 직접 탐색 — 설정에서 끄거나 공급자가 웹 탐색을 못 하면 건너뛴다 */
  async scoutScopes(base, frame) {
    const plan = base.scan_plan || {};
    const on = settings.get().run.webSearch !== false && !!this.provider.search;
    if (!on) {
      this.line('시스템', '웹 정찰이 꺼져 있어 차별성은 브리프·일반 관찰로만 판정합니다 (설정 › 실행 › 웹 정찰).', 'forpop');
      return { enabled: false, scopes: SCOPES.map((sc) => ({ scope: sc.id, title: sc.title, skipped: true, players: [], conventions: [], taken: [], open: [], gaps: ['웹 정찰 꺼짐'], citations: [] })) };
    }
    const candidates = arr(base.pod_candidates).map((c) => ({ id: c.id, item: c.item, gain: c.gain }));
    const results = await pLimit(SCOPES, settings.get().run.maxParallel || 3, async (sc) => {
      const p = plan[sc.id] || {};
      try {
        const j = await this.call({
          role: 'sub', prompt: 's_scout', stage: 'forpop', extras: false, search: true,
          agent: { key: `scout-${sc.id}`, name: '조수', task: `웹 정찰 · ${sc.title}` },
          ctx: {
            scope: sc.id, scopeName: sc.title, scopeDesc: sc.desc, question: p.question || sc.desc,
            queries: arr(p.queries).join(' / ') || '(화가가 검색어를 주지 않았다 — 미션에서 정한다)',
            mission: this.mission, frame, candidates,
          },
          meta: { scope: sc.id },
        });
        const out = { ...j, scope: sc.id, title: sc.title, citations: j._citations || [], searches: j._searches || 0 };
        delete out._citations; delete out._searches;
        // 모델이 적은 URL 중 실제 검색 결과에 없는 것은 표시만 한다 (지우지 않는다 — 사람이 확인)
        const known = new Set(out.citations.map((c) => c.url.replace(/[#?].*$/, '')));
        const mark = (x) => (x && x.url ? { ...x, verified: known.has(String(x.url).replace(/[#?].*$/, '')) } : x);
        out.players = arr(out.players).map(mark);
        out.conventions = arr(out.conventions).map(mark);
        out.taken = arr(out.taken).map(mark);
        this.line('조수', `${sc.title} — ${out.summary || '정찰 완료'}`, 'forpop');
        return out;
      } catch (e) {
        this.line('시스템', `${sc.title} 웹 정찰 실패 — ${e.message}`, 'forpop');
        return { scope: sc.id, title: sc.title, error: e.message, players: [], conventions: [], taken: [], open: [], gaps: [`정찰 실패: ${e.message}`], citations: [] };
      }
    });
    return { enabled: true, scopes: results };
  }

  /** 브레인에게 넘길 정찰 요약 — 원문 그대로, URL 포함 */
  scanDigest(scan) {
    if (!scan) return null;
    return {
      enabled: scan.enabled,
      scopes: arr(scan.scopes).map((x) => ({
        scope: x.scope, title: x.title, summary: x.summary || '', skipped: !!x.skipped,
        players: arr(x.players).slice(0, 6).map((p) => ({ name: p.name, what: p.what, similar: p.similar, different: p.different, url: p.url })),
        conventions: arr(x.conventions).slice(0, 6), taken: arr(x.taken).slice(0, 6), open: arr(x.open).slice(0, 6), gaps: arr(x.gaps),
        sources: arr(x.citations).slice(0, 10).map((c) => c.url),
      })),
    };
  }

  /** 범례·값 정리 — 세 범위가 같은 축 수를 쓰도록 맞춘다 */
  normalizeCompare(cmp, scan) {
    const legend = cmp.legend || {};
    let axes = arr(legend.axes).slice(0, 5);
    if (axes.length !== 3 && axes.length !== 5) axes = axes.slice(0, axes.length >= 5 ? 5 : 3);
    const n = axes.length;
    const clamp = (v) => Math.max(0, Math.min(5, Math.round(+v || 0)));
    const scopes = SCOPES.map((sc) => {
      const x = arr(cmp.scopes).find((y) => y.scope === sc.id) || { scope: sc.id };
      const series = arr(x.series).slice(0, 3).map((se) => {
        const vals = arr(se.values).slice(0, n).map(clamp);
        while (vals.length < n) vals.push(0);
        return { ...se, kind: se.kind === 'us' ? 'us' : 'ref', values: vals };
      });
      const s0 = (scan && arr(scan.scopes).find((y) => y.scope === sc.id)) || {};
      return { ...x, title: x.title || sc.title, series, evidence: s0.skipped ? '웹 정찰 꺼짐' : arr(s0.citations).length ? `웹 ${arr(s0.citations).length}건` : '확인 필요' };
    });
    return { ...cmp, legend: { shape: n === 5 ? 'pentagon' : 'triangle', axes }, scopes };
  }

  async stageConcept() {
    if (!this._conceptDepth) this._conceptRetried = false;
    this._conceptDepth = (this._conceptDepth || 0) + 1;
    try { return await this._stageConcept(); } finally { this._conceptDepth--; }
  }

  async _stageConcept() {
    const hist = this.run.gates.C.history.filter((h) => h.decision === 'revise');
    const feedback = hist.length ? hist.map((h, i) => `${i + 1}차 수정 의견: ${h.note || '(의견 없음)'}`).join('\n') : '(없음 — 첫 판정)';
    const fp = this.run.results.forpop;
    const forpop = this.forpopHandoff();
    // ① 화가 — 5안 → 1차 3안
    const c1 = await this.call({
      role: 'director', prompt: '09_concepts', stage: 'concept',
      agent: { key: 'painter', name: '화가', task: hist.length ? `Concept 5안 — 수정 ${hist.length}차` : 'Concept · Theme 5안 → 1차 3안' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, digest: this.digest(), forpop, lineage: this.lineage(), tunnel: this.tunnelDigest(), feedback },
    });
    const ids = new Set((c1.proposals || []).map((p) => p.id));
    c1.first_round = c1.first_round || {};
    c1.first_round.picked = (c1.first_round.picked || []).filter((id) => ids.has(id)).slice(0, 3);
    if (c1.first_round.picked.length < 3) c1.first_round.picked = (c1.proposals || []).slice(0, 3).map((p) => p.id);
    this.run.results.concept = { proposals: c1.proposals, first_round: c1.first_round };
    this.line('화가', c1.painter_line, 'concept');
    this.setStage('concept', { progress: 0.35 });
    this.send('progress', { stage: 'concept' });
    // ② 브레인 — 3 → 1 자체 검증
    const picked = (c1.proposals || []).filter((p) => c1.first_round.picked.includes(p.id));
    const sel = await this.call({
      role: 'brain', prompt: 'b_concept', stage: 'concept', extras: false,
      agent: { key: 'brain', name: '판단 브레인', task: 'Concept 자체 검증 · 3 → 1' },
      ctx: { mission: this.mission, picked, core: fp.core_pod, forpop, lineage: this.lineage(), baseline: this.run.results.baseline || null, scope: this.scope(), lensTable: this.lensTable(), stageLenses: this.stageLenses('concept') },
    });
    if (!sel.final || !picked.find((p) => p.id === sel.final.id)) sel.final = { id: picked[0].id, why: '브레인 선택 누락 — 1차 첫 안', refine: [] };
    // 기본안 · 범위 바닥선 — 세 안이 모두 기본안과 같거나 범위의 절반도 못 다루면 5안부터 한 번 다시 (코드로 강제)
    if (this.run.results.baseline && !this._conceptRetried) {
      const ratio = (cv) => { const m = String(cv || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? +m[1] / Math.max(1, +m[2]) : NaN; };
      const ev = arr(sel.evaluations);
      const okOne = ev.some((e) => Number(e.baseline_gap) >= 3 && !(ratio(e.coverage) < 0.5));
      if (ev.length && !okOne) {
        this._conceptRetried = true;
        this.line('판단 브레인', '세 안 모두 기본안과 다르지 않거나 범위의 절반을 못 다룹니다 — 5안부터 다시 그립니다.', 'concept');
        this.run.brain.concept = { ...(this.run.brain.concept || {}), fixPending: [...arr(sel.final.refine), '기본안과 다른 방향으로 — 범위 절반 이상에서 구체적으로 작동하는 컨셉으로'] };
        await this.stageConcept();
        if (this.run.brain.concept) delete this.run.brain.concept.fixPending;
        return;
      }
    }
    this.run.results.concept.brain_select = sel;
    const fe = (sel.evaluations || []).find((e) => e.id === sel.final.id) || {};
    const fgap = Number(fe.baseline_gap);
    this.run.brain.concept = { ...(this.run.brain.concept || {}), verify: { verdict: Number.isFinite(fgap) && fgap < 3 ? '보완' : '통과', scores: fe.scores || [], issues: Number.isFinite(fgap) && fgap < 3 ? [`기본안과의 거리 ${fgap}/5 — 설계에서 더 벌려야 한다`] : [], fixes: sel.final.refine || [], line: sel.line, baseline_gap: fe.baseline_gap, coverage: fe.coverage } };
    this.line('판단 브레인', sel.line || sel.final.why, 'concept');
    this.setStage('concept', { progress: 0.7 });
    this.send('progress', { stage: 'concept' });
    // ③ 화가 — 최종 컨셉 키트
    const final = (c1.proposals || []).find((p) => p.id === sel.final.id);
    const kit = await this.call({
      role: 'director', prompt: '09_concept_kit', stage: 'concept',
      agent: { key: 'painter', name: '화가', task: '최종 컨셉 키트 · C 게이트' },
      ctx: { mission: this.mission, final, refine: sel.final.refine || [], evaluation: (sel.evaluations || []).find((e) => e.id === final.id) || null, why: sel.final.why, forpop, lineage: this.lineage(), tunnel: this.tunnelDigest(), scope: this.scope(), feedback, type: this.typeBrief() },
    });
    this.run.results.concept = { ...this.run.results.concept, ...kit, final_id: final.id };
    this.line('화가', kit.painter_line, 'concept');
    await this.polish('concept', this.run.results.concept, { skip: ['keywords'] });
  }

  async stageCreative() {
    const b = this.run.results.brief;
    const hist = this.run.gates.C.history;
    const feedback = hist.map((h) => `${h.decision === 'go' ? 'go' : '수정'}: ${h.note || ''}`).join('\n') || '(없음)';
    const c = this.run.results.concept;
    const concept = { concept: c.concept, theme: c.theme, keywords: c.keywords, metaphor: c.metaphor, philosophy_core: c.philosophy_core, tone_manner: c.tone_manner, interpretation: c.interpretation, benefit: c.benefit, rough: c.rough, scope_map: c.scope_map };
    const scope = this.scope();
    const common = { mission: b.mission, scope, rfp: b.rfp || null, type: this.typeBrief(), baseline: this.run.results.baseline || null, concept, forpop: this.forpopHandoff(), lineage: this.lineage(), tunnel: this.tunnelDigest(), feedback };
    const anatomy = arr(this.type.anatomy);

    // 재작업이면 고칠 곳만 다시 그린다 — 절 12개 · 통합 · 장면을 통째로 다시 부르면 비용이 두 배가 된다
    const prev = this.run.results.creative;
    const fixes = arr((this.run.brain.creative || {}).fixPending);
    const rework = !!(fixes.length && prev && prev.blueprint && arr(prev.blueprint.sections).length);
    const hit = (sec) => fixes.filter((f) => f.includes(sec.label) || f.includes(sec.key) || arr(sec.topics).some((t) => f.includes(t)));

    // ⓪ 공통 원장 — 절들이 같은 규칙을 각자 다르게 쓰지 않도록 (중복·충돌 → 재작업의 가장 큰 원인)
    let ledger = rework ? prev.blueprint.ledger : null;
    if (!ledger) {
      ledger = await this.call({
        role: 'sub', prompt: '10_ledger', stage: 'creative',
        agent: { key: 'ledger', name: '조수 · 설계 원장', task: `공통 규칙 · 주제의 주인 · 정할 값 — ${anatomy.length}절` },
        ctx: { mission: b.mission, scope, rfp: b.rfp || null, concept: { concept: c.concept, theme: c.theme, interpretation: c.interpretation }, tunnel: this.tunnelBrief(), anatomy: anatomy.map((x) => ({ key: x.key, label: x.label, ask: x.ask })), sectionList: anatomy.map((x) => x.label).join(' · ') },
      }).catch((e) => { this.line('시스템', `설계 원장 실패 — 원장 없이 진행 (${e.message})`, 'creative'); return { rules: [], owners: [], to_measure: [], terms: [] }; });
      const keys = new Set(anatomy.map((x) => x.key));
      ledger.owners = arr(ledger.owners).filter((o) => keys.has(o.section));
    }
    const ownedOf = (key) => arr(ledger.owners).filter((o) => o.section === key).map((o) => o.topic);
    const secCommon = { ...common, ledger: { rules: ledger.rules, owners: ledger.owners, to_measure: arr(ledger.to_measure).map((x) => x.what), terms: ledger.terms } };

    // ① 설계 — 절마다 조수가 병렬로 깊게 그리고, 화가가 통합한다
    let drafts;
    if (rework) {
      drafts = arr(prev.blueprint.sections);
      const redo = anatomy.map((a) => ({ ...a, topics: ownedOf(a.key) })).filter((a) => hit(a).length);
      if (redo.length) {
        const byKey = Object.fromEntries(redo.map((a) => [a.key, hit(a)]));
        const again = await this.draftSections(redo, secCommon, byKey, Object.fromEntries(drafts.map((d) => [d.key, d])), ownedOf);
        drafts = drafts.map((d) => again.find((x) => x.key === d.key && !x.error) || d);
      }
      this.line('화가', `브레인의 지적 ${fixes.length}개 — 절 ${redo.length}개만 다시 그리고 통합을 고칩니다.`, 'creative');
    } else {
      drafts = await this.draftSections(anatomy, secCommon, {}, {}, ownedOf);
    }
    this.setStage('creative', { progress: 0.25 });
    this.send('progress', { stage: 'creative' });
    const intCommon = { ...common, ledger, tunnel: this.tunnelBrief() };
    let blueprint = await this.integrateBlueprint(drafts, intCommon, rework ? prev.blueprint : null, rework ? fixes : []);
    let gaps = this.blueprintGaps(blueprint, scope);
    if (gaps.length && !rework) {
      // 빈 곳만 다시 — 앞 초안을 주고 보완하게 한다 (처음부터 다시 그리지 않는다)
      this.line('판단 브레인', `설계에서 빈 곳 ${gaps.length}곳 — ${gaps.slice(0, 2).map((g) => g.text).join(' · ')}`, 'creative');
      const byKey = {};
      for (const g of gaps) if (g.key) (byKey[g.key] = byKey[g.key] || []).push(g.text);
      const redo = anatomy.filter((a) => byKey[a.key]);
      if (redo.length) {
        const prevBy = Object.fromEntries(drafts.map((d) => [d.key, d]));
        const again = await this.draftSections(redo, secCommon, byKey, prevBy, ownedOf);
        drafts = drafts.map((d) => again.find((x) => x.key === d.key && arr(x.items).length >= arr(d.items).length) || d);
      }
      const cross = gaps.filter((g) => !g.key).map((g) => g.text);
      blueprint = await this.integrateBlueprint(drafts, intCommon, blueprint, cross.length ? cross : gaps.map((g) => g.text));
      gaps = this.blueprintGaps(blueprint, scope);
    }
    blueprint.gaps = gaps.map((g) => g.text);
    blueprint.ledger = ledger;
    this.run.results.creative = { blueprint, examples: rework ? arr(prev.examples) : [] };
    this.line('화가', blueprint.painter_line, 'creative');
    this.setStage('creative', { progress: 0.45 });
    this.send('progress', { stage: 'creative' });

    // ② 콘텐츠 — 사람이 실제로 보고 하는 것. 설계서는 그릇(체계·규칙)이고, 사조의 처리·인사이트·노하우가 가장 잘 드러나는 곳은 담을 것이다
    const contentFix = fixes.filter((f) => /콘텐츠|컨텐츠|문구|예시|이야기|프로그램/.test(f));
    let contents = rework && arr(prev.contents).length && !contentFix.length ? prev.contents : null;
    if (!contents) {
      const nC = Math.max(3, Math.min(6, (b.plan.example_count || 3) + 1));
      const cj = await this.call({
        role: 'director', prompt: '10_content', stage: 'creative',
        agent: { key: 'painter', name: '화가', task: `콘텐츠 ${nC}개 — 사람이 실제로 보고 하는 것` },
        ctx: { ...common, lineage: this.lineageBrief(), tunnel: this.tunnelDigest(), blueprint: { summary: blueprint.summary, form_language: blueprint.form_language, content_modules: arr(blueprint.content_modules).map((m) => ({ name: m.name, for: m.for })), journey: blueprint.journey, ledger: { terms: ledger.terms } }, root: this.root(), now: this.nowNote(), contentCount: nC },
      }).catch((e) => { this.line('시스템', `콘텐츠 생성 실패 — 장면은 설계서에서만 고릅니다 (${e.message})`, 'creative'); return { contents: [] }; });
      contents = arr(cj.contents).slice(0, 6);
      if (cj.line) this.line('화가', cj.line, 'creative');
    }
    this.run.results.creative.contents = contents;
    this.setStage('creative', { progress: 0.55 });
    this.send('progress', { stage: 'creative' });

    // ③ 핵심 장면 — 콘텐츠가 보이는 순간. 재작업이면 장면·콘텐츠를 짚은 지적이 있을 때만 다시 그린다
    const sceneFix = fixes.filter((f) => /장면|대표|핵심 장면|헤드라인|시각화|이미지|앵글|구도|형태|조형/.test(f));
    if (!rework || sceneFix.length || contentFix.length || !arr(prev.examples).length) {
      const mustN = scope.filter((x) => x.must).length;
      const n = Math.max(3, Math.min(5, Math.max(b.plan.example_count || 3, mustN)));
      const json = await this.call({
        role: 'director', prompt: '10_creative', stage: 'creative',
        agent: { key: 'painter', name: '화가', task: `핵심 장면 ${n}곳` },
        // 장면은 설계서에서 고른다 — 계보·터널 원문은 설계서에 이미 녹아 있으니 요약만 준다 (입력 토큰이 가장 큰 호출)
        ctx: { ...common, lineage: this.lineageBrief(), tunnel: this.tunnelBrief(), blueprint: this.blueprintDigest(blueprint, { specMax: 260 }), contents, exampleCount: n },
      });
      json.examples = (json.examples || []).slice(0, 5);
      // 다시 그린 장면은 앞 이미지를 이어받지 않는다
      this.run.results.creative = { ...json, blueprint, contents };
      this.line('화가', json.painter_line, 'creative');
    } else {
      this.run.results.creative = { ...prev, blueprint, contents };
    }
    await this.polish('creative', this.run.results.creative, { skip: ['headline', 'sections', 'content_modules', 'spec', 'what', 'where', 'shows', 'becomes', 'form_language'] });
  }

  /** 해부도 절마다 조수가 병렬로 설계한다 */
  async draftSections(list, common, fixesByKey = {}, prevByKey = {}, ownedOf = () => []) {
    const all = arr(this.type.anatomy);
    const scopeText = this.scope().map((x) => x.item).join(' ');
    return pLimit(list, settings.get().run.maxParallel || 4, async (sec) => {
      const must = arr(sec.must).filter((m) => arr(m.when).some((w) => scopeText.includes(w))).map((m) => m.msg);
      const fixes = arr(fixesByKey[sec.key]);
      try {
        const j = await this.call({
          role: 'sub', prompt: '10_bp_section', stage: 'creative',
          agent: { key: `bp-${sec.key}`, name: `조수 · 설계 (${sec.label})`, task: fixes.length ? `${sec.label} 보완` : sec.ask },
          ctx: {
            ...common, sectionKey: sec.key, sectionLabel: sec.label, sectionAsk: sec.ask, minItems: sec.min || 2,
            otherSections: all.filter((a) => a.key !== sec.key).map((a) => a.label).join(' · '),
            ownedTopics: ownedOf(sec.key).join(' · ') || '(원장에 정한 주제 없음 — 이 절의 질문에만 답한다)',
            mustNote: must.length ? `- **이 절에 반드시 들어갈 것**: ${must.join(' / ')}` : '',
            fixes: fixes.length ? `## 지난 초안 — 빠진 것을 채워 다시 낸다 (좋은 항목은 그대로 둔다)\n${fixes.map((f) => `- ${f}`).join('\n')}\n\n지난 초안:\n${JSON.stringify(prevByKey[sec.key] || null)}` : '',
          },
        });
        return { ...j, key: sec.key, label: sec.label, items: arr(j.items) };
      } catch (err) {
        this.line('시스템', `설계 절 '${sec.label}' 실패 — ${err.message}`, 'creative');
        return { key: sec.key, label: sec.label, items: [], error: err.message };
      }
    });
  }

  /** 화가가 절별 초안을 통합한다 — 절 항목은 초안을 그대로 싣는다 */
  async integrateBlueprint(drafts, common, previous, fixes) {
    const bp = await this.call({
      role: 'director', prompt: '10_blueprint', stage: 'creative',
      agent: { key: 'painter', name: '화가', task: previous ? `설계 통합 보완 — ${fixes.length}곳` : `설계 통합 — 범위 ${common.scope.length}항목 · ${drafts.length}절` },
      ctx: { ...common, drafts: drafts.map((d) => ({ key: d.key, label: d.label, items: d.items, vs_baseline: d.vs_baseline })), fixes: previous ? `## 지난 통합에서 빠진 것 — 채운다 (좋은 부분은 그대로 둔다)\n${fixes.map((f) => `- ${f}`).join('\n')}\n\n지난 통합:\n${JSON.stringify({ ...previous, sections: undefined })}` : '' },
    });
    const anatomy = arr(this.type.anatomy);
    bp.sections = anatomy.map((a) => drafts.find((d) => d.key === a.key) || { key: a.key, label: a.label, items: [] });
    // 절마다 같은 질문이 반복된다(공식 로고·색·서체 ×11) — 비슷한 것은 하나로, 원장의 '정할 값'과 겹치면 뺀다
    const measured = arr(common.ledger && common.ledger.to_measure).map((x) => x.what || x);
    // 화가가 절의 질문을 합쳐 낸 목록을 쓴다(의미로 묶는 일은 화가가 한다) — 비었을 때만 절의 질문을 모은다
    const pool = arr(bp.open_questions).length ? arr(bp.open_questions) : drafts.flatMap((d) => arr(d.open_questions));
    bp.open_questions = facts.dedupe(pool.filter((q) => !measured.some((m) => facts.similar(m, q) >= 0.6)), { threshold: 0.45, max: 10 });
    bp.section_vs_baseline = drafts.filter((d) => d.vs_baseline).map((d) => ({ key: d.key, label: d.label, vs_baseline: d.vs_baseline }));
    return bp;
  }

  /** 설계서 점검 — {key: 해당 절(없으면 통합), text} */
  blueprintGaps(bp, scope) {
    const gaps = [];
    const anatomy = arr(this.type.anatomy);
    const scopeText = scope.map((x) => x.item).join(' ');
    const textOf = (sec) => JSON.stringify(arr(sec && sec.items));
    for (const a of anatomy) {
      const sec = arr(bp.sections).find((y) => y.key === a.key);
      const n = arr(sec && sec.items).length;
      if (n < (a.min || 2)) gaps.push({ key: a.key, text: `'${a.label}' 항목이 ${n}개 — ${a.min || 2}개 이상 (${a.ask})` });
      for (const m of arr(a.must)) if (arr(m.when).some((w) => scopeText.includes(w)) && !arr(m.any).some((w) => textOf(sec).includes(w))) gaps.push({ key: a.key, text: `'${a.label}' — ${m.msg}` });
    }
    // 범위: 커버리지(통합)와 실제 항목(절) 둘 다 있어야 한다
    const cov = Object.fromEntries(arr(bp.scope_coverage).filter((x) => x && x.how && String(x.how).length > 4).map((x) => [x.scope_id, x]));
    const used = new Set([...arr(bp.sections).flatMap((sec) => arr(sec.items).flatMap((it) => arr(it.scope_ids))), ...arr(bp.content_modules).flatMap((m) => arr(m.scope_ids)), ...arr(bp.journey).flatMap((j) => arr(j.scope_ids))]);
    const keyFor = (x) => { const k = /콘텐츠/.test(x.kind) ? 'content' : /서비스|앱/.test(x.kind) ? 'interaction' : /운영/.test(x.kind) ? 'ops' : 'system'; return anatomy.find((a) => a.key === k) ? k : (anatomy[0] || {}).key; };
    for (const x of scope) {
      if (!x.must) continue;
      if (!used.has(x.id)) gaps.push({ key: keyFor(x), text: `범위 ${x.id} ${x.item} — 설계 항목에서 구체적으로 다루지 않음` });
      else if (!cov[x.id]) gaps.push({ key: null, text: `범위 ${x.id} — scope_coverage에 어떻게 다루는지 없음` });
    }
    // 조형 언어: 고른 사조의 조작에서 나와야 한다
    const sel = new Set(arr(this.run.results.airplane && this.run.results.airplane.synth && this.run.results.airplane.synth.selected));
    const pr = arr(bp.form_language && bp.form_language.principles).filter((x) => x.from && x.becomes);
    if (pr.length < 2) gaps.push({ key: null, text: '조형 언어 — 사조 원리·조형 조작이 무엇으로 바뀌는지 두 개 이상' });
    else if (sel.size && !pr.some((x) => [...sel].some((id) => String(x.from).includes(id)))) gaps.push({ key: null, text: `조형 언어 — 고른 사조(${[...sel].join(', ')})의 조작에서 나온 결정이 없음` });
    if (anatomy.some((a) => a.key === 'placement') && !arr(bp.form_language && bp.form_language.departures).length) gaps.push({ key: null, text: '조형 언어 — 일반 유형(토템·사각 패널·기둥형 키오스크)을 사조의 처리로 어떻게 다뤘는지(departures)' });
    if (anatomy.some((a) => a.key === 'content') && arr(bp.content_modules).length < 2) gaps.push({ key: null, text: '콘텐츠 모듈 — 화면·면에 실제로 보이는 것을 두 개 이상' });
    if (arr(this.run.results.brief && this.run.results.brief.rfp && this.run.results.brief.rfp.eval_criteria).length && !arr(bp.eval_map).length) gaps.push({ key: null, text: '평가 항목마다 설계의 어디서 응답하는지(eval_map)' });
    return gaps;
  }

  /** 장면 단계로 넘길 설계 요약 */
  blueprintDigest(bp, { specMax = 0 } = {}) {
    const cut = (t) => (specMax && typeof t === 'string' && t.length > specMax ? `${t.slice(0, specMax)}…` : t);
    return { summary: bp.summary, baseline_gap: bp.baseline_gap, form_language: bp.form_language, ledger: bp.ledger && { rules: bp.ledger.rules, terms: bp.ledger.terms }, sections: arr(bp.sections).map((s) => ({ key: s.key, label: s.label, items: arr(s.items).map((it) => ({ name: it.name, what: it.what, where: it.where, spec: cut(it.spec), scope_ids: it.scope_ids })) })), content_modules: bp.content_modules, journey: bp.journey, scope_coverage: bp.scope_coverage };
  }

  /** 자동 이미지 생성이 꺼진 이유 — 켜져 있으면 null */
  imagesOff() {
    if (!settings.get().run.generateImages) return '설정에서 가이드 이미지 생성이 꺼져 있음';
    if (this.brief.images === false) return '이 프로젝트의 의뢰서에서 이미지 생성을 끔';
    const ids = this.brief.deliverables || [];
    const types = ids.map(typeById).filter(Boolean);
    // 여러 유형이면 하나라도 이미지를 쓰는 유형이면 그린다 (첫 유형만 보면 UI/UX + KV 조합에서 꺼진다)
    if (types.length ? !types.some((t) => t.image !== false) : this.type.image === false) return '결과물 유형이 이미지를 쓰지 않음';
    return null;
  }
  imagesEnabled() { return !this.imagesOff(); }

  async generateImages(only = null) {
    const c = this.run.results.creative;
    if (!c) return;
    // 자동 생성은 스위치를 따른다. 사람이 '그리기'를 누른 것(only)은 스위치와 상관없이 그린다 — 예전에는 여기서 조용히 끝나 버튼이 아무 일도 안 했다
    const off = only === null ? this.imagesOff() : null;
    if (off) { c.imageSkip = off; this.line('시스템', `가이드 이미지를 그리지 않음 — ${off}. 카드의 '그리기'로 한 장씩 그릴 수 있다`, 'creative'); return; }
    delete c.imageSkip;
    const list = c.examples.map((e, i) => ({ e, i })).filter(({ e, i }) => e.image_prompt && (only === null || only === i));
    await pLimit(list, 2, async ({ e, i }) => {
      const pick = this.imageModel();
      const a = { id: `creative:image:${i}:${Date.now()}`, stage: 'creative', role: 'image', key: 'image', name: `조수 · 이미지 (${e.title || i + 1})`, task: e.title, model: (providers.isMock() ? 'mock:' : '') + pick.model, why: pick.why, status: 'working', startedAt: now() };
      this.run.agents.push(a);
      this.send('agent-start', { agent: a });
      try {
        const size = ['1536x1024', '1024x1024', '1024x1536'].includes(e.image_size) ? e.image_size : (this.type.imageSize || '1536x1024');
        const d = e.detail || {};
        const prompt = `${e.image_prompt}\n\nCamera & lighting guide: ${[d.angle, d.view, d.light, d.texture].filter(Boolean).join(' / ')}\nStyle note: concept visual draft for a design review. No text, no letters, no logos, no watermark. Leave clean negative space where the headline will go.`;
        this.agentProgress(a, { phase: 'drawing' });
        const r = await this.provider.image({ prompt, size, model: pick.model, signal: this.abort.signal, meta: { example: e, index: i } });
        const buf = r.buffer || r;
        const ext = buf[0] === 0x3c ? 'svg' : 'png';
        const rel = store.writeOutput(this.id, `guide-${i + 1}-${Date.now()}.${ext}`, buf);
        e.image = `ct://project/${this.id}/${rel}`;
        e.imageFile = rel;
        delete e.imageError;
        const ic = cost.imageCost(r.model || pick.model, r.usage, size, r.quality || settings.get().run.imageQuality);
        a.cost = ic.usd;
        this.run.usage.images++;
        this.addCost('creative', ic.usd, { model: r.model || pick.model, role: 'image', estimate: !!ic.estimate });
        a.status = 'done';
      } catch (err) {
        e.imageError = err.message;
        a.status = 'error'; a.error = err.message;
      }
      a.endedAt = now();
      this.send('agent-done', { agent: a });
    });
  }

  /* ---------------- flow ---------------- */

  async runStage(id) {
    const fn = {
      brief: () => this.stageBrief(), canvas: () => this.stageCanvas(), airplane: () => this.stageAirplane(),
      tunnel: () => this.stageTunnel(), think: () => this.stageThink(), positioning: () => this.stagePositioning(), forpop: () => this.stageForpop(),
      concept: () => this.stageConcept(), creative: () => this.stageCreative(),
    }[id];
    const out = {
      canvas: () => this.run.results.canvas,
      airplane: () => ({ travels: (this.run.results.airplane.travels || []).map(({ id, take, leave, core, a3 }) => ({ id, take, leave, core, a3 })), synth: this.run.results.airplane.synth }),
      tunnel: () => this.tunnelDigest(),
      think: () => this.thinkDigest(),
      positioning: () => this.run.results.positioning,
      creative: () => ({ blueprint: this.run.results.creative.blueprint && { ...this.blueprintDigest(this.run.results.creative.blueprint, { specMax: 200 }), baseline_gap: undefined }, contents: this.run.results.creative.contents, examples: (this.run.results.creative.examples || []).map(({ image, imageFile, image_prompt, ...e }) => e), selection: this.run.results.creative.selection }),
    }[id] || (() => null);
    this.run.stage = id;
    this.run.status = 'running';
    // 생각의 회차는 리뷰 답마다 이어서 돈다 — 처음 시작한 시각을 지켜야 '과정 다시 보기'가 회차를 순서대로 보인다
    const resumeThink = id === 'think' && this.run.results.think && arr(this.run.results.think.rounds).length && this.run.stages.think && this.run.stages.think.startedAt;
    this.setStage(id, { status: 'running', progress: 0.08, startedAt: resumeThink ? this.run.stages.think.startedAt : now(), error: null, redo: 0 });
    this.send('stage-start', { stage: id });
    if (BASELINE_STAGES.has(id) && !this.run.results.baseline && this.run.results.brief) await this.baseline();
    // 단계 결과마다 사실 가드 — 근거 없는 수치 · 문장 끝 고지를 정리한 뒤에 브레인이 검증한다
    const run = async () => { await fn(); await this.factGuard(id); };
    if (SELF_BRAIN.has(id)) await run(); else await this.withBrain(id, run, out);
    if (id === 'think' && this.run.results.think && this.run.results.think.awaiting) return;
    if (id === 'creative') { this.setStage('creative', { progress: 0.8 }); this.send('progress', { stage: id }); await this.generateImages(); }
    this.setStage(id, { status: 'done', progress: 1, endedAt: now() });
    this.send('stage-done', { stage: id });
  }

  async runFrom(from) {
    try {
      let i = ORDER.indexOf(from);
      while (i < ORDER.length) {
        const id = ORDER[i];
        await this.runStage(id);
        if (id === 'brief') {
          const r = this.run.results.brief;
          if (['질문부터', '멈춤'].includes(r.gate) && ((r.questions || []).length || r.gate === '멈춤')) {
            this.run.status = 'paused'; this.run.pausedAt = 'brief';
            this.setStage('brief', { status: 'waiting' });
            this.send('gate', { gate: 'brief' });
            return;
          }
          // 근본 이슈 확정 — 비용이 크게 들기 전에 사람이 고른다
          if (r.root_issue && !(this.run.root && this.run.root.confirmed) && settings.get().run.rootGate !== false) {
            this.run.status = 'paused'; this.run.pausedAt = 'root';
            this.setStage('brief', { status: 'waiting' });
            this.send('gate', { gate: 'root' });
            return;
          }
        }
        if (id === 'think' && this.run.results.think && this.run.results.think.awaiting) {
          this.run.status = 'paused'; this.run.pausedAt = 'review';
          this.setStage('think', { status: 'waiting' });
          this.send('gate', { gate: 'review' });
          return;
        }
        if (id === 'concept') {
          if (this.brief.depth !== 'full') {
            this.run.status = 'paused'; this.run.pausedAt = 'C';
            this.setStage('concept', { status: 'waiting' });
            this.send('gate', { gate: 'C' });
            return;
          }
          this.run.gates.C.history.push({ at: now(), decision: 'go', note: '끝까지 진행 — 예비 통과 (사람 확정 필요)', preliminary: true });
        }
        i++;
      }
      this.run.status = 'done';
      this.run.endedAt = now();
      this.run.pausedAt = null;
      this.send('done');
    } catch (e) {
      if (this.abort.signal.aborted) {
        this.run.status = 'canceled';
        this.setStage(this.run.stage, { status: 'canceled' });
        this.send('canceled');
      } else {
        this.run.status = 'error';
        this.run.error = e.message;
        this.setStage(this.run.stage, { status: 'error', error: e.message });
        this.send('error', { error: e.message });
      }
    } finally {
      if (runs.get(this.id) === this) runs.delete(this.id);
    }
  }
}

function emitterFor(win) {
  return (payload) => { if (win && !win.isDestroyed()) win.webContents.send('run:event', payload); };
}

/** 사조 계획에 대립 짝(A-99)이 없으면 첫 사조의 반대편을 넣는다 (5개면 마지막을 바꾼다) */
function ensureContrast(plan, pairs, valid) {
  const ids = new Set(plan.isms.map((x) => x.id));
  if (!pairs.length || pairs.some((p) => ids.has(p.a) && ids.has(p.b))) return null;
  for (const first of plan.isms) {
    const p = pairs.find((x) => (x.a === first.id && !ids.has(x.b) && valid.has(x.b)) || (x.b === first.id && !ids.has(x.a) && valid.has(x.a)));
    if (!p) continue;
    const other = p.a === first.id ? { id: p.b, says: p.bSays } : { id: p.a, says: p.aSays };
    const item = { id: other.id, why: `대립 사조 — '${p.issue}'에서 ${first.id}와 반대 답(${other.says}). 해석 쪽을 맡는다`, contrast: { with: first.id, issue: p.issue } };
    if (plan.isms.length >= 5) plan.isms[plan.isms.length - 1] = item; else plan.isms.push(item);
    return item;
  }
  return null;
}

function isImageModel(id) { return /^(gpt-image|dall-e|chatgpt-image)/.test(String(id || '')); }

function controller(projectId, emit, { reset = false } = {}) {
  if (runs.has(projectId)) return runs.get(projectId);
  const c = new Controller(projectId, emit);
  if (reset) c.run = emptyRun();
  runs.set(projectId, c);
  return c;
}

function firstIncomplete(run) {
  return ORDER.find((id) => !run.stages[id] || run.stages[id].status !== 'done') || null;
}

async function start(projectId, emit) {
  if (runs.has(projectId)) return { ok: true, already: true };
  const p = store.get(projectId);
  if (!p) throw new Error('프로젝트를 찾을 수 없습니다');
  const fresh = !p.run || ['done', 'stopped'].includes(p.run.status);
  const c = controller(projectId, emit, { reset: fresh });
  const from = fresh ? 'brief' : (firstIncomplete(c.run) || 'brief');
  c.runFrom(from);
  return { ok: true, from };
}

async function answerBrief(projectId, answers, emit) {
  const c = controller(projectId, emit);
  const r = c.run.results.brief || {};
  c.run.gates.brief.rounds.push({ at: now(), questions: r.questions || [], answers });
  c.runFrom('brief');
  return { ok: true };
}

/** 근본 이슈 확정 — 후보 중 하나를 고르거나 직접 쓴다 */
async function answerRoot(projectId, ans, emit) {
  const c = controller(projectId, emit);
  const ri = (c.run.results.brief && c.run.results.brief.root_issue) || { candidates: [] };
  const pick = arr(ri.candidates).find((x) => x.id === (ans && ans.id));
  const issue = String((ans && ans.issue) || (pick && pick.issue) || '').trim();
  if (!issue) throw new Error('근본 이슈를 고르거나 적어 주세요');
  c.run.root = { id: pick && !ans.issue ? pick.id : 'H', issue, test: String((ans && ans.test) || (pick && pick.test) || '').trim(), task: ri.task, purpose: ri.purpose, confirmed: true, by: (c.project.brief && c.project.brief.worker) || '', at: now() };
  c.line('디자이너', `근본 이슈 확정 — ${issue}`, 'brief');
  c.setStage('brief', { status: 'done' });
  c.run.pausedAt = null;
  c.runFrom('canvas');
  return { ok: true };
}

/** 중간 리뷰의 답 — 다음 회차로 가거나, 지금 안으로 다음 단계에 간다 */
async function answerReview(projectId, ans, emit) {
  const c = controller(projectId, emit);
  const T = c.run.results.think;
  const last = T && T.rounds[T.rounds.length - 1];
  if (!last) throw new Error('답할 리뷰가 없습니다');
  const choice = (ans && ans.choice) || 'done';
  if (!ANSWER_KO[choice]) throw new Error('알 수 없는 답');
  if (choice === 'other' && !String(ans.text || '').trim()) throw new Error('다른 방향을 적어 주세요');
  last.answer = { choice, text: String((ans && ans.text) || '').trim(), at: now(), by: (c.project.brief && c.project.brief.worker) || '' };
  c.line('디자이너', `회차 ${last.n} — ${ANSWER_KO[choice]}${last.answer.text ? ` · ${last.answer.text}` : ''}`, 'think');
  c.run.pausedAt = null;
  if (choice === 'done' || T.rounds.length >= ROUND_CAP) {
    c.finishThink();
    c.setStage('think', { status: 'done', progress: 1, endedAt: now() });
    c.runFrom('positioning');
  } else {
    T.awaiting = false;
    c.runFrom('think');
  }
  return { ok: true };
}

async function gate(projectId, decision, note, emit) {
  const c = controller(projectId, emit);
  c.run.gates.C.history.push({ at: now(), decision, note: note || '', by: (c.project.brief && c.project.brief.worker) || '' });
  if (decision === 'stop') {
    c.run.status = 'stopped'; c.run.pausedAt = null;
    c.setStage('concept', { status: 'done' });
    c.send('stopped');
    runs.delete(projectId);
    return { ok: true };
  }
  if (decision === 'revise') { c.runFrom('concept'); return { ok: true }; }
  c.setStage('concept', { status: 'done' });
  c.runFrom('creative');
  return { ok: true };
}

/** 영감 — 사람이 단계 리포트를 보고 떠오른 것을 넣으면 그 단계부터 다시 그린다 */
async function inspire(projectId, stage, text, emit) {
  if (runs.has(projectId)) throw new Error('진행 중에는 영감을 넣을 수 없습니다. 멈춘 뒤에 넣어 주세요.');
  if (!ORDER.includes(stage)) throw new Error('알 수 없는 단계');
  const c = controller(projectId, emit);
  const idx = ORDER.indexOf(stage);
  c.run.versions.push({ at: now(), from: stage, inspiration: text, results: clone(c.run.results), brain: clone(c.run.brain) });
  if (c.run.versions.length > 10) c.run.versions.shift();
  c.run.inspirations.push({ at: now(), stage, text, by: (c.project.brief && c.project.brief.worker) || '' });
  for (const id of ORDER.slice(idx)) {
    c.run.stages[id] = { status: 'pending', progress: 0, cost: c.run.stages[id] ? c.run.stages[id].cost || 0 : 0 };
    (c.run.stageLog = c.run.stageLog || []).push({ id, ev: 'reset', at: now() });
    if (id !== 'brief') delete c.run.results[id];
    delete c.run.brain[id];
  }
  c.run.pausedAt = null;
  c.line('디자이너', `영감 — ${text}`, stage);
  c.runFrom(stage);
  return { ok: true };
}

async function regenerateImage(projectId, index, emit) {
  // 진행 중인 실행이 있으면 그 컨트롤러를 쓰고 지우지 않는다 — 예전에는 실행 중에 누르면 진행 중인 실행을 목록에서 지워 버렸다
  const live = runs.has(projectId);
  const c = live ? runs.get(projectId) : new Controller(projectId, emit);
  if (!c.run.results.creative) throw new Error('아직 Creative 결과가 없습니다');
  const e = (c.run.results.creative.examples || [])[index];
  if (!e) throw new Error('해당 예시를 찾을 수 없습니다');
  if (!e.image_prompt) throw new Error('이 예시에는 이미지 프롬프트가 없습니다');
  await c.generateImages(index);
  c.save();
  c.send('progress', { stage: 'creative' });
  return e.image && !e.imageError ? { ok: true } : { ok: false, error: e.imageError || '이미지를 만들지 못했습니다' };
}

/** 최종 리포트용 코어 추출 (PPT) — 한 번 만든 것은 다시 쓰고, force면 새로 */
async function reportCore(projectId, emit, { force = false } = {}) {
  if (runs.has(projectId)) throw new Error('진행 중에는 리포트를 만들 수 없습니다');
  const c = controller(projectId, emit);
  try {
    if (c.run.results.report && !force) return c.run.results.report;
    const json = await c.call({
      role: 'director', prompt: '11_report', stage: 'creative', extras: false,
      agent: { key: 'painter', name: '화가', task: '최종 리포트 코어 추출' },
      ctx: { digest: c.digest(true) },
    });
    c.run.results.report = json;
    await c.polish('report', json, { skip: ['title'] });
    c.send('progress', { stage: 'creative' });
    return json;
  } finally { runs.delete(projectId); }
}

function cancel(projectId) {
  const c = runs.get(projectId);
  if (c) c.abort.abort();
  return { ok: !!c };
}

function markInterrupted() {
  for (const p of store.list()) {
    if (p.status === 'running') {
      const full = store.get(p.id);
      full.run.status = 'interrupted';
      store.saveRun(p.id, full.run);
    }
  }
}

module.exports = { ensureContrast, STAGES, ORDER, start, answerBrief, answerRoot, answerReview, gate, inspire, cancel, regenerateImage, reportCore, emitterFor, markInterrupted, formatBrief };
