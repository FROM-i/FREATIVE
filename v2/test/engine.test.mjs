// node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, buildGraph, parseLinks, hints, describe } from '../js/graph/model.js';
import { propagate, energies } from '../js/graph/propagate.js';
import { think, checkInsight, proposeIssues } from '../js/engine/think.js';
import { createMock } from '../js/providers/mock.js';
import { parseJSON } from '../js/engine/json.js';
import { SAMPLE } from '../knowledge/sample-project.js';
import { LENSES, AIRPLANE, OPPOSITIONS, IDENTITY, TUNNEL } from '../knowledge/nodes.js';
import { activatePrompt, linkPrompt, integratePrompt } from '../knowledge/prompts.js';

// 예전 경쟁 방식(노드의 완성안 + 교배 + 재대결)을 보는 테스트는 그 설정으로 돌린다. 지금 기본은 그래프 통합안이다(맨 아래 테스트).
const sample = () => { const p = newProject(SAMPLE); p.settings.weave = false; p.settings.rematch = true; return p; };

test('기본 노드 — 모든 기준 노드에 기준과 질문이 있고, 사조에는 두고 올 것이 있다', () => {
  assert.equal(AIRPLANE.length, 16);
  for (const l of LENSES) assert.ok(l.criteria && l.ask, l.id);
  for (const a of AIRPLANE) assert.ok(a.principles.length && a.take.length && a.leave.length, a.id);
  const ids = new Set(AIRPLANE.map((a) => a.id));
  for (const o of OPPOSITIONS) assert.ok(ids.has(o.a) && ids.has(o.b), o.issue);
});

test('위키링크 — 이슈 설명의 [[노드]]가 지목으로 읽힌다', () => {
  assert.deepEqual(parseLinks('[[자메뷰]]와 [[타겟]] 그리고 [[브루탈리즘]] [[없는노드]]'), ['ID-JAMAIS', 'TN-TARGET', 'ISM-BRUTAL']);
  assert.deepEqual(hints(sample()).map((h) => `${h.issue}|${h.lens}`), ['I2|TN-TARGET', 'I3|ID-YELLOW']);
});

test('사고 패스 — 발화 · 연결 · 수렴 · 통합이 한 번에 돈다', async () => {
  const p = sample();
  const events = [];
  const run = await think(p, createMock(), { onEvent: (e) => events.push(e.type === 'stage' ? e.stage : e.type) });
  const lenses = IDENTITY.length + TUNNEL.length + p.settings.ismCount;
  assert.equal(run.calls, 1 + 1 + 1 + lenses + 1 + p.settings.insightCount + run.arena.calls + 1 + 1 + 1 + (run.creative ? 2 : 0) + (run.strategy?.attempts || 0), '호출 수 = 기본안 1 + 문제 다시 정의 1 + 사조 고르기 1 + 노드 수 + 연결 1 + 묶음 통합 + 경쟁 + 더프롬 판정 1 + 디렉션 1');
  assert.equal(new Set(run.signals.map((s) => s.lens)).size, lenses, '모든 노드가 발화했다');
  assert.deepEqual(events.filter((e) => ['route', 'activate', 'link', 'propagate', 'integrate', 'direct', 'done'].includes(e)), ['route', 'activate', 'link', 'propagate', 'integrate', 'direct', 'done']);
  assert.ok(OPPOSITIONS.some((o) => run.picks.some((x) => x.id === o.a) && run.picks.some((x) => x.id === o.b)), '대립하는 사조 쌍이 들어 있다');
  assert.equal(run.insights.length, 3);
  for (const ins of run.insights) {
    assert.ok(ins.check.ok, `${ins.title}: ${ins.check.problems.join(' / ')}`);
    assert.equal(ins.check.families.length, 3, '아이덴티티 · 에어플레인 · 터널을 모두 지난다');
    assert.ok(ins.check.lenses.length >= 3);
  }
  assert.equal(run.usage.signals, 26);
  assert.equal(run.usage.used + run.usage.unused.length, run.usage.signals);
  // 지목한 노드의 신호는 강도가 오른다
  assert.ok(run.signals.find((s) => s.id === 'YELLOW-1').hinted);
});

test('결정성 — 같은 신호와 엣지는 언제나 같은 묶음을 낸다', async () => {
  const a = await think(sample(), createMock());
  const b = await think(sample(), createMock({ delay: 3 }));
  assert.deepEqual(a.clusters, b.clusters);
  assert.deepEqual(a.energy, b.energy);
  const shuffled = propagate([...a.signals].reverse(), [...a.edges].reverse(), { count: 3 });
  assert.deepEqual(shuffled.clusters.map((c) => c.members), a.clusters.map((c) => c.members));
});

test('전파 — 다른 노드군의 지지는 온전히, 같은 노드군의 지지는 절반만 센다', () => {
  const sig = (id, family) => ({ id, family, lens: id, issue: 'I1', strength: 0.5 });
  const base = [sig('A', 'identity'), sig('B', 'tunnel'), sig('C', 'identity')];
  const cross = energies(base, [{ from: 'B', to: 'A', type: 'cause', weight: 1 }]).get('A');
  const same = energies(base, [{ from: 'C', to: 'A', type: 'cause', weight: 1 }]).get('A');
  const alone = energies(base, []).get('A');
  assert.ok(cross > same && same > alone);
  // 긴장은 에너지를 주지 않는다
  assert.equal(energies(base, [{ from: 'B', to: 'A', type: 'tension', weight: 1 }]).get('A'), alone);
});

test('가드 — 한 노드군만 인용한 인사이트는 통과하지 못한다', async () => {
  const p = sample();
  const run = await think(p, createMock());
  const c = run.clusters[0];
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const oneFamily = c.members.filter((id) => sig.get(id).family === 'tunnel');
  const bad = { insight: '터널만 본 결론', chain: oneFamily.map((signal) => ({ signal, role: '전제', says: '…' })), substitute: { who: '누구', changes: '무엇' } };
  const check = checkInsight(bad, c, run.signals, p.settings);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((x) => x.includes('근거로 쓰지 않았다')));
  // 묶음에 없는 신호는 사슬에서 빠진다
  const foreign = checkInsight({ ...bad, chain: [{ signal: 'NOPE-9', role: '전제', says: '' }] }, c, run.signals, p.settings);
  assert.equal(foreign.foreign, 1);
  assert.equal(foreign.used.length, 0);
});

test('가드에 걸리면 이유를 붙여 한 번 다시 쓰고, 그래도 안 되면 표시해서 남긴다', async () => {
  const mock = createMock();
  let integrateCalls = 0;
  const lazy = { name: 'lazy', async json(a) {
    if (a.task.kind !== 'integrate') return mock.json(a);
    integrateCalls++;
    assert.ok(a.task.attempt === 0 || a.user.includes('다시 쓰는 이유'));
    return { json: { insight: '바로 앞 단계만 인용한 결론', chain: [{ signal: a.task.cluster.members[0], role: '전제', says: '' }], substitute: { changes: '' } } };
  } };
  const lazyP = sample(); lazyP.settings.arena = false;   // 묶음 통합의 검증만 본다
  const run = await think(lazyP, lazy);
  assert.equal(integrateCalls, 6, '묶음 3개 × 2번');
  assert.ok(run.insights.every((i) => !i.check.ok && i.check.problems.length));
});

test('사람의 개입 — 엣지를 고치면 발화 없이 전파·통합만 다시 돈다', async () => {
  const p = sample(); p.settings.arena = false;   // 묶음 통합의 검증만 본다
  p.run = await think(p, createMock());
  const before = p.run.clusters.map((c) => c.members.join());
  // 가장 강한 긴장을 끊고, 신호 하나를 끈다
  p.run.edges = p.run.edges.filter((e) => !(e.from === 'JP-1' && e.to === 'BENEFIT-2'));
  p.run.signals.find((s) => s.id === 'BRUTAL-1').muted = true;
  const kinds = [];
  const mock = createMock();
  const again = await think(p, { name: 'spy', json: (a) => { kinds.push(a.task.kind); return mock.json(a); } }, { mode: 'relink' });
  assert.ok(kinds.length > again.clusters.length && kinds.every((k) => ['integrate', 'direct', 'verdict', 'cross', 'screen', 'duel', 'attack', 'revise', 'plan', 'pull', 'creative', 'distinct', 'stance', 'hold', 'strategy'].includes(k)), '통합·판정·디렉션 호출만 있다');
  assert.equal(again.signals.length, 26);
  assert.ok(!again.clusters.some((c) => c.members.includes('BRUTAL-1')));
  assert.notDeepEqual(again.clusters.map((c) => c.members.join()), before);
});

test('이슈 추가 — 새 이슈에만 발화하고 사람이 고친 엣지는 지킨다', async () => {
  const p = sample();
  p.run = await think(p, createMock());
  p.run.edges.push({ id: 'H1', from: 'FROM-1', to: 'USAGE-1', type: 'cause', weight: 0.9, why: '사람이 이은 연결', by: 'human' });
  p.issues.push({ id: 'I4', title: '사서의 업무가 늘어난다', detail: '', test: '', root: false, tags: ['sv-ops'] });
  const run = await think(p, createMock(), { mode: 'add' });
  const fresh = run.signals.filter((s) => s.issue === 'I4');
  assert.equal(fresh.length, new Set(run.signals.map((s) => s.lens)).size, '노드마다 새 이슈에 신호 1건');
  assert.equal(run.signals.length, 26 + fresh.length);
  assert.equal(new Set(run.signals.map((s) => s.id)).size, run.signals.length, '신호 ID가 겹치지 않는다');
  assert.ok(run.edges.some((e) => e.by === 'human' && e.why === '사람이 이은 연결'));
});

test('예시가 아닌 프로젝트 — 목업 틀 문장으로도 구조가 선다', async () => {
  const p = newProject({ title: '테스트', brief: { what: '무엇', purpose: '목적', target: '타겟' }, category: 'planning', issues: [{ title: '근본 이슈', root: true, test: '질문', tags: ['pl-service'] }, { title: '이슈 둘', tags: ['ds-ui'] }] });
  const proposed = await proposeIssues(p, createMock());
  assert.ok(proposed.some((i) => i.root));
  p.run = await think(p, createMock());
  assert.ok(p.run.insights.length >= 1);
  assert.ok(p.run.signals.every((s) => s.claim.startsWith('[목업]')));
  const g = buildGraph(p);
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.equal(ids.size, g.nodes.length, '노드 ID가 겹치지 않는다');
  for (const l of g.links) assert.ok(ids.has(l.source) && ids.has(l.target), l.id);
  assert.equal(describe(p, p.run.signals[0].id).kind, 'signal');
});

test('이슈가 없으면 시작하지 않는다 · 노드 절반 넘게 실패하면 멈춘다', async () => {
  await assert.rejects(think(newProject({ title: 'x' }), createMock()), /이슈가 없습니다/);
  await assert.rejects(think(newProject({ title: 'x', issues: [{ title: '판정 질문 없는 근본 이슈', root: true, tags: ['pl-service'] }] }), createMock()), /세팅이 끝나지 않았습니다/);
  const mock = createMock();
  const flaky = { name: 'flaky', json: (a) => (a.task.kind === 'activate' ? Promise.reject(new Error('503')) : mock.json(a)) };
  await assert.rejects(think(sample(), flaky), /응답하지 못했습니다/);
});

test('프롬프트 — 모든 노드가 같은 원문을 받고, 연결·통합은 ID로 주고받는다', async () => {
  const p = sample();
  const a = activatePrompt(p, IDENTITY[1], 2);
  const b = activatePrompt(p, AIRPLANE[0], 2);
  for (const i of p.issues) { const t = JSON.stringify(i.title).slice(1, -1); assert.ok(a.user.includes(t)); assert.ok(b.user.includes(t)); }
  assert.equal(a.user.replace(IDENTITY[1].name, ''), b.user.replace(AIRPLANE[0].name, ''), '노드 이름만 빼면 같은 입력이다');
  assert.ok(b.system.includes('두고 올 것'));
  const run = await think(p, createMock());
  assert.ok(linkPrompt(p, run.signals, (x) => x).user.includes('"id": "JAMAIS-1"'));
  const c = run.clusters[0];
  const ip = integratePrompt(p, { ...c, signals: run.signals.filter((s) => c.members.includes(s.id)), edges: run.edges.filter((e) => c.edges.includes(e.id)) }, (x) => x, [], '');
  for (const id of c.members) assert.ok(ip.user.includes(`"id": "${id}"`));
});

test('JSON 읽기 — 코드펜스와 앞뒤 설명을 걷어낸다', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('결과입니다: {"a":{"b":2}} 끝'), { a: { b: 2 } });
  assert.throws(() => parseJSON('없음'));
});

test('보고서 — 결론이 먼저 나오고, 비율에는 건수가 함께 적힌다', async () => {
  const { reportMarkdown } = await import('../js/engine/report.js');
  const p = sample();
  p.run = await think(p, createMock());
  const md = reportMarkdown(p);
  assert.ok(md.indexOf('## 결론') < md.indexOf('## N1.'));
  const u = p.run.usage;
  assert.ok(md.includes(`판단 ${u.signals}건 중 ${u.used}건(${Math.round((u.used / u.signals) * 100)}%)`));
  assert.match(md, /노드군 사이 \d+건, \d+%/);
  assert.ok(!md.includes('undefined'));
});

