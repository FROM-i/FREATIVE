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

    const prompts = Object.keys(k.files).filter((f) => /^prompts\/(\d+_|b_|lib_|s_).+\.md$/.test(f));
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
    if (!fpr.compare.scopes.every((x) => x.series.every((se) => se.values.length === fpr.compare.legend.axes.length))) fail('공통 범례 축 수 불일치');
    if (!fpr.compare.positioning || !fpr.compare.positioning.sentence) fail('포지셔닝 진술문 없음');
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
