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
  assert.equal(run.calls, 1 + lenses + 1 + p.settings.insightCount, '호출 수 = 여행지 1 + 노드 수 + 연결 1 + 인사이트 수');
  assert.equal(new Set(run.signals.map((s) => s.lens)).size, lenses, '모든 노드가 발화했다');
  assert.deepEqual(events.filter((e) => ['route', 'activate', 'link', 'propagate', 'integrate', 'done'].includes(e)), ['route', 'activate', 'link', 'propagate', 'integrate', 'done']);
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
  assert.ok(check.problems.some((x) => x.includes('지나지 않았다')));
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
  assert.ok(kinds.length >= again.clusters.length && kinds.every((k) => k === 'integrate'), '통합 호출만 있다');
  assert.equal(again.signals.length, 26);
  assert.ok(!again.clusters.some((c) => c.members.includes('BRUTAL-1')));
  assert.notDeepEqual(again.clusters.map((c) => c.members.join()), before);
});

test('이슈 추가 — 새 이슈에만 발화하고 사람이 고친 엣지는 지킨다', async () => {
  const p = sample();
  p.run = await think(p, createMock());
  p.run.edges.push({ id: 'H1', from: 'FROM-1', to: 'USAGE-1', type: 'cause', weight: 0.9, why: '사람이 이은 연결', by: 'human' });
  p.issues.push({ id: 'I4', title: '사서의 업무가 늘어난다', detail: '', test: '', root: false });
  const run = await think(p, createMock(), { mode: 'add' });
  const fresh = run.signals.filter((s) => s.issue === 'I4');
  assert.equal(fresh.length, new Set(run.signals.map((s) => s.lens)).size, '노드마다 새 이슈에 신호 1건');
  assert.equal(run.signals.length, 26 + fresh.length);
  assert.equal(new Set(run.signals.map((s) => s.id)).size, run.signals.length, '신호 ID가 겹치지 않는다');
  assert.ok(run.edges.some((e) => e.by === 'human' && e.why === '사람이 이은 연결'));
});

test('예시가 아닌 프로젝트 — 목업 틀 문장으로도 구조가 선다', async () => {
  const p = newProject({ title: '테스트', brief: { what: '무엇', purpose: '목적', target: '타겟' }, issues: [{ title: '근본 이슈', root: true, test: '질문' }, { title: '이슈 둘' }] });
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
  assert.ok(md.includes(`신호 ${u.signals}건 중 ${u.used}건(${Math.round((u.used / u.signals) * 100)}%)`));
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