test('뇌 형상 — 점 구름과 노드 자리가 형상 안에 있고 언제나 같다', async () => {
  const b = await import('../js/graph/brain.js');
  assert.ok(b.DOTS.length > 1500);
  assert.ok(b.DOTS.every((d) => b.inBrain(d.x, d.y)));
  assert.ok(b.DOTS.some((d) => d.front) && b.DOTS.some((d) => !d.front), '앞·뒤 반구 두 겹');
  const p = sample();
  const g = buildGraph(p);
  const seat = b.seats(g.nodes);
  for (const n of g.nodes.filter((x) => x.type === 'lens')) assert.ok(b.inCerebrum(seat.get(n.id).x, seat.get(n.id).y), `${n.id}가 대뇌 밖에 있다`);
  // 전두엽(아이덴티티)은 앞쪽, 두정·후두엽(에어플레인)은 뒤쪽, 측두엽(터널)은 아래
  const mean = (f, k) => { const s = g.nodes.filter((x) => x.type === 'lens' && x.family === f).map((x) => seat.get(x.id)[k]); return s.reduce((a, c) => a + c, 0) / s.length; };
  assert.ok(mean('identity', 'x') < b.CENTER.x && mean('airplane', 'x') > b.CENTER.x && mean('tunnel', 'y') > b.CENTER.y);
  assert.deepEqual([...b.seats(g.nodes)], [...seat]);
});

test('깊이 — 생각의 과정 없이 훑은 신호는 버린다', async () => {
  const mock = createMock();
  const skim = { name: 'skim', async json(a) {
    const r = await mock.json(a);
    if (a.task.kind === 'activate' && a.task.lens.family === 'airplane') r.json.signals.forEach((s) => { delete s.swap; });      // 바꿔치기 시험을 빼먹은 사조
    if (a.task.kind === 'activate' && a.task.lens.id === 'ID-FROM') r.json.signals.forEach((s) => { s.ladder = ['정의만 옮김']; }); // 한 줄짜리
    return r;
  } };
  const run = await think(sample(), skim);
  assert.ok(!run.signals.some((s) => s.family === 'airplane'), '원론·같은 구조·바꿔치기 시험이 없는 사조 신호는 들어오지 않는다');
  assert.ok(!run.signals.some((s) => s.lens === 'ID-FROM'));
  assert.ok(run.notes.some((n) => n.includes('근거 단계 없이')));
  for (const s of run.signals) assert.ok(s.ladder.length >= 3);
  // 걷어내기를 쓰지 않은 인사이트는 가드에 걸린다
  const c = run.clusters[0];
  const base = { insight: 'x', chain: c.members.map((signal) => ({ signal, role: '전제', says: '' })), substitute: { changes: '달라짐' }, tension: null };
  assert.ok(checkInsight(base, c, run.signals, sample().settings).problems.some((p) => p.includes('노드 없이 냈을 안')));
});

test('프롬프트 — 사조 노드는 카드 원문 전체와 방법론 규칙을 받는다', () => {
  const p = sample();
  const ism = AIRPLANE.find((a) => a.id === 'ISM-BRUTAL');
  const a = activatePrompt(p, ism, 1);
  assert.ok(a.system.includes(ism.card) && a.system.includes('규칙 1') && a.system.includes('바꿔치기 시험'));
  const b = activatePrompt(p, IDENTITY.find((l) => l.id === 'ID-JAMAIS'), 1);
  assert.ok(b.system.includes('익숙한 것을 처음 보는 것처럼 느끼는 것') && b.system.includes('ladder'));
});

test('세팅 — 같은 글이면 같은 태그가 추천되고, 틀을 채우지 않은 이슈는 발화에 들어가지 않는다', async () => {
  const T = await import('../knowledge/tags.js');
  const { validateProject, needsDevelopment } = await import('../js/graph/model.js');
  assert.equal(T.CATEGORIES.length, 7);
  for (const t of T.TAGS) assert.ok(T.categoryById(t.category) && t.keywords.length, t.id);
  for (const c of T.CATEGORIES) assert.ok(T.SEED_INPUT[c.id].filter((f) => f.required).length >= 2, `${c.name} 필수 인풋`);
  const text = '토스 미니앱 결과 화면의 UI를 다시 만들고 공유로 재방문을 늘린다';
  const a = T.recommendTags(text); const b = T.recommendTags(text);
  assert.deepEqual(a, b);
  assert.ok(a.some((r) => r.id === 'ds-ui') && a.some((r) => r.id === 'dv-platform') && a.every((r) => r.because.length));
  assert.deepEqual(T.recommendTags(''), []);

  const p = newProject({ title: 't', category: 'design', brief: { what: 'a', purpose: 'b', target: 'c' }, seed: { design: { deliverable: '3화면', moment: '결과 화면' } },
    issues: [{ title: '결과 화면의 UI가 납득을 주지 못한다', root: true, test: '응답을 가리키며 말할 수 있는가' }, { title: '글에서 아무것도 못 찾는 이슈' }, { title: '' }] });
  const v = validateProject(p);
  assert.equal(v.ready.length, 1);
  assert.ok(v.ready[0].autoTags && v.ready[0].tags.includes('ds-ui'), '태그가 비면 추천을 붙인다');
  assert.equal(v.problems.length, 2);
  assert.equal(needsDevelopment(p, v.ready), false);
  const run = await think(p, createMock());
  assert.deepEqual(run.setup.skipped, ['I2', 'I3']);
  assert.ok(run.signals.every((s) => s.issue === 'I1'));
  assert.ok(validateProject(newProject({ title: 'x' })).problems.some((x) => x.where === '분류'));
});

test('통합 디렉션 — 관점마다 방향·할 일·근거가 있고, 개발은 필요할 때만 들어간다', async () => {
  const { checkDirection } = await import('../js/engine/think.js');
  const p = sample();
  const run = await think(p, createMock());
  const d = run.direction;
  assert.ok(d.check.ok, d.check.problems.join(' / '));
  assert.deepEqual(Object.keys(d.perspectives), ['planning', 'design', 'service']);
  assert.ok(d.developmentReason && !d.needDev);
  for (const v of Object.values(d.perspectives)) assert.ok(v.direction && v.actions.length && v.from.length);
  assert.ok(d.priority.length >= 2 && d.conflicts.length === 1);
  // 개발 태그가 붙으면 개발 관점이 필수가 된다
  const ins = run.insights;
  const noDev = { headline: 'h', perspectives: { planning: { direction: 'd', actions: ['a'], from: ['N1'] }, design: { direction: 'd', actions: ['a'], from: ['N1'] }, service: { direction: 'd', actions: ['a'], from: ['N1'] } }, development_reason: '필요 없음', priority: [{ what: 'x', owner: 'planning', from: 'N1' }, { what: 'y', owner: 'design', from: 'N1' }] };
  assert.ok(checkDirection(noDev, ins, false).ok);
  assert.ok(checkDirection(noDev, ins, true).problems.some((x) => x.includes('개발')));
  // 근거 없는 디렉션은 받지 않는다
  const bare = JSON.parse(JSON.stringify(noDev)); bare.perspectives.design.from = ['N9'];
  assert.ok(checkDirection(bare, ins, false).problems.some((x) => x.includes('디자인')));
  assert.deepEqual(checkDirection(noDev, ins, false).direction.unusedInsights, ['N2', 'N3']);
});

test('기본안 대조 — 브레인 없이 낸 안을 먼저 받고, 통합 인사이트마다 같은 해법인지 따로 판정한다', async () => {
  const { checkDirection } = await import('../js/engine/think.js');
  const p = sample();
  const kinds = [];
  const mock = createMock();
  const spy = { ...mock, json: (a) => { kinds.push(a.task.kind); return mock.json(a); } };
  const run = await think(p, spy);
  assert.equal(kinds[0], 'baseline', '기본안을 가장 먼저 받는다');
  assert.equal(run.baseline.concepts.length, 3);
  assert.deepEqual(run.baseline.concepts.map((c) => c.id), ['B1', 'B2', 'B3']);
  assert.ok(run.insights.every((i) => ['B1', 'B2', 'B3'].includes(i.without.nearest)), '인사이트마다 가장 가까운 기본안을 적는다');
  assert.equal(run.direction.overlap.length, run.insights.length);
  assert.ok(run.direction.overlap.every((o) => ['같음', '일부', '다름'].includes(o.verdict)));
  // 판정이 빠진 인사이트가 있으면 디렉션을 받지 않는다
  const raw = { headline: 'h', perspectives: { planning: { direction: 'd', actions: ['a'], from: ['N1'] }, design: { direction: 'd', actions: ['a'], from: ['N1'] }, service: { direction: 'd', actions: ['a'], from: ['N1'] } }, development_reason: '필요 없음', priority: [{ what: 'x', owner: 'planning', from: 'N1' }, { what: 'y', owner: 'design', from: 'N1' }], overlap: [{ insight: 'N1', baseline: 'B1', verdict: '같음', why: 'w' }] };
  assert.ok(checkDirection(raw, run.insights, false, run.baseline).problems.some((x) => x.includes('기본안')));
  // 다시 묶기는 기본안을 새로 받지 않고 이전 것을 쓴다
  kinds.length = 0;
  p.run = run;
  const again = await think(p, spy, { mode: 'relink' });
  assert.ok(!kinds.includes('baseline'));
  assert.deepEqual(again.baseline, run.baseline);
});

test('사조 — 가져올 것/두고 올 것 대신 시대 · 갈래 · 모순 · 읽기 · 층과 세기로 받는다', async () => {
  const { ISM_DEPTH, LAYERS, depthBlock } = await import('../knowledge/ism-depth.js');
  const { activatePrompt } = await import('../knowledge/prompts.js');
  const { AIRPLANE } = await import('../knowledge/nodes.js');
  assert.equal(Object.keys(ISM_DEPTH).length, 16);
  for (const a of AIRPLANE) { const d = ISM_DEPTH[a.id]; assert.ok(d && d.era && d.question && d.paradox && d.strands.length >= 2, a.id); }
  const p = sample();
  const pr = activatePrompt(p, AIRPLANE.find((a) => a.id === 'ISM-SWISS'), 1);
  assert.ok(pr.system.includes(depthBlock('ISM-SWISS')), '사조의 깊이 자료가 프롬프트에 들어간다');
  for (const k of ['"strand"', '"paradox"', '"reading"', '"layer"', '"degree"']) assert.ok(pr.system.includes(k), k);
  assert.ok(!pr.system.includes('"leave"') && !pr.system.includes('"treatment"'), '두고 올 것 · 다루는 방식 칸은 없다');
  const run = await think(p, createMock());
  const ism = run.signals.filter((s) => s.family === 'airplane');
  assert.ok(ism.length && ism.every((s) => LAYERS.includes(s.layer) && s.degree >= 0 && s.degree <= 1));
});

test('더프롬 판정 — 관점이 모든 호출에 들어가고, 점수 없이 판정문 · 수준 · 보류로 답한다', async () => {
  const { shapeVerdict } = await import('../js/engine/think.js');
  const { viewpointBlock, WEIGHTS } = await import('../knowledge/viewpoint.js');
  const { DIFFERENTIATION, EFFECTIVENESS, criteriaBlock } = await import('../knowledge/criteria.js');
  const { baselinePrompt, verdictPrompt } = await import('../knowledge/prompts.js');
  const p = sample();
  const systems = [];
  const mock = createMock();
  const spy = { ...mock, json: (a) => { systems.push([a.task.kind, a.system]); return mock.json(a); } };
  const run = await think(p, spy, { precedents: [{ id: 'PR-X', verdict: '기각', what: '테스트용 사례', why: '이유' }] });
  for (const [kind, sys] of systems) {
    if (kind === 'baseline') assert.ok(!sys.includes('더프롬의 눈으로'), '기본안은 더프롬의 관점 없이 낸다');
    else assert.ok(sys.startsWith('## 관점 — 더프롬의 눈으로 본다') && sys.includes('테스트용 사례'), `${kind} 호출에 관점과 판정 사례가 들어간다`);
  }
  assert.ok(!baselinePrompt(p).system.includes('자메뷰'));
  assert.ok(viewpointBlock([], WEIGHTS).indexOf('자메뷰') < viewpointBlock([], WEIGHTS).indexOf('노랑'), '무거운 기준이 먼저 나온다');
  // 두 기준의 정의가 판정과 대결에 들어간다 — 다름이 곧 차별화가 아니고, 실효성은 통과가 아니라 초과달성의 정도다
  assert.ok(criteriaBlock().includes('다르다는 것만으로는 차별화가 아니다') && criteriaBlock().includes('본래 목적을 얼마나 넘어설 수 있는지'));
  assert.ok(systems.filter(([k]) => k === 'verdict' || k === 'duel').every(([, sys]) => sys.includes('## 결과를 판단하는 두 기준')));
  assert.ok(!verdictPrompt(p, run.insights, []).system.includes('1~5점'), '점수를 요구하지 않는다');
  // 판정의 모양 — 점수가 없다
  assert.equal(run.verdict.items.length, run.insights.length);
  for (const i of run.insights) {
    assert.ok(i.from && ['채택', '보완', '기각', '보류'].includes(i.from.verdict));
    assert.equal(i.from.score, undefined);
    assert.ok(DIFFERENTIATION.levels.includes(i.from.differentiation.level) && EFFECTIVENESS.levels.includes(i.from.effectiveness.level));
    assert.ok(i.from.checks.length === 6 && i.from.checks.some((c) => c.item === '성공 기준') && i.from.checks.every((c) => ['통과', '미달', '확인 필요'].includes(c.result)));
  }
  // 답하지 못한 물음은 빈칸으로 남고 보류로 센다. 모르는 수준 · 판정은 보류가 된다
  const raw = { verdicts: [{ insight: run.insights[0].id, differentiation: { level: '아주 좋음', against: 'x' }, effectiveness: { level: '목적 달성', purpose: 'y' }, verdict: '훌륭함', held: ['시안이 필요하다'] }] };
  const v = shapeVerdict(raw, run.insights).items[0];
  assert.equal(v.differentiation.level, ''); assert.equal(v.verdict, '보류'); assert.equal(v.effectiveness.confidence, '추정');
  assert.equal(v.blank.length, DIFFERENTIATION.questions.length - 1 + EFFECTIVENESS.questions.length - 1);
  assert.deepEqual(v.held, ['시안이 필요하다']);
});

