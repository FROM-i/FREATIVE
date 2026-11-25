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
  assert.equal(run.calls, 1 + 1 + 1 + lenses + 1 + p.settings.insightCount + run.arena.calls + 1 + 1 + 1 + (run.creative ? 2 : 0), '호출 수 = 기본안 1 + 문제 다시 정의 1 + 사조 고르기 1 + 노드 수 + 연결 1 + 묶음 통합 + 경쟁 + 더프롬 판정 1 + 디렉션 1');
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
  assert.ok(kinds.length > again.clusters.length && kinds.every((k) => ['integrate', 'direct', 'verdict', 'cross', 'screen', 'duel', 'attack', 'revise', 'plan', 'pull', 'creative'].includes(k)), '통합·판정·디렉션 호출만 있다');
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

test('고친 뒤 재확인 — 보완은 다른 최종안을 보고 하나씩 하고, 고치다가 같아진 안은 고치기 전으로 되돌린다', async () => {
  const { revisePrompt } = await import('../knowledge/prompts-arena.js');
  assert.ok(revisePrompt(sample(), { id: 'K1' }, { attacks: [], keep: '' }, null, [{ title: '다른 안', concept: '달력에 넣는다' }]).user.includes('## 다른 최종안'));
  assert.ok(!revisePrompt(sample(), { id: 'K1' }, { attacks: [], keep: '' }, null).user.includes('## 다른 최종안'));
  const mock = createMock(); const seen = []; let stages = [];
  const p = { ...mock, json: async (a) => {
    if (a.task.kind === 'revise') { seen.push(a.task.others.length); const r = await mock.json(a); r.json.concept = `${r.json.concept} (고침)`; return r; }
    // 고친 안이 고치기 전 안을 이기게 한다
    if (a.task.kind === 'duel' && a.task.tag === 'rematch') return { json: { duels: a.task.pairs.map((x) => ({ pair: x.id, winner: x.a.id.endsWith('r') ? x.a.id : x.b.id, why: '고친 안이 낫다' })) }, usage: null };
    if (a.task.kind === 'distinct') { stages.push(a.task.stage || 'final'); if (a.task.stage === 'revised') return { json: { groups: [{ name: '같아진 해법', ids: a.task.candidates.map((c) => c.id), why: '같은 장치' }] }, usage: null }; }
    return mock.json(a);
  } };
  const run = await think(sample(), p);
  assert.deepEqual(stages, ['final', 'revised']);
  assert.deepEqual(seen, run.insights.map(() => run.insights.length - 1), '보완마다 다른 최종안을 함께 받는다');
  assert.equal(run.insights[0].revised, true, '순위가 가장 높은 안은 고친 채로 둔다');
  assert.ok(run.insights.slice(1).every((n) => n.revised === false && n.reverted === true && !n.concept.endsWith('(고침)')));
  assert.equal(run.arena.counts.reverted, run.insights.length - 1);
  assert.ok(run.notes.some((n) => n.includes('고치기 전으로 되돌렸다')));
});
