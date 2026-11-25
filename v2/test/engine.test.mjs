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

const sample = () => newProject(SAMPLE);

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
  assert.equal(run.calls, 1 + 1 + lenses + 1 + p.settings.insightCount + 1 + 1, '호출 수 = 기본안 1 + 사조 고르기 1 + 노드 수 + 연결 1 + 인사이트 수 + 더프롬 판정 1 + 디렉션 1');
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
  const run = await think(sample(), lazy);
  assert.equal(integrateCalls, 6, '묶음 3개 × 2번');
  assert.ok(run.insights.every((i) => !i.check.ok && i.check.problems.length));
});

test('사람의 개입 — 엣지를 고치면 발화 없이 전파·통합만 다시 돈다', async () => {
  const p = sample();
  p.run = await think(p, createMock());
  const before = p.run.clusters.map((c) => c.members.join());
  // 가장 강한 긴장을 끊고, 신호 하나를 끈다
  p.run.edges = p.run.edges.filter((e) => !(e.from === 'JP-1' && e.to === 'BENEFIT-2'));
  p.run.signals.find((s) => s.id === 'BRUTAL-1').muted = true;
  const kinds = [];
  const mock = createMock();
  const again = await think(p, { name: 'spy', json: (a) => { kinds.push(a.task.kind); return mock.json(a); } }, { mode: 'relink' });
  assert.ok(kinds.length > again.clusters.length && kinds.every((k) => k === 'integrate' || k === 'direct' || k === 'verdict'), '통합·판정·디렉션 호출만 있다');
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
  assert.equal(T.CATEGORIES.length, 6);
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

test('더프롬 판정 — 관점이 모든 호출에 들어가고, 가중 합계는 코드가 계산한다', async () => {
  const { shapeVerdict } = await import('../js/engine/think.js');
  const { WEIGHTS, weightedScore, viewpointBlock, normalizeWeights } = await import('../knowledge/viewpoint.js');
  const { baselinePrompt } = await import('../knowledge/prompts.js');
  const p = sample();
  const systems = [];
  const mock = createMock();
  const spy = { ...mock, json: (a) => { systems.push([a.task.kind, a.system]); return mock.json(a); } };
  const mine = [{ id: 'PR-X', verdict: '기각', what: '테스트용 사례', why: '이유' }];
  const run = await think(p, spy, { precedents: mine });
  for (const [kind, sys] of systems) {
    if (kind === 'baseline') assert.ok(!sys.includes('더프롬의 눈으로'), '기본안은 더프롬의 관점 없이 낸다');
    else assert.ok(sys.startsWith('## 관점 — 더프롬의 눈으로 본다') && sys.includes('테스트용 사례'), `${kind} 호출에 관점과 판정 사례가 들어간다`);
  }
  assert.ok(!baselinePrompt(p).system.includes('자메뷰'));
  assert.equal(run.verdict.items.length, run.insights.length);
  assert.deepEqual(run.verdict.items.map((v) => v.score), [...run.verdict.items.map((v) => v.score)].sort((a, b) => b - a), '점수순');
  assert.ok(run.insights.every((i) => i.from && ['채택', '보완', '기각'].includes(i.from.verdict)));
  // 가중치 — 자메뷰가 가장 무겁다. 같은 점수 묶음이라도 무거운 기준이 높으면 합계가 높다
  assert.equal(Math.round(Object.values(normalizeWeights(WEIGHTS)).reduce((a, b) => a + b, 0) * 100), 100);
  const hi = weightedScore({ 'ID-JAMAIS': 5, 'ID-FROM': 3, 'ID-BENEFIT': 3, 'ID-ONEU': 3, 'ID-INERTIA': 3, 'ID-YELLOW': 1 });
  const lo = weightedScore({ 'ID-JAMAIS': 1, 'ID-FROM': 3, 'ID-BENEFIT': 3, 'ID-ONEU': 3, 'ID-INERTIA': 3, 'ID-YELLOW': 5 });
  assert.ok(hi > lo);
  assert.equal(weightedScore(Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 5]))), 100);
  // 기각된 인사이트는 디렉션의 근거가 되지 않는다
  const raw = { verdicts: run.insights.map((i, n) => ({ insight: i.id, scores: {}, verdict: n === 0 ? '기각' : '채택' })) };
  assert.equal(shapeVerdict(raw, run.insights).items.find((v) => v.insight === run.insights[0].id).verdict, '기각');
  assert.ok(viewpointBlock([], WEIGHTS).indexOf('자메뷰') < viewpointBlock([], WEIGHTS).indexOf('노랑'), '무거운 기준이 먼저 나온다');
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