test('팩트북 — 출처 조건, 터널 추정 표시, AI 조사 거르기, md 왕복', async () => {
  const { factProblem, validFacts, acceptResearch, factsToMarkdown, parseFactbook } = await import('../knowledge/facts.js');
  const { researchFacts } = await import('../js/engine/think.js');
  const ok = { id: 'F1', kind: 'stat', text: '사실', sourceType: 'stat', source: '통계청', date: '2026-01', url: 'https://example.go.kr/a', by: 'ai', checked: false };
  assert.equal(factProblem(ok), '');
  assert.ok(factProblem({ ...ok, url: '' }).includes('주소'));
  assert.ok(factProblem({ ...ok, date: '' }).includes('날짜'));
  assert.ok(factProblem({ ...ok, sourceType: 'blog' }).includes('출처 유형'));
  assert.ok(factProblem({ ...ok, sourceType: 'internal' }).includes('내부 자료'), 'AI는 내부 자료를 만들 수 없다');
  assert.equal(factProblem({ ...ok, by: 'human', sourceType: 'internal', url: '', date: '' }), '', '직접 입력은 내부 자료를 쓸 수 있다');
  // 팩트가 없으면 터널 판단은 모두 추정이고 비중이 낮다
  const bare = sample(); bare.facts = [];
  const r0 = await think(bare, createMock());
  assert.equal(r0.usage.tunnel.assumed, r0.usage.tunnel.signals);
  assert.ok(r0.notes.some((n) => n.includes('팩트북이 비어')));
  // 팩트가 있으면 근거가 붙고 추정이 준다
  const p = sample();
  const r1 = await think(p, createMock());
  assert.ok(r1.usage.tunnel.backed > 0 && r1.usage.tunnel.assumed < r0.usage.tunnel.assumed);
  assert.ok(r1.signals.filter((s) => s.facts).every((s) => s.source === '팩트' && s.facts.every((id) => ['F1', 'F2'].includes(id))));
  const a0 = r0.signals.find((s) => s.family === 'tunnel' && s.assumed); const a1 = r1.signals.find((s) => s.id === a0.id);
  if (a1 && !a1.assumed) assert.ok(a1.strength > a0.strength, '팩트가 붙은 터널 판단이 더 무겁다');
  assert.ok(r1.insights.some((i) => i.facts.length), '인사이트에 근거 팩트가 모인다');
  // AI 조사 — 받는 출처 · 주소 · 날짜가 없으면 거른다
  const raw = { facts: [
    { kind: 'stat', text: '통과', sourceType: 'stat', source: '통계청', date: '2026-02', url: 'https://kosis.kr/x', quote: '구절' },
    { kind: 'trend', text: '기사', sourceType: 'news', source: '어느 신문', date: '2026-02', url: 'https://news.example.com/x' },
    { kind: 'notice', text: '주소 없음', sourceType: 'press', source: '회사', date: '2026-02', url: '' },
    { kind: 'stat', text: '통과', sourceType: 'stat', source: '통계청', date: '2026-02', url: 'https://kosis.kr/x' },
  ], missing: ['공시를 찾지 못함'] };
  const got = acceptResearch(raw, { facts: [ok] });
  assert.equal(got.facts.length, 1); assert.equal(got.facts[0].id, 'F2'); assert.equal(got.facts[0].checked, false);
  assert.equal(got.rejected.length, 3); assert.deepEqual(got.missing, ['공시를 찾지 못함']);
  await assert.rejects(() => researchFacts(p, createMock()), /웹 조사/);
  const viaProvider = await researchFacts({ ...p, facts: [] }, { research: async () => ({ json: raw }) });
  assert.equal(viaProvider.facts.length, 1);
  // md 왕복
  const proj = { title: '테스트', facts: [ok, { ...got.facts[0] }, { id: 'F9', kind: 'habit', text: '직접 넣은 것', sourceType: 'internal', source: '브리프', date: '', url: '', by: 'human', checked: true }] };
  const md = factsToMarkdown(proj);
  const back = parseFactbook(md);
  assert.equal(back.length, 3);
  assert.deepEqual(back.map((f) => [f.id, f.kind, f.sourceType, f.source, f.url, f.by, f.checked]).sort(), proj.facts.map((f) => [f.id, f.kind, f.sourceType, f.source, f.url, f.by, f.checked]).sort());
  assert.equal(validFacts({ facts: back }).facts.length, 3);
});

test('경쟁 — 후보를 모아 기본안과 같은 안을 떨어뜨리고, 1:1 대결로 고른 뒤 공격 · 보완한다', async () => {
  const { roundRobin, standings, crossPairs } = await import('../js/engine/arena.js');
  const p = sample();
  const kinds = [];
  const mock = createMock();
  const run = await think(p, { ...mock, json: (a) => { kinds.push(a.task.kind); return mock.json(a); } });
  const a = run.arena; const c = a.counts;
  assert.equal(kinds[1], 'reframe', '기본안 다음에 문제를 다시 정의한다');
  assert.equal(run.frames.length, 3);
  assert.equal(c.candidates, c.node + c.cluster + c.cross);
  assert.ok(c.node >= 10 && c.cluster === 3 && c.cross >= 1, JSON.stringify(c));
  assert.ok(run.proposals.every((x) => ['R0', 'R1', 'R2', 'R3'].includes(x.frame)));
  // 떨어뜨리는 것은 사유가 있을 때뿐이다 — 점수가 없다
  assert.ok(a.candidates.every((x) => x.score === undefined));
  for (const k of a.candidates.filter((x) => x.screen?.verdict === '같음')) { assert.equal(k.swiss, null); assert.ok(k.status.includes('기본안')); }
  // 남은 후보는 조별로 겨루고, 결선은 두 번 판정한다
  assert.equal(c.finalists, 6);
  assert.equal(a.duels.filter((d) => d.stage === '결선').length, 15);
  assert.equal(kinds.filter((k) => k === 'duel').length, 6 + 3 + 3 + 1, '조별 3회전 + 결선 + 결선 다시 + 재대결');
  assert.ok(a.candidates.filter((x) => x.seat).length === 6 && a.candidates.some((x) => x.seat === '다른 안'), '결선에는 기본안과 다른 안의 자리가 있다');
  // 최종안은 서로 다른 해법이다
  assert.equal(run.insights.length, p.settings.insightCount);
  assert.equal(new Set(run.insights.map((i) => i.family)).size, run.insights.length);
  assert.ok(run.insights.every((i) => i.check.ok && i.candidate && i.attacks.length && i.check.used.length && i.seat));
  assert.equal(kinds.filter((k) => k === 'attack').length, 3); assert.equal(kinds.filter((k) => k === 'revise').length, 3);
  // 결선 자리 — 승수 상위만으로 채우지 않는다. 같은 해법은 2개까지
  const { pickSeats, swissPairs } = await import('../js/engine/arena.js');
  const L = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `K${n}`, origin: { frame: n === 7 ? 'R2' : 'R0' }, screen: { verdict: n === 7 ? '다름' : '일부', family: n <= 3 ? 'same' : `f${n}` } }));
  const seats = pickSeats(L, { K1: 3, K2: 3, K3: 3, K4: 2, K5: 1, K6: 1, K7: 0 }, { K6: 2 }, [{ winner: 'K5', a: 'K5', b: 'K1' }], 6);
  assert.deepEqual(seats.map((x) => `${x.c.id}:${x.seat}`), ['K1:상위', 'K2:상위', 'K4:상위', 'K7:다른 안', 'K6:뚜렷한 안', 'K5:상위를 이긴 안']);
  // 판정이 갈리면 무승부다
  assert.deepEqual(standings(['K1', 'K2'], [{ a: 'K1', b: 'K2', split: true }], {}).map((x) => x.wins), [0.5, 0.5]);
  const sp = swissPairs(['K1', 'K2', 'K3', 'K4'], { K1: 1, K2: 1, K3: 0, K4: 0 }, new Set(['K1|K2']), 1);
  assert.ok(sp.length === 2 && sp.every((x) => [x.a, x.b].sort().join('|') !== 'K1|K2'), '이미 만난 짝은 피한다');
  // 대진과 순위는 계산이다 — 같은 입력이면 같다
  assert.deepEqual(roundRobin(['K1', 'K2', 'K3', 'K4']), roundRobin(['K1', 'K2', 'K3', 'K4']));
  assert.equal(roundRobin(['K1', 'K2', 'K3', 'K4']).length, 6);
  const t = standings(['K1', 'K2', 'K3'], [{ winner: 'K2' }, { winner: 'K2' }, { winner: 'K3' }], { K1: 90, K2: 10, K3: 50 });
  assert.deepEqual(t.map((x) => x.id), ['K2', 'K3', 'K1'], '채점 점수보다 승수가 먼저다');
  assert.ok(crossPairs(run, 5).every((x) => x.a.lens !== x.b.lens));
  // 경쟁을 끄면 예전처럼 묶음 통합안이 그대로 나온다
  const q = sample(); q.settings.arena = false;
  const plain = await think(q, createMock());
  assert.ok(!plain.arena && plain.insights.length === 3 && plain.frames.length === 0);
});

test('사조 선정 — 사람이 고르지 않는다. 모두 대 보고, 걸리는 것 중에서 뚜렷한 것과 일부러 넣는 하나를 고른다', async () => {
  const { selectByProbe } = await import('../js/engine/think.js');
  const { routePrompt } = await import('../knowledge/prompts.js');
  const { AIRPLANE, OPPOSITIONS } = await import('../knowledge/nodes.js');
  const probes = [{ id: 'A', hit: 'a', pressure: 0.9 }, { id: 'B', hit: '', pressure: 0.95 }, { id: 'C', hit: 'c', pressure: 0.7 }, { id: 'D', hit: 'd', pressure: 0.5 }, { id: 'E', hit: 'e', pressure: 0.2 }];
  const got = selectByProbe(probes, 3);
  assert.deepEqual(got.map((x) => x.id), ['A', 'C', 'E'], '걸리는 자리가 없는 B는 압력이 높아도 빠지고, 가장 약한 E가 일부러 들어간다');
  assert.ok(got[2].wild && !got[0].wild);
  assert.deepEqual(selectByProbe(probes.slice(0, 3), 4).map((x) => x.id), ['A', 'C'], '걸리는 것이 모자라면 억지로 채우지 않는다');
  const pr = routePrompt(sample(), AIRPLANE, OPPOSITIONS, 4);
  assert.ok(pr.system.includes('미리 고르지 않는다') && pr.system.includes('"probes"') && !pr.system.includes('"picks"'));
  // 예시가 아닌 프로젝트 — 목업이 모든 사조를 대 본 결과를 낸다
  const p = newProject({ title: '다른 과제', category: 'design', brief: { what: 'w', purpose: 'p', target: 't' }, seed: { design: { scope: 's', moment: 'm' } }, issues: [{ id: 'I1', root: true, title: '무엇이 바뀌나', test: '바뀌는가?', tags: ['ds-ui'] }] });
  const run = await think(p, createMock());
  assert.equal(run.probes.length, 16);
  assert.ok(run.picks.length >= 2 && run.picks.every((x) => x.why));
  assert.ok(run.picks.filter((x) => x.wild).length <= 1);
});

test('프레임 — 이긴 안을 기획 틀과 디자인 틀로 정리한다. 근거 없는 칸은 비우고, 노하우북은 조형 문제가 부른 장만 쓴다', async () => {
  const { shapePlan, shapeCreative, needsCreative } = await import('../js/engine/frames.js');
  const { KNOWHOW, knowhowById } = await import('../knowledge/knowhow.js');
  const { planPrompt, creativePrompt } = await import('../knowledge/prompts-frames.js');
  assert.equal(KNOWHOW.length, 16);
  assert.ok(KNOWHOW.every((k) => k.text.startsWith('## B-') && k.name) && knowhowById('KH-B4').name === '대비');
  const p = sample();
  const kinds = [];
  const mock = createMock();
  const run = await think(p, { ...mock, json: (a) => { kinds.push(a.task.kind); return mock.json(a); } });
  // 순서 — 경쟁과 판정이 끝난 뒤에 틀로 정리한다
  assert.ok(kinds.indexOf('plan') > kinds.lastIndexOf('duel') && kinds.indexOf('plan') > kinds.indexOf('verdict'));
  assert.ok(kinds.indexOf('pull') < kinds.indexOf('creative'));
  assert.ok(run.plan.check.ok && run.plan.theme.theme && run.plan.confirmed === false);
  for (const slot of [run.plan.jtbd, run.plan.positioning, run.plan.claim, run.plan.theme]) assert.ok(slot.from.length, '칸마다 근거 id가 있다');
  assert.ok(run.creative.pod.filter((x) => x.core).length === 1 && run.creative.chapters.length <= 5);
  assert.ok(run.creative.knowhow.every((k) => k.operation && k.from && k.to), '무엇을 어떻게 바꾸는지 쓰지 못한 노하우는 뺀다');
  assert.ok(run.creative.check.problems.some((x) => x.includes('노하우')));
  // 프롬프트 — 틀은 새로 추론하지 않고, 노하우북은 원문으로 들어간다
  assert.ok(planPrompt(p, run).system.includes('새로 추론하지 않는다'));
  assert.ok(creativePrompt(p, run, run.plan, [], [knowhowById('KH-B4')]).user.includes(knowhowById('KH-B4').text));
  // 근거 없는 칸은 비운다
  const ok = new Set(['N1', 'B1']);
  const bad = shapePlan({ jtbd: { situation: 's', motivation: 'm', outcome: 'o', from: ['없는 id'] }, positioning: { place: 'p', from: ['B1'] }, ksf: [{ factor: 'k', from: ['N1'] }], claim: { claim: 'c', rtb: [], from: ['N1'] }, theme: { theme: 't', from: ['N1'] }, baseline_same: true }, ok);
  assert.ok(!bad.ok && bad.plan.jtbd.from.length === 0);
  for (const word of ['JTBD 칸에 근거가 없다', '경쟁 구도', 'KSF', 'RTB', '기본안과 같다']) assert.ok(bad.problems.some((x) => x.includes(word)), word);
  const cr = shapeCreative({ for: { frame: 'f', from: ['N1'] }, pod: [{ point: 'a', from: ['N1'] }, { point: 'b', from: ['N1'] }], direction: 'd', knowhow: [{ chapter: 'KH-B4', operation: 'CON-TYPE', from: 'x', to: 'y' }, { chapter: 'KH-B9', operation: 'o', from: 'x', to: 'y' }] }, ok, [knowhowById('KH-B4')]);
  assert.equal(cr.creative.pod.filter((x) => x.core).length, 1); assert.equal(cr.creative.knowhow.length, 1, '부르지 않은 장의 노하우는 받지 않는다');
  // 기획 과제는 Concept Theme에서 멈춘다
  const q = sample(); q.category = 'planning'; q.seed = { planning: {} }; q.issues.forEach((i) => { i.tags = ['pl-journey']; });
  assert.equal(needsCreative(q), false);
  const r2 = await think(q, createMock());
  assert.ok(r2.plan && r2.creative === null);
});

