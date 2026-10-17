'use strict';
/**
 * 헤드리스 점검 — electron scripts/test-orchestrator.js
 *  1) 모든 프롬프트의 {{include:…}} 가 실제 지식 파일의 절로 풀리는지
 *  2) 목업 공급자로 전체 흐름(브리프 질문 → 답 → C 게이트 → 수정 → go → 예시)이 끝까지 도는지
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

process.env.CT_MOCK_SPEED = '0.02';
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ct-test-')));

app.whenReady().then(async () => {
  const fail = (m) => { console.error('FAIL', m); app.exit(1); };
  try {
    const src = path.join(__dirname, '../src/main');
    const settings = require(path.join(src, 'settings')); settings.init();
    const store = require(path.join(src, 'services/storage')); store.init();
    const knowledge = require(path.join(src, 'knowledge')); knowledge.init();
    const { render } = require(path.join(src, 'orchestrator/prompts'));
    const providers = require(path.join(src, 'providers')); providers.setMock(true);
    // 모든 호출의 실제 프롬프트를 기록 — 앞 단계 결과가 다음 단계의 단초로 들어가는지 검사한다
    const CALLS = [];
    { const mock = require(path.join(src, 'providers/mock'));
      for (const fn of ['chat', 'search']) { const orig = mock[fn]; mock[fn] = async (o) => { CALLS.push({ prompt: o.meta.prompt, stage: o.meta.stage, text: (o.system || '') + '\n' + (o.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') }); return orig(o); }; } }
    const orch = require(path.join(src, 'orchestrator'));
    const report = require(path.join(src, 'report'));

    const k = knowledge.load();
    console.log('knowledge', k.manifest.version, 'isms', k.isms.length, 'types', k.types.types.length);
    console.log('knowhow index', k.knowhow.length);
    if (k.isms.length !== 16) fail('ISM 16개가 아님: ' + k.isms.length);
    if (k.knowhow.length < 150) fail('노하우북 항목이 비었음: ' + k.knowhow.length);
    // Windows 빌드처럼 CRLF가 섞여도 노하우가 읽혀야 한다
    {
      const kn = require(path.join(src, 'knowledge'));
      const md = k.files['skill/references/catalog-form.md'].replace(/\n/g, '\r\n');
      const n = kn.parseKnowhow(md, 'crlf').length;
      console.log('knowhow CRLF', n);
      if (n < 100) fail('CRLF 노하우 파싱 실패');
    }

    const prompts = Object.keys(k.files).filter((f) => /^prompts\/(\d+_|b_|lib_|s_|p_).+\.md$/.test(f));
    for (const f of prompts) {
      const name = f.replace(/^prompts\//, '').replace(/\.md$/, '');
      const r = render(name, { type: {}, mission: {}, lensTable: 'x', stageLenses: 'x', knowhowIndex: 'x', roundSchema: '{}', roundRule: 'x' });
      const miss = (r.system + r.user).match(/\(참조 없음: [^)]+\)/g);
      if (miss) fail(`${name}: ${miss.join(', ')}`);
      console.log('prompt ok', name, `system ${r.system.length}자`);
    }

    // 첨부 하나
    const att = path.join(os.tmpdir(), 'ct-brief.md');
    fs.writeFileSync(att, '# 브리프\n농장→로스터리 이동 거리가 짧다.');
    const user = await require(path.join(src, 'services/auth')).current();
    const p = store.create(user, {
      projectName: '겨울 원두 팝업', deliverables: ['signage', 'promotion'], purposes: ['인지', '참여'],
      target: '주말 성수동을 걷는 20~30대', product: '제주 로컬 커피 브랜드 겨울 원두', channel: '오프라인', devices: ['옥외·사이니지'], keyMoment: '', depth: 'gate',
    }, [att]);

    const events = [];
    const waitFor = (pred, ms = 60000) => new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const e = events.find(pred);
        if (e) { clearInterval(iv); res(e); }
        else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
      }, 20);
    });
    const emit = (e) => { events.push(e); if (['gate', 'error', 'done', 'stage-done'].includes(e.kind)) console.log('event', e.kind, e.stage || e.gate || e.error || ''); };

    await orch.start(p.id, emit);
    await waitFor((e) => e.kind === 'gate' && e.gate === 'brief');
    await orch.answerBrief(p.id, { Q1: '지금 들어가 볼 이유', Q2: '걷다가 지나치며 (3초)' }, emit);
    await waitFor((e) => e.kind === 'gate' && e.gate === 'C');
    events.length = 0;
    await orch.gate(p.id, 'revise', '테마를 더 짧게', emit);
    await waitFor((e) => e.kind === 'gate' && e.gate === 'C');
    await orch.gate(p.id, 'go', '좋다', emit);
    const end = await waitFor((e) => e.kind === 'done' || e.kind === 'error');
    if (end.kind === 'error') fail(end.error);
    const run = store.get(p.id).run;
    const imgs = run.results.creative.examples.filter((e) => e.image).length;
    const brainStages = Object.keys(run.brain);
    console.log('agents', run.agents.length, 'calls', run.usage.calls, 'images', imgs, 'C history', run.gates.C.history.length, 'cost $' + run.usage.cost.toFixed(3));
    console.log('brain stages', brainStages.join(','), '| positioning attempts', (run.brain.positioning.attempts || []).map((a) => a.verdict).join('→'));
    console.log('forpop shifts', run.results.forpop.shifts.map((x) => x.shift.type).join('→'), '| concept', run.results.concept.proposals.length, '→', run.results.concept.first_round.picked.length, '→', run.results.concept.final_id);
    console.log('guides', run.results.creative.examples.length, '| modelPlan', run.modelPlan.map((m) => m.stage + ':' + m.model).join(','));
    if (imgs < 3) fail('이미지 생성 안 됨');
    if (run.results.creative.examples.length < 3) fail('가이드 3종 미만');
    if (!brainStages.includes('concept') || !brainStages.includes('forpop')) fail('브레인 개입 누락');
    const fpr = run.results.forpop;
    console.log('forpop for', fpr.for.chosen, '| scan', fpr.scan.scopes.map((x) => `${x.scope}:${x.citations.length}`).join(','), '| legend', fpr.compare.legend.axes.length, '| verdicts', fpr.compare.scopes.map((x) => x.verdict).join(','), '| searches', run.usage.searches);
    if (fpr.scan.scopes.length !== 3) fail('웹 정찰 3범위 누락');
    // ── 펼치기: 범위 · 기본안 · 설계 · 장면 ──
    {
      const R = run.results;
      const bp = R.creative.blueprint || {};
      const anat = (require(path.join(src, 'knowledge')).load().types.types.filter((t) => ['signage', 'promotion'].includes(t.id)).flatMap((t) => t.anatomy.map((a) => a.key)));
      const keys = new Set((bp.sections || []).map((x) => x.key));
      const tps = new Set(R.creative.examples.map((e) => e.touchpoint));
      console.log('expand scope', R.brief.scope.length, '| baseline', !!R.baseline, '| blueprint sections', keys.size, '/', new Set(anat).size, '| gaps', (bp.gaps || []).length, '| scenes', R.creative.examples.length, 'touchpoints', tps.size);
      if (R.brief.scope.length < 4) fail('사업 범위가 펼쳐지지 않음');
      if (!R.baseline || !R.baseline.overall) fail('기본안 없음');
      for (const k of new Set(anat)) if (!keys.has(k)) fail('설계서에 해부도 절 누락: ' + k);
      if ((bp.gaps || []).length) fail('설계서 빈 곳: ' + bp.gaps.join(' · '));
      if (tps.size < R.creative.examples.length) fail('장면이 같은 접점의 변주');
      if (!run.agents.some((x) => x.stage === 'creative' && /보완/.test(x.task || '') && /설계/.test(x.name || ''))) fail('설계 빈 절 보완이 돌지 않음');
      const sys = (bp.sections || []).find((x) => x.key === 'system');
      if (!sys || sys.items.length < 4) fail('사인 체계가 최소 항목(4) 미만');
      const cr = (run.brain.creative && run.brain.creative.attempts || []).map((a) => a.verdict);
      console.log('creative attempts', cr.join('→'), '| layers', R.tunnel.layers.map((l) => l.key).join(','), '| form_moves', (R.airplane.travels[0].form_moves || []).length);
      if (cr[0] !== '재작업') fail('기본안과 같은 결과가 자동 재작업되지 않음');
      if (!R.tunnel.layers.some((l) => l.key === 'precedent')) fail('결과물 유형의 조사 레이어가 붙지 않음');
      if (!(R.airplane.travels[0].form_moves || []).length) fail('사조 조형 조작 없음');
    }
    console.log('polish', JSON.stringify(Object.fromEntries(Object.entries(run.polish || {}).map(([k, v]) => [k, v.length]))), '| core', fpr.core_pod.statement);
    if (/로 다르다$/.test(fpr.core_pod.statement || '')) fail('교열이 칸 이어 붙인 문장을 고치지 않음');
    // 모델 구성 — 추천 구성(models.json): 화가 astra · 브레인 sol(핵심 단계 astra) · 조수 화가 배정 · 이미지 풀
    const am = (st, key) => run.agents.filter((x) => x.stage === st && x.key === key).map((x) => x.model.replace(/^mock:/, ''));
    console.log('models painter', am('concept', 'painter')[0], '| brain canvas', am('canvas', 'brain')[0], '| brain forpop', am('forpop', 'brain')[0], '| scout', am('forpop', 'scout-category')[0], '| image', am('creative', 'image')[0]);
    if (am('concept', 'painter')[0] !== 'gpt-6-astra') fail('화가 모델이 추천 구성이 아님');
    if (am('forpop', 'brain')[0] !== 'gpt-6-astra' || am('canvas', 'brain')[0] !== 'gpt-6.1-sol') fail('브레인 단계 지정 미적용');
    if (am('creative', 'image')[0] !== 'gpt-image-2.5-sunburst') fail('이미지 풀 배정 미적용');
    if (!fpr.compare.scopes.every((x) => x.series.every((se) => se.values.length === fpr.compare.legend.axes.length))) fail('공통 범례 축 수 불일치');
    if (!fpr.compare.positioning || !fpr.compare.positioning.sentence) fail('포지셔닝 진술문 없음');
    // ── 단계 간 전달(계보) 검사 ──
    {
      const R = run.results;
      const norm = (x) => String(x || '').replace(/\\"/g, '').replace(/"/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ');
      global.__reaches = (value, prompt) => reaches(value, prompt);
      const reaches = (value, prompt) => { const v = norm(value); return v.length >= 4 && CALLS.some((c) => c.prompt === prompt && norm(c.text).includes(v)); };
      const LINKS = [
        ['캔버스 · 나로부터', R.canvas.from_me, ['03_ism', '05_layer', '07_positioning', '09_concepts', '09_concept_kit', '10_creative']],
        ['Airplane · 하이브리드', R.airplane.synth.hybrid && (R.airplane.synth.hybrid.name || R.airplane.synth.hybrid.principle || JSON.stringify(R.airplane.synth.hybrid).slice(2, 30)), ['05_layer', '07_positioning', '08_forpop', '09_concept_kit', '10_creative']],
        ['Tunnel · 출구', R.tunnel.synth.exit_light, ['07_positioning', '08_forpop', '09_concept_kit', '10_creative']],
        ['Positioning · 빈자리', R.positioning.whitespace.label, ['08_forpop', '09_concept_kit', '10_creative']],
        ['Positioning · 통상적 해석', (R.positioning.players || [])[0] && R.positioning.players[0].label, ['08_forpop']],
        ['웹 정찰 · 플레이어', R.forpop.scan.scopes[0].players[0].name, ['b_shift', 'b_compare']],
        ['FoR·PoP·PoD · 코어 PoD', R.forpop.core_pod.item, ['b_compare', '09_concepts', 'b_concept', '09_concept_kit', '10_creative']],
        ['FoR·PoP·PoD · RTB', R.forpop.rtb[0].fact, ['b_compare', '09_concepts', '10_creative']],
        ['FoR·PoP·PoD · 진술문', R.forpop.compare.positioning.sentence, ['09_concepts', 'b_concept', '09_concept_kit', '10_creative']],
        ['FoR·PoP·PoD · 브레인 보완점', R.forpop.compare.fixes[0], ['09_concepts', '09_concept_kit', '10_creative']],
        ['Concept · 테마', R.concept.theme, ['10_creative']],
        ['Concept · 톤앤매너', R.concept.tone_manner && R.concept.tone_manner.mood && R.concept.tone_manner.mood.desc, ['10_creative']],
        ['C 게이트 · 수정 의견', '테마를 더 짧게', ['09_concepts', '09_concept_kit']],
        ['기본안', R.baseline.overall, ['07_positioning', '08_forpop', '09_concepts', 'b_concept', '10_blueprint', '10_creative']],
        ['사업 범위', R.brief.scope[1].item, ['09_concepts', 'b_concept', '09_concept_kit', '10_blueprint', '10_creative']],
        ['설계서 → 장면', R.creative.blueprint.summary, ['10_creative']],
        ['조형 언어 ← 사조', R.creative.blueprint.form_language.principles[0].becomes, ['10_creative']],
        ['사조 조형 조작', R.airplane.travels[0].form_moves[0].move, ['09_concepts', '10_bp_section', '10_blueprint']],
        ['터널 원문 → 컨셉', R.tunnel.layers[0].insights[0].detail, ['09_concepts', '09_concept_kit', '10_bp_section']],
        ['브레인 방향 · 캔버스', run.brain.canvas && run.brain.canvas.direct && run.brain.canvas.direct.direction, ['02_canvas']],
      ];
      const miss = [];
      for (const [name, v, targets] of LINKS) for (const t of targets) if (!reaches(v, t)) miss.push(`${name} → ${t}`);
      console.log('handoff', LINKS.reduce((n, l) => n + l[2].length, 0) - miss.length, '/', LINKS.reduce((n, l) => n + l[2].length, 0));
      if (miss.length) fail('단계 간 전달 누락: ' + miss.join(' · '));
    }
    const r = report.exportProject(p.id);
    console.log('report', fs.statSync(r.reportPath).size, 'bytes');

    // 영감 → 터널부터 다시
    events.length = 0;
    await orch.inspire(p.id, 'tunnel', '대기 줄 자체를 경험으로 보고 싶다', emit);
    await waitFor((e) => e.kind === 'gate' && e.gate === 'C');
    const r2 = store.get(p.id).run;
    console.log('inspire ok — versions', r2.versions.length, 'inspirations', r2.inspirations.length, 'airplane kept', !!r2.results.airplane, 'tunnel redone', r2.stages.tunnel.status);
    await orch.gate(p.id, 'go', '', emit);
    await waitFor((e) => e.kind === 'done' || e.kind === 'error');

    // PPT
    await orch.reportCore(p.id, emit);
    const ppt = await require(path.join(src, 'report-ppt')).exportPpt(p.id);
    { const R3 = store.get(p.id).run.results; const tm = R3.concept.tone_manner && R3.concept.tone_manner.mood && R3.concept.tone_manner.mood.desc;
      if (!global.__reaches(R3.concept.theme, '11_report') || !global.__reaches(tm, '11_report')) fail('리포트에 컨셉·톤앤매너 누락'); console.log('handoff report ok'); }
    console.log('ppt', ppt.exists, fs.statSync(ppt.file).size, 'bytes');

    // 라이브러리 — 사조 추가
    const lib = require(path.join(src, 'library'));
    const mat = path.join(os.tmpdir(), 'ct-zen.md'); fs.writeFileSync(mat, '# 선 미학\n비움은 집중이다.');
    const ex = await lib.extract('ism', [mat]);
    lib.save('ism', ex.items);
    const kh = await lib.extract('knowhow', [mat]);
    lib.save('knowhow', kh.items, '테스트 노하우');
    const k2 = knowledge.load();
    console.log('library isms', k2.isms.length, 'knowhow', k2.knowhow.length, 'custom', k2.library.map((x) => x.id).join(','));
    if (k2.isms.length !== 17) fail('사조 추가 안 됨');
    console.log('usage', JSON.stringify(require(path.join(src, 'cost')).summary()));
    console.log('ALL OK');
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
