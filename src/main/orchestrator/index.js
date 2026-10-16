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
const { render } = require('./prompts');

const STAGES = [
  { id: 'brief', scene: 'mission', label: '미션 접수', sub: '브리프 게이트' },
  { id: 'canvas', scene: 'canvas', label: '캔버스', sub: '나로부터 · S0' },
  { id: 'airplane', scene: 'airplane', label: 'Airplane', sub: '사조 여행' },
  { id: 'tunnel', scene: 'tunnel', label: 'Tunnel', sub: '인사이트 레이어링' },
  { id: 'positioning', scene: 'exit', label: 'Positioning Map', sub: '5 → 4 → 3 → 1' },
  { id: 'forpop', scene: 'compass', label: 'FoR · PoP · PoD', sub: '최종 검증 · 발상의 전환' },
  { id: 'concept', scene: 'newcanvas', label: 'Concept · Theme', sub: '5 → 3 → 1 · C 게이트' },
  { id: 'creative', scene: 'gallery', label: 'Creative', sub: '가이드 3~5종' },
];
const ORDER = STAGES.map((s) => s.id);
const LABEL = Object.fromEntries(STAGES.map((s) => [s.id, `${s.label} — ${s.sub}`]));
const INTRINSIC = new Set(['forpop', 'concept']); // 브레인이 단계 안에서 직접 추론하는 단계

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
    return { ...types[0], also: types.slice(1).map((t) => ({ id: t.id, label: t.label, unit: t.unit, focus: t.focus })) };
  }
  get mission() { return (this.run.results.brief && this.run.results.brief.mission) || {}; }

  save() { store.saveRun(this.id, this.run); }
  send(kind, extra = {}) { this.save(); this.emit({ projectId: this.id, kind, ...extra, run: this.run }); }
  line(who, text, stage) {
    if (!text) return;
    this.run.lines.push({ at: now(), who, text, stage: stage || this.run.stage });
    if (this.run.lines.length > 300) this.run.lines.shift();
  }
  setStage(id, patch) { this.run.stages[id] = { ...this.run.stages[id], ...patch }; }

  async prepareMedia() {
    if (this.media) return this.media;
    const files = (this.project.attachments || []).filter((a) => a.rel).map((a) => path.join(store.projectDir(this.id), a.rel));
    this.media = await attachments.prepare(files);
    return this.media;
  }

  /* ---------- 모델 배정 — 화가의 판단 ---------- */
  modelFor(stage, role) {
    const o = settings.get().openai;
    const def = { model: o.models[role] || o.models.director, effort: '', why: '기본 설정' };
    if (!o.autoModel) return def;
    const pool = new Set((o.pool || []).map((p) => p.id));
    const plan = (this.run.modelPlan || []).find((p) => p.stage === stage && p.role === role);
    if (plan && pool.has(plan.model)) return { model: plan.model, effort: plan.effort || '', why: plan.why || '화가 배정' };
    return def;
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
    if (pv && pv.verdict === '보완' && (pv.fixes || []).length) parts.push(`## 앞 단계 검증에서 넘어온 보완점\n${pv.fixes.map((f) => `- ${f}`).join('\n')}`);
    const insp = this.inspirationFor(stage);
    if (insp !== '(없음)') parts.push(`## 디자이너의 영감 — 판단의 출발점(나로부터)으로 존중하라\n${insp}`);
    return parts.length ? `\n\n---\n${parts.join('\n\n')}` : '';
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
    if (R.concept) d.concept = { concept: R.concept.concept, theme: R.concept.theme, keywords: R.concept.keywords, philosophy_core: R.concept.philosophy_core, ...(full ? { proposals: (R.concept.proposals || []).map((p) => ({ id: p.id, theme: p.theme, concept: p.concept })), first_round: R.concept.first_round, brain_select: R.concept.brain_select && R.concept.brain_select.final } : {}) };
    if (R.creative) d.creative = (R.creative.examples || []).map((e) => ({ direction: e.direction, title: e.title, headline: e.headline, one_liner: e.one_liner, ...(full ? { structure: (e.structure || []).map((s) => s.name), detail: e.detail } : {}) }));
    const bv = Object.entries(this.run.brain).filter(([, v]) => v && v.verify).map(([k, v]) => ({ stage: k, verdict: v.verify.verdict, issues: (v.verify.issues || []).slice(0, 2) }));
    if (bv.length) d.brain = bv;
    if (this.run.inspirations.length) d.inspirations = this.run.inspirations.map((i) => ({ stage: i.stage, text: i.text }));
    if (full && R.creative && R.creative.selection) d.selection = R.creative.selection;
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
    const pick = this.modelFor(stage, role);
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
      const r = await fn({ role, model: pick.model, effort: pick.effort, system, content, signal: this.abort.signal, meta: { stage, prompt, ...meta, ctx } });
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
        return { ...r.json, _citations: r.citations || [], _searches: r.searches || 0 };
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

  /* ---------- 더프롬 판단 브레인 ---------- */
  brainCfg(stage) { return (knowledge.load().brain.stages || {})[stage]; }
  brainEnabled(stage) {
    const mode = settings.get().run.brain || 'standard';
    const c = this.brainCfg(stage);
    return mode !== 'off' && !!c && (c.intensity || []).includes(mode);
  }
  lensTable() { return (knowledge.load().brain.lenses || []).map((l) => `| ${l.id} | ${l.name} | ${l.question} | ${l.source} |`).join('\n').replace(/^/, '| ID | 렌즈 | 질문 | 출처 |\n|---|---|---|---|\n'); }
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
      stageLabel: LABEL[stage], mission: this.mission, digest: this.digest(), inspiration: this.inspirationFor(stage),
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
      ctx: { ...this.brainCtx(stage), directive: (this.run.brain[stage] || {}).direct || null, output },
      meta: { stage, mode: 'verify' },
    });
    const b = this.run.brain[stage] = this.run.brain[stage] || {};
    b.verify = v;
    (b.attempts = b.attempts || []).push({ at: now(), verdict: v.verdict, issues: v.issues });
    this.line('판단 브레인', `${v.verdict} — ${v.line || (v.issues || [])[0] || ''}`, stage);
    this.send('brain', { stage, mode: 'verify', verdict: v.verdict });
    return v;
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
      if (v.verdict !== '재작업' || attempt >= retry) break;
      this.run.brain[stage].fixPending = v.fixes || [];
      this.line('화가', '브레인의 지적을 반영해 다시 그립니다.', stage);
      this.setStage(stage, { progress: 0.3, redo: attempt + 1 });
      this.send('progress', { stage });
    }
    if (this.run.brain[stage]) delete this.run.brain[stage].fixPending;
  }

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
      ctx: { brief: formatBrief(this.brief), attachmentsNote: note, answers, type: this.type, ismIndex: this.ismIndex(), modelPool: o.autoModel ? o.pool : '(자동 배정 꺼짐 — model_plan 비움)' },
    });
    const valid = new Set(knowledge.load().isms.map((i) => i.id));
    json.plan = json.plan || {};
    json.plan.isms = (json.plan.isms || []).filter((x) => valid.has(x.id)).slice(0, 5);
    for (const d of ['ISM-BAUHAUS', 'ISM-JP', 'ISM-SWISS', 'ISM-POSTMOD']) {
      if (json.plan.isms.length >= 3) break;
      if (!json.plan.isms.find((x) => x.id === d)) json.plan.isms.push({ id: d, why: '기본 후보' });
    }
    const layers = (json.plan.layers || []).filter((l) => LAYER_DEFAULTS.find((d) => d.key === l.key));
    json.plan.layers = layers.length >= 3 ? layers : LAYER_DEFAULTS;
    json.plan.example_count = Math.max(3, Math.min(5, parseInt(json.plan.example_count, 10) || 3));
    const pool = new Set((o.pool || []).map((p) => p.id));
    this.run.modelPlan = (json.plan.model_plan || []).filter((p) => pool.has(p.model) && ['sub', 'director', 'brain'].includes(p.role));
    this.run.results.brief = json;
    this.line('화가', json.plan.note || (json.mission && json.mission.one_line), 'brief');
    return json;
  }

  async stageCanvas() {
    const b = this.run.results.brief;
    const json = await this.call({
      role: 'director', prompt: '02_canvas', stage: 'canvas',
      agent: { key: 'painter', name: '화가', task: '캔버스 — 나로부터 · 컨셉 한 문장 초안' },
      ctx: { mission: b.mission, assumptions: b.assumptions, attachment_insights: b.attachment_insights, type: this.type },
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
    const travels = await pLimit(plan, max, async (p) => {
      const card = isms.find((i) => i.id === p.id);
      if (!card) return { id: p.id, name: p.id, error: '카탈로그에 없음' };
      const json = await this.call({
        role: 'sub', prompt: '03_ism', stage: 'airplane',
        agent: { key: p.id, name: `조수 · ${card.name} 여행자`, task: p.why },
        ctx: { mission: b.mission, canvas: this.run.results.canvas, ismBody: card.body, ismId: card.id, typeLabel: this.type.label },
        meta: { ism: card },
      }).catch((e) => ({ id: p.id, error: e.message }));
      json.id = p.id; json.name = card.name; json.era = card.era; json.custom = !!card.custom;
      this.run.results.airplane.travels.push(json);
      done++;
      this.setStage('airplane', { progress: 0.1 + 0.6 * (done / plan.length) });
      this.line(`조수 · ${card.name}`, json.postcard || json.core, 'airplane');
      this.send('progress', { stage: 'airplane' });
      return json;
    });
    const ok = travels.filter((t) => !t.error);
    if (!ok.length) throw new Error('사조 여행이 모두 실패했습니다');
    this.run.results.airplane.travels = travels;
    const synth = await this.call({
      role: 'director', prompt: '04_airplane_synth', stage: 'airplane',
      agent: { key: 'painter', name: '화가', task: '착륙 · 하이브리드 정리' },
      ctx: { mission: b.mission, travels: ok },
    });
    this.run.results.airplane.synth = synth;
    this.line('화가', synth.painter_line, 'airplane');
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
      const json = await this.call({
        role: 'sub', prompt: '05_layer', stage: 'tunnel',
        agent: { key: layer.key, name: `조수 · ${layer.label} 레이어`, task: layer.question },
        ctx: { mission: b.mission, canvas: this.run.results.canvas, airplane, attachment_insights: b.attachment_insights, layer, layerKey: layer.key, layerLabel: layer.label, type: this.type },
        meta: { layer },
      }).catch((e) => ({ key: layer.key, label: layer.label, error: e.message, insights: [] }));
      json.key = layer.key;
      json.label = json.label || layer.label;
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

  async stagePositioning() {
    const json = await this.call({
      role: 'director', prompt: '07_positioning', stage: 'positioning',
      agent: { key: 'painter', name: '화가', task: 'Creative Positioning Map' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, airplane: this.run.results.airplane.synth, tunnel: this.tunnelDigest() },
    });
    this.run.results.positioning = json;
    this.line('화가', json.painter_line, 'positioning');
  }

  positioningDigest() {
    const p = this.run.results.positioning;
    return { axes: p.axes, whitespace: p.whitespace, chosen: (p.territories || []).find((t) => p.final && t.id === p.final.id), final: p.final, rounds: p.rounds };
  }

  async stageForpop() {
    // ① 화가 — 앞선 모든 단계의 최종 검증 + FoR(네 방식) · PoP · PoD 후보 5 · 정찰 계획
    const base = await this.call({
      role: 'director', prompt: '08_forpop', stage: 'forpop',
      agent: { key: 'painter', name: '화가', task: '최종 검증 · FoR · PoP · PoD 후보 5 · 정찰 계획' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, airplane: this.run.results.airplane.synth, tunnel: this.tunnelDigest(), positioning: this.positioningDigest() },
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
        round: 1, mission: this.mission, frame, candidates: base.pod_candidates, previous: null, scan: scanBrief, inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
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
        round: 2, mission: this.mission, frame, candidates: r1.result, previous: r1.shift, scan: scanBrief, inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
        roundRule: '이번은 2차 — 1차와 다른 유형의 전환을 적용해 하나의 코어 PoD로 좁히고, 앞선 모든 단계가 이 코어로 이어지는지 렌즈별로 최종 점검한다.',
        roundSchema: '{ "round": 2, "shift": { "type": "", "name": "", "question": "", "from": "", "to": "", "reasoning": "", "lenses": [] }, "core": { "id": "CORE", "item": "코어 PoD", "gain": "사람이 얻는 것", "from_ids": ["P?"], "statement": "FoR 안에서, PoP를 지키며, ○○로 다르다 — 한 문장", "why": "" }, "cut": [ { "id": "P?", "reason": "" } ], "rtb": [ { "fact": "", "source": "브리프|첨부:..|웹:<URL>|확인 필요" } ], "final_check": [ { "lens": "렌즈 ID", "ok": true, "note": "" } ], "verdict": "통과|보완", "line": "" }',
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
        mission: this.mission, frame, scan: scanBrief, inspiration: this.inspirationFor('forpop'), lensTable: this.lensTable(),
        pod: { core: fp.core_pod, candidates: base.pod_candidates, shifted: r1.result },
      },
    });
    fp.compare = this.normalizeCompare(cmp, scan);
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
    const hist = this.run.gates.C.history.filter((h) => h.decision === 'revise');
    const feedback = hist.length ? hist.map((h, i) => `${i + 1}차 수정 의견: ${h.note || '(의견 없음)'}`).join('\n') : '(없음 — 첫 판정)';
    const fp = this.run.results.forpop;
    const forpop = { for: fp.for, pop: fp.pop, core_pod: fp.core_pod, positioning: fp.compare && fp.compare.positioning, differentiation: fp.compare && arr(fp.compare.scopes).map((x) => ({ scope: x.title, verdict: x.verdict, different: arr(x.different).map((d) => d.item) })) };
    // ① 화가 — 5안 → 1차 3안
    const c1 = await this.call({
      role: 'director', prompt: '09_concepts', stage: 'concept',
      agent: { key: 'painter', name: '화가', task: hist.length ? `Concept 5안 — 수정 ${hist.length}차` : 'Concept · Theme 5안 → 1차 3안' },
      ctx: { mission: this.mission, canvas: this.run.results.canvas, digest: this.digest(), forpop, feedback },
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
      ctx: { mission: this.mission, picked, core: fp.core_pod, lensTable: this.lensTable(), stageLenses: this.stageLenses('concept') },
    });
    if (!sel.final || !picked.find((p) => p.id === sel.final.id)) sel.final = { id: picked[0].id, why: '브레인 선택 누락 — 1차 첫 안', refine: [] };
    this.run.results.concept.brain_select = sel;
    this.run.brain.concept = { ...(this.run.brain.concept || {}), verify: { verdict: '통과', scores: ((sel.evaluations || []).find((e) => e.id === sel.final.id) || {}).scores || [], issues: [], fixes: sel.final.refine || [], line: sel.line } };
    this.line('판단 브레인', sel.line || sel.final.why, 'concept');
    this.setStage('concept', { progress: 0.7 });
    this.send('progress', { stage: 'concept' });
    // ③ 화가 — 최종 컨셉 키트
    const final = (c1.proposals || []).find((p) => p.id === sel.final.id);
    const kit = await this.call({
      role: 'director', prompt: '09_concept_kit', stage: 'concept',
      agent: { key: 'painter', name: '화가', task: '최종 컨셉 키트 · C 게이트' },
      ctx: { mission: this.mission, final, refine: sel.final.refine || [], forpop, feedback, type: this.type },
    });
    this.run.results.concept = { ...this.run.results.concept, ...kit, final_id: final.id };
    this.line('화가', kit.painter_line, 'concept');
  }

  async stageCreative() {
    const b = this.run.results.brief;
    const hist = this.run.gates.C.history;
    const feedback = hist.map((h) => `${h.decision === 'go' ? 'go' : '수정'}: ${h.note || ''}`).join('\n') || '(없음)';
    const c = this.run.results.concept;
    const concept = { concept: c.concept, theme: c.theme, keywords: c.keywords, metaphor: c.metaphor, philosophy_core: c.philosophy_core, tone_manner: c.tone_manner, interpretation: c.interpretation, benefit: c.benefit, rough: c.rough };
    const fp = this.run.results.forpop;
    const n = Math.max(3, Math.min(5, b.plan.example_count || 3));
    const json = await this.call({
      role: 'director', prompt: '10_creative', stage: 'creative',
      agent: { key: 'painter', name: '화가', task: `Creative 가이드 ${n}종` },
      ctx: { mission: b.mission, concept, forpop: { for: fp.for, pop: fp.pop, core_pod: fp.core_pod, positioning: fp.compare && fp.compare.positioning }, tunnel: this.tunnelDigest(), feedback, type: this.type, exampleCount: n },
    });
    json.examples = (json.examples || []).slice(0, 5);
    this.run.results.creative = json;
    this.line('화가', json.painter_line, 'creative');
  }

  imagesEnabled() {
    return settings.get().run.generateImages && this.brief.images !== false && this.type.image !== false;
  }

  async generateImages(only = null) {
    const c = this.run.results.creative;
    if (!c || !this.imagesEnabled()) return;
    const list = c.examples.map((e, i) => ({ e, i })).filter(({ e, i }) => e.image_prompt && (only === null || only === i));
    await pLimit(list, 2, async ({ e, i }) => {
      const a = { id: `creative:image:${i}:${Date.now()}`, stage: 'creative', role: 'image', key: 'image', name: `조수 · 이미지 (${e.title || i + 1})`, task: e.title, model: (providers.isMock() ? 'mock:' : '') + settings.get().openai.models.image, status: 'working', startedAt: now() };
      this.run.agents.push(a);
      this.send('agent-start', { agent: a });
      try {
        const size = ['1536x1024', '1024x1024', '1024x1536'].includes(e.image_size) ? e.image_size : (this.type.imageSize || '1536x1024');
        const d = e.detail || {};
        const prompt = `${e.image_prompt}\n\nCamera & lighting guide: ${[d.angle, d.view, d.light, d.texture].filter(Boolean).join(' / ')}\nStyle note: concept visual draft for a design review. No text, no letters, no logos, no watermark. Leave clean negative space where the headline will go.`;
        const r = await this.provider.image({ prompt, size, signal: this.abort.signal, meta: { example: e, index: i } });
        const buf = r.buffer || r;
        const ext = buf[0] === 0x3c ? 'svg' : 'png';
        const rel = store.writeOutput(this.id, `guide-${i + 1}-${Date.now()}.${ext}`, buf);
        e.image = `ct://project/${this.id}/${rel}`;
        e.imageFile = rel;
        delete e.imageError;
        const ic = cost.imageCost(r.model || settings.get().openai.models.image, r.usage, size, r.quality || settings.get().run.imageQuality);
        a.cost = ic.usd;
        this.run.usage.images++;
        this.addCost('creative', ic.usd, { model: r.model || settings.get().openai.models.image, role: 'image', estimate: !!ic.estimate });
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
      tunnel: () => this.stageTunnel(), positioning: () => this.stagePositioning(), forpop: () => this.stageForpop(),
      concept: () => this.stageConcept(), creative: () => this.stageCreative(),
    }[id];
    const out = {
      canvas: () => this.run.results.canvas,
      airplane: () => ({ travels: (this.run.results.airplane.travels || []).map(({ id, take, leave, core, a3 }) => ({ id, take, leave, core, a3 })), synth: this.run.results.airplane.synth }),
      tunnel: () => this.tunnelDigest(),
      positioning: () => this.run.results.positioning,
      creative: () => ({ examples: (this.run.results.creative.examples || []).map(({ image, imageFile, image_prompt, ...e }) => e), selection: this.run.results.creative.selection }),
    }[id] || (() => null);
    this.run.stage = id;
    this.run.status = 'running';
    this.setStage(id, { status: 'running', progress: 0.08, startedAt: now(), error: null, redo: 0 });
    this.send('stage-start', { stage: id });
    if (id === 'brief') await fn(); else await this.withBrain(id, fn, out);
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
    if (id !== 'brief') delete c.run.results[id];
    delete c.run.brain[id];
  }
  c.run.pausedAt = null;
  c.line('디자이너', `영감 — ${text}`, stage);
  c.runFrom(stage);
  return { ok: true };
}

async function regenerateImage(projectId, index, emit) {
  const c = controller(projectId, emit);
  await c.generateImages(index);
  c.save();
  runs.delete(projectId);
  c.send('progress', { stage: 'creative' });
  return { ok: true };
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

module.exports = { STAGES, ORDER, start, answerBrief, gate, inspire, cancel, regenerateImage, reportCore, emitterFor, markInterrupted, formatBrief };