test('성공 기준 — 미달이면 실효성은 목적 미달을 넘지 못하고 채택하지 않는다', async () => {
  const { shapeVerdict } = await import('../js/engine/think.js');
  const { EFFECTIVENESS, CHECKS, criteriaBlock } = await import('../knowledge/criteria.js');
  const { verdictPrompt, issuesPrompt } = await import('../knowledge/prompts.js');
  const { duelPrompt, attackPrompt, reframePrompt } = await import('../knowledge/prompts-arena.js');
  assert.ok(CHECKS.includes('성공 기준') && EFFECTIVENESS.questions.some((q) => q.id === 'success'));
  assert.ok(criteriaBlock().includes('성공 기준을 먼저 본다'));
  const p = sample(); p.brief.success = '한 달에 한 번 이상 방문하는 사람이 늘어난다';
  const ins = [{ id: 'N1' }, { id: 'N2' }];
  const mk = (id, result, level, verdict) => ({ insight: id, checks: [{ item: '성공 기준', result, why: 'x' }], differentiation: { level: '차별화됨' }, effectiveness: { level, confidence: '추정' }, verdict });
  const out = shapeVerdict({ verdicts: [mk('N1', '미달', '목적 초과', '채택'), mk('N2', '통과', '목적 초과', '채택')] }, ins, p).items;
  assert.equal(out[0].effectiveness.level, '목적 미달'); assert.equal(out[0].verdict, '보완'); assert.equal(out[0].capped, true);
  assert.equal(out[1].effectiveness.level, '목적 초과'); assert.equal(out[1].verdict, '채택'); assert.equal(out[1].capped, false);
  // 차별화 수준은 건드리지 않는다
  assert.equal(out[0].differentiation.level, '차별화됨');
  // 성공 기준이 브리프에 없으면 그 물음은 빈칸으로 세지 않는다
  const q = sample(); const blankQ = shapeVerdict({ verdicts: [mk('N1', '확인 필요', '목적 달성', '보류')] }, ins, q).items[0].blank;
  assert.ok(!blankQ.includes('실효성 · success'));
  assert.ok(shapeVerdict({ verdicts: [mk('N1', '확인 필요', '목적 달성', '보류')] }, ins, p).items[0].blank.includes('실효성 · success'));
  // 프롬프트 — 미션에 성공 기준이 들어가고, 판정 · 대결 · 공격 · 문제 정의 · 근본 이슈가 성공 기준을 묻는다
  assert.ok(verdictPrompt(p, [], []).user.includes('한 달에 한 번 이상 방문하는 사람이 늘어난다'));
  assert.ok(verdictPrompt(p, [], []).system.includes('"성공 기준" 점검'));
  assert.ok(duelPrompt(p, []).system.includes('성공 기준을 먼저 본다'));
  assert.ok(attackPrompt(p, { id: 'K1' }, null).system.includes('- 성공 기준:'));
  assert.ok(reframePrompt(p, null).system.includes('`gap`') && reframePrompt(p, null).system.includes('`success`를 true'));
  assert.ok(issuesPrompt(p).system.includes('`misses`'));
});

test('같은 해법 재확인 — 결선 통과안은 서로 다른 묶음에서 하나씩, 모자라면 예비에서 채우고 그래도 없으면 비워 둔다', async () => {
  const p = sample(); p.brief.success = '한 달에 한 번 이상 방문하는 사람이 늘어난다';
  const mock = createMock();
  // 결선에 오른 안을 전부 한 묶음으로 답하게 한다 — 예비 안은 각자 다른 묶음
  let seen = null;
  const one = { ...mock, json: async (a) => {
    if (a.task.kind !== 'distinct') return mock.json(a);
    seen = a; const ids = a.task.candidates.map((c) => c.id); const fin = ids.slice(0, 6); const rest = ids.slice(6);
    return { json: { groups: [{ name: '한 가지 해법', ids: fin, why: '같은 행동' }, ...rest.map((id) => ({ name: `다른 해법 ${id}`, ids: [id], why: '' }))] }, usage: null };
  } };
  const run = await think(p, one);
  assert.equal(seen.role, 'judge');
  assert.ok(seen.system.includes('같은 해법 묶기'));
  const fams = run.insights.map((n) => n.family);
  assert.equal(new Set(fams).size, fams.length, '최종안의 해법 묶음이 모두 다르다');
  assert.equal(fams.filter((f) => f === '한 가지 해법').length, 1);
  assert.equal(run.arena.counts.groups, 1);
  assert.equal(run.arena.counts.merged, 5);
  assert.equal(run.arena.counts.reserve, run.insights.length - 1);
  assert.ok(run.insights.slice(1).every((n) => n.seat === '예비 — 다른 해법'));
  // 예비도 없으면 같은 해법으로 채우지 않고 줄여서 낸다
  const all = { ...mock, json: async (a) => (a.task.kind === 'distinct' ? { json: { groups: [{ name: '한 가지 해법', ids: a.task.candidates.map((c) => c.id), why: '같은 행동' }] }, usage: null } : mock.json(a)) };
  const run2 = await think(sample(), all);
  assert.equal(run2.insights.length, 1);
  assert.ok(run2.notes.some((n) => n.includes('서로 다른 해법이 1개뿐')));
  assert.ok(run2.direction && run2.plan, '인사이트가 줄어도 뒤 단계가 돈다');
});

test('범위 확인 — 성공 기준을 겨눈 문제 정의가 없으면 한 번 다시 받고, 판단하는 호출은 judge 역할로 나간다', async () => {
  const { pickSeats } = await import('../js/engine/arena.js');
  const p = sample(); p.brief.success = '한 달에 한 번 이상 방문하는 사람이 늘어난다';
  const mock = createMock(); const roles = {}; let reframes = 0;
  const spy = { ...mock, json: async (a) => {
    (roles[a.task.kind] ||= new Set()).add(a.role);
    if (a.task.kind === 'reframe') { reframes++; const r = await mock.json(a); if (reframes === 1) { r.json.gap = '재방문은 다루지 않는다'; for (const f of r.json.frames) f.success = false; } return r; }
    return mock.json(a);
  } };
  const run = await think(p, spy);
  assert.equal(reframes, 2, '성공 기준을 겨눈 정의가 없어 한 번 다시 받았다');
  assert.ok(run.scope.success && run.frames.some((f) => f.success));
  for (const k of ['route', 'screen', 'duel', 'distinct', 'attack', 'verdict']) assert.deepEqual([...roles[k]], ['judge'], `${k}는 판단 호출이다`);
  for (const k of ['baseline', 'reframe', 'activate', 'cross', 'revise', 'direct', 'plan']) assert.ok(!roles[k].has('judge'), `${k}는 만드는 호출이다`);
  // 성공 기준이 없는 브리프는 다시 받지 않는다
  reframes = 0; await think(sample(), spy); assert.equal(reframes, 1);
  // 결선 자리 — 상위에 성공 기준에 직접 닿는 안이 없으면 닿는 안을 하나 올린다
  const mk = (id, success, family) => ({ id, origin: { frame: 'R0' }, screen: { verdict: '일부', family, success } });
  const live = [mk('K1', '간접', 'a'), mk('K2', '없음', 'b'), mk('K3', '간접', 'c'), mk('K4', '없음', 'd'), mk('K5', '직접', 'e'), mk('K6', '없음', 'f'), mk('K7', '없음', 'g')];
  const wins = { K1: 3, K2: 3, K3: 2, K4: 2, K5: 0, K6: 1, K7: 1 };
  const seats = pickSeats(live, wins, {}, [], 4);
  assert.ok(seats.some((x) => x.c.id === 'K5' && x.seat === '성공 기준에 닿는 안'));
  const live2 = live.map((c) => (c.id === 'K1' ? mk('K1', '직접', 'a') : c));
  assert.ok(!pickSeats(live2, wins, {}, [], 4).some((x) => x.seat === '성공 기준에 닿는 안'));
});

test('기조 — 공격 전에 기조를 세우고, 보완은 기조를 지킨 채 고침 · 대가 · 받지 않음으로 답한다', async () => {
  const { revisePrompt, stancePrompt, holdPrompt, attackPrompt, duelPrompt } = await import('../knowledge/prompts-arena.js');
  const st = { bet: '같은 틀에 건다', device: '네 칸 틀', givesUp: '화려함' };
  const rp = revisePrompt(sample(), { id: 'K1' }, { attacks: [], keep: '' }, null, [{ title: '다른 안', concept: '달력에 넣는다', bet: '고객이 정한 알림에 건다', device: '달력 일정' }], st);
  assert.ok(rp.user.includes('## 이 안의 기조 (지킨다)') && rp.user.includes('같은 틀에 건다') && rp.user.includes('## 다른 최종안'));
  assert.ok(rp.system.includes('"고침"') && rp.system.includes('"대가"') && rp.system.includes('"받지 않음"') && rp.system.includes('전부 고치려 하지 않는다'));
  assert.ok(!revisePrompt(sample(), { id: 'K1' }, { attacks: [], keep: '' }, null).user.includes('## 다른 최종안'));
  assert.ok(stancePrompt(sample(), []).system.includes('gives_up') && holdPrompt(sample(), []).system.includes('버림'));
  assert.ok(attackPrompt(sample(), { id: 'K1' }, null, st).user.includes('## 이 안의 기조'));
  assert.ok(duelPrompt(sample(), [], 'rematch').system.includes('고치기 전 안이 이긴다') && !duelPrompt(sample(), [], 'final').system.includes('고치기 전 안이 이긴다'));

  const mock = createMock(); const order = []; const seen = []; const notes = [];
  // 고친 안이 고치기 전 안을 이기게 한다. 기조 확인에서 2위 안은 두 번 다 "버림", 3위 안은 첫 번째에만 1위와 같은 묶음으로 답한다
  const p = { ...mock, json: async (a) => {
    if (['stance', 'attack', 'revise', 'hold'].includes(a.task.kind) && order.at(-1) !== a.task.kind) order.push(a.task.kind);
    if (a.task.kind === 'revise') { seen.push(a.task.others.length); if (a.task.again) notes.push(a.user); const r = await mock.json(a); r.json.concept = `${r.json.concept} (${a.task.again ? '다시 고침' : '고침'})`; return r; }
    if (a.task.kind === 'duel' && a.task.tag === 'rematch') return { json: { duels: a.task.pairs.map((x) => ({ pair: x.id, winner: x.a.id.endsWith('r') ? x.a.id : x.b.id, why: '고친 안이 낫다' })) }, usage: null };
    if (a.task.kind === 'hold') { const ids = a.task.items.map((x) => x.id); const first = a.task.pass === 0;
      return { json: { checks: ids.map((id, i) => ({ id, kept: i === 1 ? '버림' : '지킴', why: i === 1 ? '달력 안이 됐다' : '' })), groups: first ? [{ name: '같아진 해법', ids: [ids[0], ids[2]], why: '같은 장치' }, { name: '다른 해법', ids: [ids[1]], why: '' }] : ids.map((id) => ({ name: id, ids: [id], why: '' })) }, usage: null }; }
    return mock.json(a);
  } };
  const run = await think(sample(), p);
  assert.deepEqual(order, ['stance', 'attack', 'revise', 'hold', 'revise', 'hold'], '기조 → 공격 → 보완 → 기조 확인 → 다시 보완 → 다시 확인');
  assert.deepEqual(seen, [2, 2, 2, 2, 2], '보완마다 다른 최종안을 함께 받는다 (처음 3번 + 다시 2번)');
  assert.ok(notes.length === 2 && notes.every((u) => u.includes('앞서 고친 안은 받아들이지 않았다')), '다시 고칠 때는 이유를 붙인다');
  const [a1, a2, a3] = run.insights;
  assert.ok(a1.stance.bet && a1.stance.givesUp, '인사이트에 기조가 남는다');
  assert.equal(a1.revised, true); assert.equal(a1.kept, '지킴'); assert.ok(a1.concept.endsWith('(고침)'));
  assert.ok(a1.fixed.length === 1 && a1.costs.length === 0 && a1.refused.length === 0, '목업 공격 1건은 고침으로 답했다');
  assert.ok(a2.reverted && !a2.revised && a2.rematch.includes('기조를 버렸다') && a2.rematch.includes('고치기 전 안을 남겼다'), '다시 고쳐도 기조를 버린 안은 되돌린다');
  assert.ok(!a2.concept.includes('고침'));
  assert.ok(a3.revised && a3.redone && !a3.reverted && a3.concept.endsWith('(다시 고침)') && a3.rematch.includes('같은 해법'), '같아진 안은 다시 고쳐서 달라지면 남긴다');
  assert.equal(run.arena.counts.reverted, 1); assert.equal(run.arena.counts.redone, 2);
  assert.ok(run.notes.some((n) => n.includes('고치기 전으로 되돌렸다')));
  assert.ok(revisePrompt(sample(), { id: 'K1' }, { attacks: [], keep: '' }, null, [], st).system.includes('성공 기준은 기조보다 앞선다'));
});

test('오케스트레이션 — 방향을 정하는 호출은 lead, 정리 · 대조는 support로 나간다', async () => {
  const { tierOf, KIND_TIER } = await import('../knowledge/orchestration.js');
  assert.equal(tierOf({ kind: 'activate', lens: { family: 'tunnel' } }), 'support');
  assert.equal(tierOf({ kind: 'activate', lens: { family: 'identity' } }), 'lead');
  assert.equal(tierOf({ kind: 'activate', lens: { family: 'airplane' } }), 'lead');
  assert.equal(tierOf({ kind: '모르는 호출' }), 'support');
  const mock = createMock(); const tiers = {};
  const spy = { ...mock, json: async (a) => { (tiers[a.task.kind] ||= new Set()).add(a.tier); return mock.json(a); } };
  const p = sample(); await proposeIssuesFor(p, spy); await think(p, spy);
  for (const [kind, set] of Object.entries(tiers)) { if (kind === 'activate') assert.deepEqual([...set].sort(), ['lead', 'support']); else assert.deepEqual([...set], [KIND_TIER[kind]], `${kind} → ${KIND_TIER[kind]}`); }
  for (const k of ['issues', 'baseline', 'reframe', 'route', 'link', 'cross', 'stance', 'revise', 'verdict']) assert.ok(tiers[k].has('lead'), `${k}는 lead`);
  for (const k of ['integrate', 'screen', 'duel', 'distinct', 'attack', 'direct', 'plan']) assert.ok(tiers[k].has('support'), `${k}는 support`);
  assert.equal(KIND_TIER.hold, 'support');
});
async function proposeIssuesFor(p, provider) { const { proposeIssues } = await import('../js/engine/think.js'); return proposeIssues(p, provider); }

test('분류 — 여러 개 고를 수 있고, 고른 분류마다 특화 인풋이 미션에 들어간다', async () => {
  const T = await import('../knowledge/tags.js');
  const { newProject, validateProject } = await import('../js/graph/model.js');
  const { verdictPrompt } = await import('../knowledge/prompts.js');
  assert.ok(T.CATEGORIES.some((c) => c.id === 'ops') && T.SEED_INPUT.ops.length === 4 && T.TAGS.some((t) => t.category === 'ops'));
  // 예전 형식(category 하나)도 받는다
  assert.deepEqual(T.categoriesOf({ category: 'marketing' }), ['marketing']);
  assert.deepEqual(T.categoriesOf({ categories: ['marketing', 'ops', 'ops', '없는 분류'] }), ['marketing', 'ops']);
  const p = newProject({ ...sample(), id: 'multi', categories: ['marketing', 'ops'], seed: { marketing: { kpi: '대출 건수', offer: '빌릴 일이 없어도 들를 수 있다' }, ops: { cycle: '상시 운영, 월간 점검', standard: '' } } });
  assert.deepEqual(p.categories, ['marketing', 'ops']); assert.equal(p.category, 'marketing');
  const user = verdictPrompt(p, [], []).user;
  assert.ok(user.includes('마케팅 · 운영') && user.includes('마케팅_인풋') && user.includes('운영_인풋') && user.includes('상시 운영, 월간 점검'));
  // 고른 분류마다 필수 칸을 본다
  const miss = validateProject(p).problems.map((x) => `${x.where} ${x.what}`).join(' | ');
  assert.ok(miss.includes('운영 인풋') && miss.includes('응대 · 품질 기준') && !miss.includes('마케팅 인풋'));
});

test('Claude API 공급자 — 급에 따라 모델을 고르고, 문서의 호출 형식으로 보낸다', async () => {
  const { createAnthropic, ANTHROPIC_DEFAULTS } = await import('../js/providers/anthropic.js');
  const { forward } = await import('../api/claude.js');
  const sent = [];
  const fake = (answers) => async (url, init) => { sent.push({ url, headers: init.headers, body: JSON.parse(init.body) }); const a = answers.shift(); return { ok: a.status === 200, status: a.status, text: async () => JSON.stringify(a.body) }; };
  const ok = (text, stop = 'end_turn') => ({ status: 200, body: { type: 'message', content: [{ type: 'text', text }], stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } } });
  const direct = createAnthropic({}, { getKey: () => 'sk-test', fetchImpl: fake([ok('{"a":1}'), ok('설명 없이 {"b":2}'), ok('{"잘린', 'max_tokens'), ok('{"c":3}')]) });
  const r1 = await direct.json({ tier: 'lead', system: 'S', user: 'U' });
  assert.deepEqual(r1.json, { a: 1 }); assert.equal(r1.model, 'claude-opus-5-5'); assert.deepEqual(r1.usage, { in: 10, out: 5 });
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0].headers.Authorization, 'Bearer sk-test'); assert.equal(sent[0].headers['anthropic-version'], ANTHROPIC_DEFAULTS.version); assert.equal(sent[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.deepEqual(sent[0].body, { model: 'claude-opus-5-5', max_tokens: 8000, system: 'S', messages: [{ role: 'user', content: 'U' }] });
  const r2 = await direct.json({ tier: 'support', system: 'S', user: 'U' });
  assert.equal(r2.model, 'claude-sonnet-5-5'); assert.deepEqual(r2.json, { b: 2 });
  // 답이 잘리면 한 번 늘려서 다시 받는다
  const r3 = await direct.json({ tier: 'support', system: 'S', user: 'U' });
  assert.deepEqual(r3.json, { c: 3 }); assert.equal(sent[3].body.max_tokens, 16000);
  // 키가 없으면 부르지 않는다
  await assert.rejects(() => createAnthropic({}, { getKey: () => '', fetchImpl: fake([]) }).json({ system: 'S', user: 'U' }), /키가 없습니다/);
  // 서버 키 방식 — 키를 보내지 않고 접속 코드만 보낸다
  sent.length = 0;
  const proxy = createAnthropic({ mode: 'proxy' }, { getCode: () => 'code', fetchImpl: fake([ok('{"d":4}')]) });
  await proxy.json({ tier: 'lead', system: 'S', user: 'U' });
  assert.equal(sent[0].url, '/api/claude'); assert.equal(sent[0].headers['x-brain-code'], 'code'); assert.equal(sent[0].headers.Authorization, undefined); assert.ok(sent[0].body.body.model);
  // 프록시 — 키가 없거나 허용하지 않는 모델이면 막는다
  const old = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await forward({ method: 'POST', payload: { body: { model: 'claude-opus-5-5', messages: [] } } })).status, 503);
  process.env.ANTHROPIC_API_KEY = 'k';
  assert.equal((await forward({ method: 'GET', payload: {} })).status, 405);
  assert.equal((await forward({ method: 'POST', payload: { body: { model: '다른 모델', messages: [] } } })).status, 400);
  if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old;
});

test('수파베이스 — 로그인 · 토큰 갱신 · 프로젝트 저장 요청의 모양, 서버 중계는 승인된 사용자만 받는다', async () => {
  const { createCloud, canUse, isAdmin } = await import('../js/cloud/supabase.js');
  const { guard } = await import('../api/_guard.js');
  assert.ok(canUse('member') && canUse('super_admin') && !canUse('pending') && isAdmin('admin') && !isAdmin('member'));
  const sent = []; const store = new Map(); const storage = { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  let clock = 1_000_000;
  const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body === null ? '' : JSON.stringify(body)), json: async () => body });
  const answers = [];
  const fake = async (url, init = {}) => { sent.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined }); return answers.shift(); };
  const cloud = createCloud({ url: 'https://x.supabase.co/', key: 'pk' }, { fetchImpl: fake, storage, now: () => clock });
  // 가입 — 확인 메일을 기다린다(세션 없음)
  answers.push(reply(200, { id: 'u1', email: 'a@from.co.kr' }));
  assert.deepEqual(await cloud.signUp(' A@from.co.kr ', 'password1', '에이'), { confirmed: false, email: 'a@from.co.kr' });
  assert.equal(sent[0].url, 'https://x.supabase.co/auth/v1/signup'); assert.equal(sent[0].headers.apikey, 'pk');
  assert.deepEqual(sent[0].body, { email: 'a@from.co.kr', password: 'password1', data: { name: '에이' } });
  // 로그인 실패는 우리말로
  answers.push(reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }));
  await assert.rejects(() => cloud.signIn('a@from.co.kr', 'x'), /비밀번호가 맞지 않습니다/);
  // 로그인 — 세션을 저장한다
  answers.push(reply(200, { access_token: 't1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1', email: 'a@from.co.kr' } }));
  assert.deepEqual(await cloud.signIn('a@from.co.kr', 'password1'), { id: 'u1', email: 'a@from.co.kr' });
  assert.equal(sent.at(-1).url, 'https://x.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(await cloud.token(), 't1');
  // 저장 — 있으면 고치고 없으면 만든다
  answers.push(reply(201, null));
  await cloud.saveProject({ id: 'p1', title: '제목', brief: {} });
  const save = sent.at(-1);
  assert.equal(save.url, 'https://x.supabase.co/rest/v1/projects?on_conflict=id'); assert.equal(save.method, 'POST');
  assert.equal(save.headers.Authorization, 'Bearer t1'); assert.match(save.headers.Prefer, /merge-duplicates/);
  assert.deepEqual(Object.keys(save.body).sort(), ['data', 'id', 'owner', 'owner_email', 'title']); assert.equal(save.body.owner, 'u1');
  // 만료가 가까우면 토큰을 새로 받는다
  clock += 3600 * 1000 - 30000;
  answers.push(reply(200, { access_token: 't2', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1', email: 'a@from.co.kr' } }));
  assert.equal(await cloud.token(), 't2'); assert.equal(sent.at(-1).url, 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token'); assert.deepEqual(sent.at(-1).body, { refresh_token: 'r1' });
  // 권한이 없어 막히면 우리말로
  answers.push(reply(403, { code: '42501', message: 'new row violates row-level security policy' }));
  await assert.rejects(() => cloud.saveProject({ id: 'p2' }), /권한이 없습니다/);
  // 로그인은 배포된 주소에서만 켠다
  const { cloudOn } = await import('../js/cloud/config.js');
  assert.equal(cloudOn({ hostname: 'thefrombrain.vercel.app', search: '' }), true);
  assert.equal(cloudOn({ hostname: 'localhost', search: '' }), false); assert.equal(cloudOn({ hostname: '', search: '' }), false); assert.equal(cloudOn(undefined), false);
  assert.equal(cloudOn({ hostname: 'localhost', search: '?cloud=1' }), true);
  assert.equal(cloudOn({ hostname: 'thefrom-brain-git-x.vercel.app', search: '' }), true); assert.equal(cloudOn({ hostname: 'www.claudeusercontent.com', search: '?cloud=1' }), false);
  // 다시 열어도 로그인이 남아 있다
  assert.equal(createCloud({ url: 'https://x.supabase.co', key: 'pk' }, { fetchImpl: fake, storage, now: () => clock }).user.email, 'a@from.co.kr');
  answers.push(reply(204, null)); await cloud.signOut(); assert.equal(cloud.user, null); assert.equal(await cloud.token(), null);
  // 확인 메일 링크로 돌아오면 주소 뒤에 실린 로그인을 받는다
  assert.equal(await cloud.adoptHash('#type=signup'), false);
  answers.push(reply(200, { id: 'u1', email: 'a@from.co.kr' }));
  assert.equal(await cloud.adoptHash('#access_token=t9&refresh_token=r9&expires_in=3600&type=signup'), true);
  assert.equal(sent.at(-1).url, 'https://x.supabase.co/auth/v1/user'); assert.equal(sent.at(-1).headers.Authorization, 'Bearer t9'); assert.equal(await cloud.token(), 't9');
  await assert.rejects(() => cloud.adoptHash('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired'), /invalid or has expired/);
  answers.push(reply(204, null)); await cloud.signOut();

  // 문지기 — 수파베이스가 연결되면 로그인과 역할을 확인한다
  const env = { ...process.env }; process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'pk';
  const g = (role, userOk = true) => guard({ token: 'tok', fetchImpl: async (url) => (url.includes('/auth/v1/user') ? reply(userOk ? 200 : 401, { id: 'u1', email: 'a@from.co.kr' }) : reply(200, role ? [{ role }] : [])) });
  assert.equal((await guard({ token: '' })).status, 401);
  assert.equal((await g('member', false)).status, 401);
  assert.equal((await g('pending')).status, 403);
  assert.equal((await g(null)).status, 403);
  assert.deepEqual(await g('member'), { ok: true, user: { id: 'u1', email: 'a@from.co.kr', role: 'member' } });
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; delete process.env.VERCEL;
  // 연결되지 않았으면 접속 코드로 지킨다
  process.env.BRAIN_ACCESS_CODE = 'c'; assert.equal((await guard({ code: 'x' })).status, 401); assert.deepEqual(await guard({ code: 'c' }), { ok: true });
  delete process.env.BRAIN_ACCESS_CODE; assert.deepEqual(await guard({}), { ok: true });
  Object.assign(process.env, env);
});

test('외곽선 형상 — 전구 · 번개 · 폰을 쥔 손 · 클라우드와 서버: 노드 자리가 형상 안에 놓이고, 부분을 고치면 반영된다', async () => {
  const { shapeFor, FIGURES, figureParts, brainShape } = await import('../js/graph/shapes.js');
  const nodes = [...Array.from({ length: 7 }, (_, i) => ({ id: `id${i}`, type: 'lens', family: 'identity' })), ...Array.from({ length: 16 }, (_, i) => ({ id: `ap${i}`, type: 'lens', family: 'airplane' })), ...Array.from({ length: 4 }, (_, i) => ({ id: `tn${i}`, type: 'lens', family: 'tunnel' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `is${i}`, type: 'issue' })), ...Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, type: 'fact' })), { id: 'g', type: 'gate' }, { id: 'p', type: 'project' }];
  assert.deepEqual(Object.keys(FIGURES), ['bulb', 'bolt', 'phone', 'server']);
  for (const kind of Object.keys(FIGURES)) {
    const sh = shapeFor({ settings: { look: { kind } } });
    assert.equal(sh.id, `figure:${kind}`); assert.ok(sh.DOTS.length > 1200, `${kind} 점 ${sh.DOTS.length}`);
    for (const role of ['identity', 'airplane', 'tunnel', 'core', 'fact', 'mission']) assert.ok(sh.layers.some((l) => l.role === role), `${kind}에 ${role} 부분`);
    const seat = sh.seats(nodes); assert.equal(seat.size, nodes.length);
    for (const n of nodes) { const s = seat.get(n.id); assert.ok(sh.inside(s.x, s.y), `${kind}: ${n.id} 자리가 형상 밖 (${Math.round(s.x)}, ${Math.round(s.y)})`); }
    for (const f of ['identity', 'airplane', 'tunnel']) assert.ok(Number.isFinite(sh.caption(f).x));
  }
  // 부분을 고치면 색 · 이름 · 맡는 노드군이 바뀐다. 외곽선은 그대로다
  const base = shapeFor({ settings: { look: { kind: 'bulb' } } });
  const mine = shapeFor({ settings: { look: { kind: 'bulb', parts: { glow: { color: '#FF0000', name: '불빛', role: 'airplane' }, glass: { role: 'identity' } } } } });
  assert.equal(mine.layers[0].rgb, '255,0,0'); assert.equal(mine.layers[0].name, '불빛'); assert.equal(mine.layers[0].role, 'airplane'); assert.equal(mine.layers[1].role, 'identity');
  assert.deepEqual(mine.layers[0].polys, base.layers[0].polys);
  assert.equal(figureParts('bulb', { glow: { name: '불빛' } })[0].name, '불빛');
  // 모르는 형상은 기본 뇌로 돌아간다
  assert.equal(shapeFor({ settings: { look: { kind: 'nope' } } }), brainShape);
});

test('연결 — 판단이 45건을 넘으면 이슈별로 나눠 잇고 이슈 사이를 한 번 더 본다. 실패하면 단계 이름이 붙는다', async () => {
  const { linkPrompt } = await import('../knowledge/prompts.js');
  const issues = [{ id: 'I1', root: true, title: '근본 이슈', test: '판정 질문', tags: ['op-process'] }, ...[2, 3, 4, 5].map((n) => ({ id: `I${n}`, title: `하위 이슈 ${n}`, tags: ['dv-ops'] }))];
  const project = newProject({ title: '이슈 5개', categories: ['ops'], brief: { what: '무엇', purpose: '목적', target: '타겟', success: '성공 기준' }, seed: { ops: { cycle: '연간', standard: '기준' } }, issues });
  const mock = createMock({ delay: 0 }); const links = [];
  const provider = { ...mock, json: async (a) => { if (a.task.kind === 'link') links.push({ n: a.task.signals.length, scope: a.task.scope || null, user: a.user, system: a.system }); return mock.json(a); } };
  const run = await think(project, provider);
  assert.ok(run.signals.length > 45, `판단 ${run.signals.length}건`);
  assert.equal(links.length, 6); assert.equal(links.filter((l) => l.scope?.within).length, 5); assert.equal(links.filter((l) => l.scope?.across).length, 1);
  for (const l of links.filter((x) => x.scope?.within)) { assert.ok(l.n <= 45); assert.match(l.system, new RegExp(`이슈 ${l.scope.within} 안의 신호끼리만`)); }
  assert.match(links.find((l) => l.scope?.across).system, /서로 다른 이슈의 신호 사이만/);
  assert.ok(run.edges.length > 0); assert.ok(run.notes.some((n) => /연결을 6번에 나눠/.test(n)));
  // 이슈가 적으면 한 번에 잇는다
  links.length = 0;
  await think(newProject({ ...project, id: undefined, issues: issues.slice(0, 2) }), provider);
  assert.equal(links.length, 1); assert.equal(links[0].scope, null);
  assert.doesNotMatch(linkPrompt(project, [], () => '').system, /이번에는/);
  // 어느 단계에서 실패했는지 메시지에 붙는다
  const broken = { ...mock, json: async (a) => { if (a.task.kind === 'link') throw new Error('답이 길이 제한을 넘어 잘렸습니다'); return mock.json(a); } };
  await assert.rejects(() => think(newProject({ ...project, id: undefined }), broken), /^Error: \[연결\] 답이 길이 제한을 넘어/);
});

test('팩트 — 받은 자료에서 옮긴 것(doc)은 내부 자료로 받고, 사람이 확인하기 전으로 표시한다', async () => {
  const { factProblem, unverified, factsToMarkdown, parseFactbook } = await import('../knowledge/facts.js');
  const doc = { id: 'F1', kind: 'notice', text: '계약 기간은 2027-01-04부터다.', sourceType: 'internal', source: 'RFP I-3', date: '2026-11-23', url: '', by: 'doc', checked: false };
  assert.equal(factProblem(doc), ''); assert.equal(unverified(doc), true); assert.equal(unverified({ ...doc, checked: true }), false);
  assert.match(factProblem({ ...doc, by: 'ai' }), /내부 자료/); assert.equal(unverified({ ...doc, by: 'human' }), false);
  const md = factsToMarkdown({ title: 't', facts: [doc] }); assert.match(md, /자료에서 옮김 · 확인 전/);
  const back = parseFactbook(md); const list = Array.isArray(back) ? back : back.facts; assert.equal(list[0].by, 'doc'); assert.equal(list[0].checked, false);
});

test('스킬 — ZIP이 최신이고, 맨 위가 스킬 폴더이며, 지시문이 브레인이 받는 형식을 가르친다', async () => {
  const fs = await import('node:fs'); const { packSkill, SKILL } = await import('../scripts/pack-skill.mjs');
  const md = fs.readFileSync(new URL(`../skill/${SKILL}/SKILL.md`, import.meta.url), 'utf8');
  const zip = fs.readFileSync(new URL(`../skill/${SKILL}.zip`, import.meta.url));
  assert.ok(zip.equals(packSkill()), 'SKILL.md를 고친 뒤 npm run skill:zip 을 다시 돌린다');
  assert.equal(zip.readUInt32LE(0), 0x04034b50); assert.equal(zip.subarray(30, 30 + zip.readUInt16LE(26)).toString('utf8'), `${SKILL}/SKILL.md`);
  assert.match(md, new RegExp(`^---\\nname: ${SKILL}\\ndescription: .+\\n---\\n`));
  // 지시문의 예시 JSON이 그대로 통과한다
  const example = JSON.parse(md.match(/```json\n([\s\S]+?)\n```/)[1]);
  const { factProblem } = await import('../knowledge/facts.js');
  assert.equal(factProblem(example.facts[0]), ''); assert.equal(example.facts[0].by, 'doc');
  const p = newProject(example); assert.deepEqual(p.categories, ['ops', 'dev']);
  for (const kind of ['burger', 'bulb', 'bolt', 'phone', 'server']) assert.ok(md.includes('`' + kind + '`'), `지시문에 ${kind} 형상`);
});

test('전략 한 장 — 인사이트 위에 전체 판단과 팩트로 올리고, 넓이를 세고, 모자라면 한 번 더 쓴다', async () => {
  const { shapeStrategy, strategize } = await import('../js/engine/strategy.js');
  const { strategizeOnly } = await import('../js/engine/think.js');
  const { STRATEGY_CAPS, strategyPrompt } = await import('../knowledge/prompts.js');
  const { lensName } = await import('../js/graph/model.js');
  const p = newProject(SAMPLE);
  const run = await think(p, createMock());
  const st = run.strategy;
  assert.ok(st && st.concept.name && st.pillars.length >= 3 && st.check.ok, '분석 끝에 전략 한 장이 붙는다');
  assert.ok(st.coverage.signals.fresh > 0 && st.coverage.signals.total === run.signals.filter((s) => !s.muted).length, '쓰이지 않던 판단을 몇 개 끌어왔는지 센다');
  assert.equal(st.insights.length, run.insights.length, '인사이트마다 짧은 이름이 붙는다');
  // 프롬프트 — 쓰이지 않은 판단을 표시하고 글자 수를 묶는다
  const prompt = strategyPrompt(p, run, lensName);
  assert.match(prompt.user, /\(안 쓰임\)/); assert.match(prompt.system, new RegExp(`${STRATEGY_CAPS.name}자 이내`)); assert.match(prompt.system, /인사이트를 요약하지 않는다/);
  // 다듬기 — 없는 id는 걷어 내고, 크게 넘긴 글은 자르고, 모자란 것은 문제로 적는다
  const sid = run.signals[0].id;
  const shaped = shapeStrategy({ concept: { name: '가'.repeat(60), line: '한 줄' }, principle: '원칙', pillars: [{ part: 'a1', name: '축', guide: '안내', moves: ['1', '2', '3', '4'], facts: ['F1', 'F999'], signals: [sid, 'NOPE-1'], insights: ['N1', 'N9'] }], insights: [{ id: 'N9', name: 'x' }] }, p, run);
  assert.ok(shaped.concept.name.length <= STRATEGY_CAPS.name + 6, '크게 넘긴 이름은 자른다');
  assert.deepEqual([shaped.pillars[0].facts, shaped.pillars[0].signals, shaped.pillars[0].insights, shaped.pillars[0].moves.length, shaped.insights.length], [['F1'], [sid], ['N1'], 3, 0]);
  assert.ok(!shaped.check.ok && shaped.check.problems.some((x) => /축이 3개보다 적다/.test(x)), '조건을 못 채우면 무엇이 모자란지 적는다');
  // 모자라면 이유를 붙여 한 번 더 쓰게 한다
  const notes = []; let n = 0;
  const good = createMock();
  const call = async (args) => { n++; notes.push(/다시 쓰는 이유/.test(args.user)); return n === 1 ? { concept: { name: '', line: '' }, pillars: [] } : (await good.json(args)).json; };
  const run2 = { ...run, strategy: null };
  const again = await strategize({ project: p, run: run2, call });
  assert.deepEqual([n, notes, again.attempts, again.check.ok], [2, [false, true], 2, true]);
  // 한 장 보고서 — 전략과 쓴 팩트의 출처가 들어가고, 모델이 쓴 글은 이스케이프한다
  const { strategyHtml, reportMarkdown } = await import('../js/engine/report.js');
  p.run = run; const keep = run.strategy.concept.name; run.strategy.concept.name = '<b>x</b>';
  const html = strategyHtml(p);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>') && html.includes('A4 landscape') && html.includes(p.facts[0].source));
  run.strategy.concept.name = keep;
  assert.match(reportMarkdown(p), /## 전략 한 장/);
  // 이미 있는 결과 위에 전략만 다시 만든다 — 앞 단계 호출 없이
  p.run = run; const before = run.calls; const kinds = [];
  const only = await strategizeOnly(p, { json: async (a) => { kinds.push(a.task.kind); return good.json(a); } });
  assert.ok(only.check.ok && p.run === run && run.calls === before + 1 && kinds.every((k) => k === 'strategy'));
});

test('그래프 통합안 — 후보는 전체 노드의 판단을 읽고 쓴 안이고, 노드의 완성안은 재료다. 재대결은 하지 않는다', async () => {
  const { weaveSpines } = await import('../js/engine/arena.js');
  const { weavePrompt, duelPrompt, revisePrompt } = await import('../knowledge/prompts-arena.js');
  const p = newProject(SAMPLE);
  const calls = [];
  const mock = createMock();
  const run = await think(p, { ...mock, json: (a) => { calls.push(a); return mock.json(a); } });
  const kinds = calls.map((c) => c.task.kind);
  const c = run.arena.counts;
  assert.ok(c.weave >= 3 && c.node === 0 && c.cross === 0 && c.cluster === 3, JSON.stringify(c));
  assert.ok(!kinds.includes('cross') && kinds.filter((k) => k === 'weave').length === c.weave, '교배 대신 통합안을 쓴다');
  assert.ok(run.proposals.length >= 10, '노드의 완성안은 그대로 받아 재료로 쓴다');
  // 통합안은 뼈대 충돌의 두 판단을 포함해 여러 노드에 걸친다
  const sig = new Map(run.signals.map((x) => [x.id, x]));
  for (const k of run.arena.candidates.filter((x) => x.type === 'weave')) assert.match(k.from, /그래프 통합안 · 노드 \d+개/);
  const spines = weaveSpines(run, 5);
  assert.ok(spines.length >= 3 && new Set(spines.map((x) => [x.a.lens, x.b.lens].sort().join('|'))).size === spines.length, '뼈대는 서로 다른 노드 짝이다');
  assert.ok(spines.every((x) => x.edge.type === 'tension' && x.a.lens !== x.b.lens));
  // 통합안 프롬프트 — 모든 노드의 판단과 조건이 들어간다
  const wcall = calls.find((x) => x.task.kind === 'weave');
  for (const x of run.signals.filter((y) => !y.muted)) assert.ok(wcall.user.includes(`[${x.id}]`), `${x.id}가 통합안 프롬프트에 없다`);
  assert.match(wcall.system, /노드 \d개 이상/); assert.match(wcall.system, /판단을 나열하거나 평균 내지 않는다/);
  // 대결 — 판정자가 근거의 넓이를 본다
  const dcall = calls.find((x) => x.task.kind === 'duel');
  assert.match(dcall.user, /근거_넓이/); assert.match(dcall.user, /노드 \d+개 · 판단 \d+건 · 팩트 \d+건/); assert.match(dcall.system, /뚜렷함은 좁다는 뜻이 아니다/);
  // 재대결이 없다 — 고친 안을 받고, 기조 확인만 한다
  assert.ok(!calls.some((x) => x.task.kind === 'duel' && x.task.tag === 'rematch'), '재대결을 하지 않는다');
  assert.ok(!run.arena.duels.some((d) => d.stage === '재대결'));
  assert.ok(run.insights.every((n) => n.revised || n.reverted || !n.attacks.length), '고친 안은 기조 확인에서 걸리지 않으면 그대로 받는다');
  // 보완 — 아직 쓰지 않은 판단을 끌어다 쓸 수 있게 주고, 끌어온 것은 근거에 더한다
  const rcall = calls.find((x) => x.task.kind === 'revise');
  assert.match(rcall.user, /끌어다 쓸 수 있는 판단/); assert.match(rcall.system, /pulled/);
  const winner = run.insights.find((n) => n.origin.type === 'weave');
  if (winner) { assert.ok(winner.check.lenses.length >= 4, '이긴 통합안은 여러 노드에 걸친다'); assert.ok(Array.isArray(winner.spans) && winner.spans.length >= 4); assert.ok(winner.facts.every((f) => p.facts.some((x) => x.id === f))); }
  assert.ok(run.arena.candidates.some((x) => x.type === 'weave' && (x.seat || /결선/.test(x.status))), '통합안이 결선에 오른다');
  // 끌어온 판단은 그 안의 근거가 된다
  const run2 = await think(newProject(SAMPLE), { ...mock, json: async (a) => { const r = await mock.json(a); if (a.task.kind === 'revise') { const mine = new Set(a.task.cand.origin.signals); r.json.pulled = [run.signals.find((x) => !mine.has(x.id)).id, 'NOPE-1']; } return r; } });
  const pulled = run2.insights.filter((n) => n.revised && n.pulled.length);
  assert.ok(pulled.length > 0 && pulled.every((n) => n.pulled.every((id) => n.check.used.includes(id)) && !n.pulled.includes('NOPE-1')));
});

test('닿은 것 세기 — 노드군별로 쓰인 노드 수와, 인사이트까지 닿은 팩트 수를 낸다', async () => {
  const { reach } = await import('../js/engine/think.js');
  const sig = (id, lens, family, facts = []) => ({ id, lens, family, issue: 'I1', facts });
  const run = { signals: [sig('A-1', 'A', 'identity', ['F1']), sig('A-2', 'A', 'identity', ['F2']), sig('B-1', 'B', 'identity', ['F3']), sig('S-1', 'S', 'airplane'), sig('T-1', 'T', 'tunnel', ['F4', 'F5']), { ...sig('M-1', 'M', 'tunnel', ['F9']), muted: true }],
    insights: [{ check: { used: ['A-1', 'A-2'] } }, { check: { used: ['A-1', 'M-1'] } }] };
  const r = reach(run);
  assert.deepEqual(r.byFamily, { identity: { nodes: 2, usedNodes: 1 }, airplane: { nodes: 1, usedNodes: 0 }, tunnel: { nodes: 1, usedNodes: 0 } });
  assert.deepEqual([r.nodes, r.usedNodes, r.facts.sort(), r.cited.sort()], [4, 1, ['F1', 'F2'], ['F1', 'F2', 'F3', 'F4', 'F5']], '판단에 인용만 된 팩트는 닿은 것으로 세지 않는다');
  assert.deepEqual(reach({ signals: [], insights: [] }).facts, []);
});

test('운영 방향 — 노드가 방향 높이에서 한 번 더 판단하고, 그 충돌을 푸는 방향을 정한 뒤 영역별 전략과 전술로 내려 쓴다', async () => {
  const { levelOf, chart, areasOf, shapeHigh, shapeHighEdges, courseSpines, shapeRivals, shapeJudge, shapeLayers, courseNeed, cellItems } = await import('../js/engine/course.js');
  const { strategizeOnly } = await import('../js/engine/think.js');
  const { courseLensPrompt, courseLinkPrompt, coursePrompt, courseJudgePrompt, layersPrompt, courseScopePrompt, COURSE_CAPS } = await import('../knowledge/prompts-course.js');
  const { lensName, activeLenses } = await import('../js/graph/model.js');
  const { tierOf } = await import('../knowledge/orchestration.js');
  // 층위 — 고르지 않으면 분류로 정한다. 통합 · 운영 분류는 전략이다
  const p = newProject(SAMPLE);
  assert.equal(levelOf(p), 'concept');
  p.categories = ['integrated', 'ops', 'planning', 'marketing', 'design']; p.category = 'integrated';
  assert.equal(levelOf(p), 'strategy');
  p.settings.level = 'concept'; assert.equal(levelOf(p), 'concept'); delete p.settings.level;
  // 업무 영역 — 사람이 적은 것. 이름 있는 줄이 2개보다 적으면 없는 것으로 보고 미션에서 뽑는다. 프로젝트를 다시 읽어도 남는다
  assert.equal(areasOf(p), null); assert.equal(areasOf({ areas: [{ name: '하나' }, { name: ' ' }] }), null);
  const AREAS = [{ name: '앱 웹뷰 프로모션', note: 'UI/UX를 포함한 기획 · 디자인 · 개발' }, { name: '유지보수 운영', note: '' }, { name: '보안 · 모니터링', note: '' }];
  assert.deepEqual(areasOf(newProject({ areas: AREAS })).map((a) => `${a.id} ${a.name}`), ['S1 앱 웹뷰 프로모션', 'S2 유지보수 운영', 'S3 보안 · 모니터링']);

  // 전체 분석 — 영역을 뽑고, 모든 노드가 방향 높이에서 판단하고, 잇고, 기본 방향 · 후보 · 판정 · 아래 층 순서로 돈다
  const kinds = [];
  const mock = createMock();
  const run = await think(p, { name: 'mock', json: async (a) => { kinds.push(a.task.kind); return mock.json(a); } });
  const lenses = activeLenses(p, run.picks);
  const tail = kinds.filter((k) => k.startsWith('course') || k === 'layers' || k === 'strategy');
  assert.deepEqual(tail, ['courseScope', ...lenses.map(() => 'courseLens'), 'courseLink', 'courseBase', 'course', 'courseJudge', 'layers'], '전략 과제는 인사이트에서 올려 쓰는 단계를 돌리지 않는다');
  assert.ok(run.strategy.v === 4 && run.strategy.areasAuto && run.strategy.areas.length === 3 && !run.strategy.reusedHigh);
  // 방향 높이의 판단 — 노드마다 통합 1개와 영역마다 1개. 이슈 높이의 판단과 따로 둔다
  const hi = run.course;
  assert.equal(hi.signals.filter((x) => x.scope === 'ALL').length, lenses.length);
  assert.equal(hi.signals.length, lenses.length * 4);
  assert.ok(hi.signals.every((x) => x.id.startsWith('C-') && x.lens && x.family && x.claim) && !run.signals.some((x) => x.id.startsWith('C-')));
  assert.ok(hi.edges.some((e) => e.type === 'tension') && hi.edges.every((e) => e.why));
  assert.equal(tierOf({ kind: 'courseLens', lens: { family: 'tunnel' } }), 'support'); assert.equal(tierOf({ kind: 'courseLens', lens: { family: 'identity' } }), 'lead');

  // 영역을 적으면 뽑지 않고 그대로 쓴다. 영역이 바뀌었으니 노드 판단을 다시 받는다
  p.areas = AREAS; p.run = run; let only = [];
  const provider = { json: async (a) => { only.push(a.task.kind); return mock.json(a); } };
  let st = await strategizeOnly(p, provider);
  assert.deepEqual(only, [...lenses.map(() => 'courseLens'), 'courseLink', 'courseBase', 'course', 'courseJudge', 'layers']);
  // 영역이 그대로면 노드 판단은 다시 받지 않는다 — 호출 4회. fresh면 다시 받는다
  only = []; st = await strategizeOnly(p, provider);
  assert.deepEqual([only, st.reusedHigh], [['courseBase', 'course', 'courseJudge', 'layers'], true], '이미 있는 결과 위에서 방향 단계만 돈다');
  only = []; await strategizeOnly(p, provider, { fresh: true });
  assert.equal(only.filter((k) => k === 'courseLens').length, lenses.length);
  st = run.strategy;

  // 결과 — 방향, 영역별 전략, 전술(영역 × 단계)
  assert.ok(st.v === 4 && st.check.ok && !st.areasAuto, st.check.problems.join(' / '));
  assert.deepEqual([st.concept.name, st.principle], [st.direction.name, st.direction.standard], '맨 위는 이긴 방향이다');
  assert.deepEqual(st.direction.covers.map((c) => c.area), ['S1', 'S2', 'S3'], '방향은 영역마다 무엇이 달라지는지 적는다');
  // 방향은 방향 높이의 판단에서 나온다 — 충돌 하나를 맡고, 아이덴티티 노드가 뼈대이고, 터널이 받친다
  assert.ok(st.direction.signals.length && st.direction.signals.every((id) => id.startsWith('C-')), '이슈 높이의 판단을 올려 쓰지 않는다');
  const spine = run.course.edges.find((e) => e.id === st.direction.spine.edge);
  assert.ok(spine.type === 'tension' && st.direction.signals.includes(spine.from) && st.direction.signals.includes(spine.to), '출발한 충돌의 두 쪽을 모두 근거로 삼는다');
  assert.ok(st.direction.lenses.filter((l) => l.startsWith('ID-')).length >= 2 && st.direction.lenses.some((l) => l.startsWith('TN-')) && st.direction.how && st.direction.swap);
  assert.equal(new Set(st.rivals.map((r) => r.spine.edge)).size, st.rivals.length, '후보마다 출발하는 충돌이 다르다');
  assert.ok(st.rivals.length >= 2 && st.rivals.some((r) => r.id === st.direction.id) && st.judge.order.includes('BASE') && st.judge.beatsBase);
  assert.ok(st.coverage.high.used > 0 && st.coverage.high.total === run.course.signals.length && st.coverage.signals.total === run.signals.filter((x) => !x.muted).length, '이슈 높이의 판단과 방향 높이의 판단을 따로 센다');
  assert.deepEqual(st.pillars.map((x) => x.label), AREAS.map((a) => a.name), '줄은 파트가 아니라 업무 영역이다');
  assert.ok(st.pillars.every((x) => x.name && x.guide && !x.thin && x.signals.some((id) => id.startsWith(`C-`) && id.endsWith(x.part)) && x.tactics.length >= 4 && st.phases.every((ph) => cellItems(st, x, ph).length >= 1)), '영역 전략은 그 영역의 판단에서 출발하고, 그 아래 전술 여러 개가 단계별로 놓인다');
  assert.deepEqual([...new Set(st.pillars.flatMap((x) => x.tactics.flatMap((t) => t.parts)))].sort(), ['design', 'marketing', 'ops', 'planning'], '통합은 파트가 아니다. 나머지 파트가 전술을 맡는다');
  // 이긴 인사이트는 영역 전략이 아니라 그 아래 전술 하나다
  assert.equal(st.insights.length, run.insights.length);
  for (const x of st.insights) { const row = st.pillars.find((r) => r.part === x.part); assert.ok(x.fit === '맞음' && row.tactics.filter((t) => t.insight === x.id).length === 1 && row.tactics.some((t) => !t.insight)); }

  // 프롬프트 — 노드는 방향 높이에서 자기 기준 하나로만 보고, 이슈에서 낸 판단은 배경으로만 받는다
  const areas = areasOf(p); const need = courseNeed(p, run); const high = run.course.signals; const spines = courseSpines(run.course, 3);
  const jamais = lenses.find((l) => l.id === 'ID-JAMAIS');
  const lensP = courseLensPrompt(p, jamais, areas, run.signals.filter((x) => x.lens === jamais.id));
  for (const re of [/노드 "자메뷰", 방향 높이/, /업무 영역 전부를 어떻게 하나로 운영해야 하는가/, /다른 노드의 이름으로 바꿔 써도 성립하면 버린다/, /영역 하나를 빼도 문장이 그대로면 통합 판단이 아니다/, /통제 범위/, /S1: 앱 웹뷰 프로모션/]) assert.match(lensP.system, re);
  assert.match(lensP.user, /배경이다. 넓게 고쳐 써서 올리지 않는다/);
  assert.match(courseLinkPrompt(p, high.filter((x) => x.scope === 'ALL'), lensName).system, /표현만 다른 것, 강조점만 다른 것은 충돌이 아니다/);
  // 후보 — 충돌을 푸는 자리에서 쓰고, 아이덴티티가 뼈대이고, 바꿔치기 시험을 한다. 이슈 높이의 판단은 주지 않는다
  const cp = coursePrompt(p, run, spines, st.base, lensName, need, areas, high);
  for (const re of [/강한 판단 하나를 골라 다시 쓰면 방향이 아니다/, /아이덴티티 노드의 판단이 뼈대다/, /바꿔치기 시험/, /약속할 수 있는 것만 기준으로 삼는다/, /한 영역의 대상.*을 주어로 삼은 문장은 아무리 넓게 써도 그 영역의 전략이다/, /영역마다 한 줄씩/]) assert.match(cp.system, re);
  assert.match(cp.user, /출발 충돌/); assert.match(cp.user, /C-JAMAIS-ALL/);
  assert.ok(!cp.user.includes(`[${run.signals[0].id}]`), '방향 후보에게는 이슈 높이의 판단을 주지 않는다 — 판단이 몰린 영역으로 끌려가지 않게');
  assert.match(cp.system, new RegExp(`\`name\` ${COURSE_CAPS.name}자`));
  // 판정 — 통과가 기본값이 아니다. 영역 · 고유 · 약속 시험
  const jp = courseJudgePrompt(p, st.rivals, st.base, areas, lensName);
  for (const re of [/통과가 기본값이 아니다/, /영역 시험/, /고유 시험/, /약속 시험/, /다른 영역의 대상을 빌려 온 결정/]) assert.match(jp.system, re);
  assert.match(jp.user, /기준을_만든_노드/); assert.match(jp.user, /경쟁사가_못_쓰는_이유/);
  // 아래 층 — 영역 전략은 영역 높이의 판단에서, 전술은 이슈 높이의 판단에서
  const lp = layersPrompt(p, run, st.direction, st.judge, lensName, need, areas, high);
  for (const re of [/방향 문장에 영역 이름만 바꿔 붙이지 않는다/, /성공 기준 · 평가 항목마다/, /이긴 인사이트 하나를 이름만 바꿔 영역 전략으로 올리지 않는다/, /이긴 인사이트는 전술 하나다/, /영역마다 4개 이상/, /건의한다/]) assert.match(lp.system, re);
  assert.match(lp.user, /영역 전략의 출발점/); assert.match(lp.user, /이슈 높이의 판단 — 전술의 재료/); assert.ok(lp.user.includes(`[${run.signals[0].id}]`));
  assert.match(courseScopePrompt(p).system, /UI\/UX도 영역이 아니라 영역 안의 일이다/);

  // 노드 판단 다듬기 — 통합 1개, 영역마다 1개까지. 없는 영역과 없는 팩트는 걷는다
  const got = shapeHigh({ against: '통념', signals: [{ scope: 'all', claim: '통합', facts: ['F1', 'F999'] }, { scope: 'ALL', claim: '둘째 통합' }, { scope: 'S2', claim: '영역' }, { scope: 'S9', claim: '없는 영역' }, { scope: 'S3', claim: '' }] }, jamais, p, areas);
  assert.deepEqual(got.map((x) => [x.id, x.scope, x.facts, x.against]), [['C-JAMAIS-ALL', 'ALL', ['F1'], '통념'], ['C-JAMAIS-S2', 'S2', [], '']]);
  // 연결 다듬기 — 통합 판단끼리, 서로 다른 노드, 이유가 있는 것만
  const A = high.filter((x) => x.scope === 'ALL');
  const edges = shapeHighEdges({ edges: [{ from: A[0].id, to: A[1].id, type: 'tension', why: '이유' }, { from: A[1].id, to: A[0].id, type: 'tension', why: '같은 짝' }, { from: A[0].id, to: A[0].id, why: '자기 자신' }, { from: A[0].id, to: high.find((x) => x.scope !== 'ALL').id, why: '영역 판단' }, { from: A[2].id, to: A[3].id, type: 'tension', why: '' }, { from: A[2].id, to: A[3].id, why: '강화' }] }, high);
  assert.deepEqual(edges.map((e) => [e.id, e.type]), [['CE1', 'tension'], ['CE2', 'reinforce']]);
  // 출발 충돌 — 아이덴티티가 낀 충돌이 먼저이고, 같은 노드가 되풀이되지 않게 고른다
  const sg = (id, lens, family) => ({ id, lens, family, scope: 'ALL', claim: id });
  const picked = courseSpines({ signals: [sg('a', 'TN-MARKET', 'tunnel'), sg('b', 'TN-USAGE', 'tunnel'), sg('c', 'ID-JAMAIS', 'identity'), sg('d', 'ID-ONEU', 'identity'), sg('e', 'ID-FROM', 'identity')],
    edges: [{ id: 'CE1', from: 'a', to: 'b', type: 'tension' }, { id: 'CE2', from: 'c', to: 'a', type: 'tension' }, { id: 'CE3', from: 'c', to: 'd', type: 'tension' }, { id: 'CE4', from: 'd', to: 'e', type: 'tension' }, { id: 'CE5', from: 'a', to: 'e', type: 'reinforce' }] }, 3);
  assert.deepEqual(picked.map((x) => x.edge.id), ['CE3', 'CE4', 'CE2']);

  // 후보 다듬기 — 달라지는 것을 쓰지 않은 영역, 장치 이름, 아이덴티티가 빠진 근거를 문제로 적는다
  const tn = high.find((x) => x.family === 'tunnel' && x.scope === 'ALL').id;
  const shaped = shapeRivals({ candidates: [{ name: '혜택 쿠폰 화면', line: '쿠폰 화면을 하나로', standard: '기준', covers: [{ area: 'S1', line: '혜택 표기를 맞춘다' }, { area: 'S9', line: '없는 영역' }], signals: [tn, 'NOPE'], facts: ['F1', 'F999'], drops: [] }] }, p, run, areas, spines);
  assert.deepEqual([shaped.rivals[0].signals, shaped.rivals[0].facts, shaped.rivals[0].covers.map((c) => c.area), shaped.rivals[0].breadth], [[tn], ['F1'], ['S1'], { nodes: 1, identity: 0, tunnel: true }]);
  assert.ok(shaped.rivals[0].flags.includes('달라지는 것을 쓰지 않은 영역: 유지보수 운영, 보안 · 모니터링') && shaped.rivals[0].flags.some((f) => /장치 이름이 들어 있다: .*화면/.test(f)));
  for (const t of ['후보가 1개뿐', '영역 전부에 걸리지 않은 후보: D1', '더프롬의 기준에서 나오지 않은 후보: D1', '장치 이름을 쓴 후보: D1']) assert.ok(shaped.problems.some((x) => x.includes(t)), t);

  // 판정 다듬기 — 방향이고 고유하고 약속할 수 있는 후보가 먼저다. 실제 결정을 쓰지 못한 영역은 걸린 것으로 세지 않는다
  const r3 = st.rivals; const full = [{ area: 'S1', case: '결정' }, { area: 'S2', case: '결정' }, { area: 'S3', case: '결정' }];
  const j1 = shapeJudge({ order: ['D1', 'D2', 'BASE', 'D3'], items: [{ id: 'D1', level: '방향', reaches: full, own: '범용' }, { id: 'D2', level: '방향', reaches: full, own: '고유', control: '일부 불가' }, { id: 'D3', level: '방향', reaches: full, own: '고유', control: '가능', vsBase: '같음' }] }, r3, areas);
  assert.deepEqual([j1.winner, j1.beatsBase, j1.items.map((x) => `${x.own}/${x.control}`)], ['D3', false, ['범용/가능', '고유/일부 불가', '고유/가능']]);
  const j2 = shapeJudge({ order: ['D1', 'D2', 'D3', 'BASE'], items: [{ id: 'D1', level: '방향', reaches: [{ area: 'S1', case: '결정' }, { area: 'S2', case: '' }, { area: 'S3' }] }, { id: 'D2', level: '영역 전략', reaches: full }, { id: 'D3', level: '방향', reaches: ['S1', 'S3'] }] }, r3, areas);
  assert.deepEqual([j2.items.map((x) => [x.level, x.reaches.length]), j2.winner], [[['영역 전략', 1], ['영역 전략', 3], ['방향', 2]], 'D3']);
  assert.equal(shapeJudge({}, r3, areas).winner, 'D1', '판정이 비면 첫 후보로 간다');

  // 아래 층 다듬기 — 전략이 없는 영역, 적은 전술, 빈 단계, 전술을 맡지 않은 파트, 놓지 않은 인사이트, 방향을 그대로 옮긴 전략을 문제로 적는다
  const thin = shapeLayers({ phases: [{ id: 'P1', when: '1월', line: '상태' }, { id: 'P2', when: '2월', line: '상태' }, { id: 'P3', when: '3월', line: '상태' }],
    areas: [{ area: 'S1', name: '프로모션 관리 전략', line: st.direction.line, tactics: [{ phase: 'P1', move: '한다', parts: ['planning', 'nope'], insight: 'N1' }, { phase: 'P2', move: '또 한다', parts: ['design'], insight: 'N1' }] }], insights: [{ id: 'N2', fit: '맞지 않음' }] }, p, run, st.direction, areas);
  assert.deepEqual(thin.pillars[0].tactics.map((t) => [t.parts, t.insight]), [[['planning'], 'N1'], [['design'], '']], '없는 파트는 걷고, 인사이트는 한 자리에만 놓는다');
  for (const t of ['전략이 없는 영역: 유지보수 운영, 보안 · 모니터링', '앱 웹뷰 프로모션(2개)', '앱 웹뷰 프로모션(3월)', '전술을 맡지 않은 파트: 운영, 마케팅', '전술로 놓지 않은 인사이트: N3', '방향 문장을 그대로 옮긴 영역 전략: 앱 웹뷰 프로모션', '근거 판단이 2개보다 적은 영역']) assert.ok(thin.check.problems.some((x) => x.includes(t)), `${t} ← ${thin.check.problems.join(' / ')}`);
  assert.ok(!thin.check.problems.some((x) => x.includes('N2')), '맞지 않는다고 적은 인사이트는 문제가 아니다');

  // 판정이 이긴 방향을 범용 · 통제 불가 · 영역 전략으로 보거나 기본 방향을 더 낫게 보면 숨기지 않고 문제로 남긴다
  const judged = (items, order = ['BASE', 'D1', 'D2', 'D3']) => chart({ project: p, run: { ...run, strategy: null }, call: async (a) => (a.task.kind === 'courseJudge' ? { order, items } : (await mock.json(a)).json) });
  const lost = await judged([{ id: 'D1', level: '영역 전략', reaches: [{ area: 'S1', case: '결정' }] }, { id: 'D2', level: '전술' }, { id: 'D3', level: '영역 전략' }]);
  assert.ok(!lost.check.ok && /이긴 방향을 영역 전략으로 봤다/.test(lost.check.problems[0]) && lost.check.problems.includes('판정이 기본 방향을 더 낫게 봤다'));
  const bland = await judged([1, 2, 3].map((n) => ({ id: `D${n}`, level: '방향', reaches: full, own: '범용', control: '일부 불가' })), ['D1', 'D2', 'D3', 'BASE']);
  assert.deepEqual(bland.check.problems.slice(0, 2), ['판정이 이긴 방향을 범용 문장으로 봤다 — 경쟁 대행사도 그대로 쓸 수 있다', '기준의 판정 대상에 우리가 통제할 수 없는 구간이 들어 있다']);
  // 통합 판단 사이에 충돌이 없으면 그것도 남긴다
  const flat = await chart({ project: p, run: { ...run, strategy: null, course: null }, call: async (a) => (a.task.kind === 'courseLink' ? { edges: [] } : (await mock.json(a)).json) });
  assert.ok(flat.check.problems.some((x) => /충돌을 찾지 못했다/.test(x)) && flat.rivals.every((r) => r.spine === null));

  // 한 장 보고서 — 3층으로 나오고, 방향을 만든 노드와 푼 충돌이 보이고, 모델이 쓴 글은 이스케이프한다
  const { strategyHtml, reportMarkdown } = await import('../js/engine/report.js');
  p.run = run; run.strategy = st; st.direction.name = '<b>x</b>';
  const html = strategyHtml(p);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  for (const t of ['통합 운영 방향', '만든 노드', '푼 충돌', '고유한 이유', '영역별 전략', '영역 × 단계', '겨룬 방향', '앱 웹뷰 프로모션', '방향 높이 판단', 'A4 landscape']) assert.ok(html.includes(t), t);
  const md = reportMarkdown(p);
  for (const t of ['### 1. 통합 운영 방향', '만든 노드:', '방향 높이의 노드 판단(통합):', '통합 판단 사이의 충돌:', '### 2. 영역별 전략', '### 3. 전술 — 영역 × 단계', '(채택)', '- 유지보수 운영:']) assert.ok(md.includes(t), t);
  // 예전 모양(v2: 파트 × 단계)도 깨지지 않고 그려진다
  const v2 = { v: 2, direction: { id: 'D1', name: '방향', line: '한 줄', standard: '기준', from: '', to: '', keeps: '', drops: [], signals: [], facts: [] }, concept: { name: '방향', line: '한 줄' }, rivals: [], judge: { order: [], items: [] }, axes: [{ id: 'A1', name: '축', rule: '규칙', signals: [], facts: [] }], phases: [{ id: 'P1', when: '1월', line: '상태' }],
    pillars: [{ part: 'ops', label: '운영', name: '운영', guide: '안내', cells: [{ phase: 'P1', move: '옛 할 일', axis: 'A1' }], moves: [], facts: [], signals: [], insights: ['N1'] }], insights: [{ id: 'N1', name: '옛 전술', line: '', part: 'ops', phase: 'P1', fit: '맞음' }], fixes: [], boosts: [], gaps: [], coverage: st.coverage, check: { ok: true, problems: [] } };
  assert.deepEqual(cellItems(v2, v2.pillars[0], v2.phases[0]).map((x) => x.move), ['옛 할 일', '옛 전술']);
  run.strategy = v2; assert.ok(strategyHtml(p).includes('옛 할 일') && reportMarkdown(p).includes('### 2. 축과 단계'));
});
