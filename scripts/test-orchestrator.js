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
      target: '주말 성수동을 걷는 20~30대', product: '제주 로컬 커피 브랜드 겨울 원두', channel: '오프라인', devices: ['옥외·사이니지'], keyMoment: '', depth: 'gate', nowFocus: '요즘 기다리는 시간이 자꾸 눈에 밟힌다',
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
    // 근본 이슈 확정 — 사람이 후보를 고쳐 쓴다
    await waitFor((e) => e.kind === 'gate' && e.gate === 'root');
    { const rb = store.get(p.id).run.results.brief; console.log('root candidates', rb.root_issue.candidates.length, '| recommended', rb.root_issue.recommended); if (rb.root_issue.candidates.length < 2) fail('근본 이슈 후보가 2개 미만'); }
    events.length = 0;
    await orch.answerRoot(p.id, { issue: '지나가던 사람이 산지 거리를 몸으로 지나오며 걸음을 멈춘다', test: '커피를 살 생각이 없던 사람도 멈추는가?' }, emit);
    // 생각의 회차 — 중간 리뷰 세 번: 비틀어 → 이 질문으로 가자 → 지금 안으로
    const answers = [{ choice: 'twist', text: '숫자보다 몸으로 느끼게' }, { choice: 'question' }, { choice: 'done' }];
    for (let i = 0; i < answers.length; i++) {
      await waitFor((e) => e.kind === 'gate' && e.gate === 'review');
      const T = store.get(p.id).run.results.think;
      const c = T.rounds[T.rounds.length - 1].card;
      console.log(`review ${T.rounds.length} | now: ${c.now.slice(0, 40)} | Q: ${c.question.slice(0, 40)} (${c.type}→${c.leads_to})`);
      if (!c.now || !c.snag || !c.question || !c.if_yes) fail('리뷰 카드 줄 누락');
      if ((c.now + c.snag + c.question + c.if_yes).length > 520) fail('리뷰 카드가 너무 길다');
      events.length = 0;
      await orch.answerReview(p.id, answers[i], emit);
    }
    await waitFor((e) => e.kind === 'gate' && e.gate === 'C');
    { const rr = store.get(p.id).run; const retried = rr.agents.filter((x) => x.stage === 'think' && /규칙 맞춰 다시/.test(x.task || '')).length; console.log('round rule retry', retried, '| round3 main move', rr.results.think.rounds[2].painter.moves[0].move); if (retried !== 1 || rr.results.think.rounds[2].painter.moves[0].move === '비틀기') fail('회차 규칙 코드 검사가 다시 두게 하지 않음'); }
    { const ps = store.get(p.id).run.polishStats || {}; console.log('polishStats', JSON.stringify(Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, `${v.sent}/${v.sentences} ${v.before}→${v.after}`])))); if (!ps.concept || ps.concept.sent > ps.concept.sentences) fail('교열 통계 없음'); }
    { const voice = require(path.join(src, 'voice')); const h = voice.lint('길을 알고 나면, 잎 하나가 달라 보입니다. 특별한 경험을 제공합니다.'); console.log('voice', h.map((x) => x.kind).join(',')); if (h.length < 3 || voice.lint('월말 알림이 이번 달 가장 큰 지출 세 건을 보여 줍니다.').length) fail('AI투 검사기 오작동'); }
    { const T = store.get(p.id).run.results.think; console.log('think rounds', T.rounds.length, '| answers', T.rounds.map((r) => r.answer && r.answer.choice).join('→'), '| final', (T.final && T.final.idea || '').slice(0, 40)); if (T.rounds.length !== 3 || !T.final) fail('생각의 회차 흐름 이상'); }
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
        ['지금의 나', '요즘 기다리는 시간이 자꾸 눈에 밟힌다', ['01_brief', '02_canvas', '12_round']],
        ['근본 이슈 (사람 확정)', run.root.issue, ['12_round', 'b_round', '07_positioning', '08_forpop', '09_concepts', '10_bp_section', '10_creative', 'b_verify']],
        ['회차 · 사람의 답', '숫자보다 몸으로 느끼게', ['12_round']],
        ['회차 · 찌르는 질문', R.think.rounds[0].card.question, ['12_round', '07_positioning', '08_forpop']],
        ['회차 · 최선', R.think.final.idea, ['07_positioning', '08_forpop', '09_concepts', '10_bp_section', '10_blueprint']],
        ['터널 → 회차', R.tunnel.synth.exit_light, ['12_round']],
        ['브레인 방향 · 캔버스', run.brain.canvas && run.brain.canvas.direct && run.brain.canvas.direct.direction, ['02_canvas']],
      ];
      const miss = [];
      for (const [name, v, targets] of LINKS) for (const t of targets) if (!reaches(v, t)) miss.push(`${name} → ${t}`);
      console.log('handoff', LINKS.reduce((n, l) => n + l[2].length, 0) - miss.length, '/', LINKS.reduce((n, l) => n + l[2].length, 0));
      if (miss.length) fail('단계 간 전달 누락: ' + miss.join(' · '));
    }
    const r = report.exportProject(p.id);
    console.log('report', fs.statSync(r.reportPath).size, 'bytes');
    // 비용·중복·사실 가드
    {
      const R = run.results;
      const md = fs.readFileSync(r.reportPath, 'utf8');
      const ids = new Set(R.brief.plan.isms.map((x) => x.id));
      const contrast = R.brief.plan.isms.find((x) => x.contrast);
      const redo = R.airplane.travels.filter((t) => t.redo);
      const ledger = R.creative.blueprint.ledger;
      const crCalls = run.agents.filter((a) => a.stage === 'creative' && /설계 \(/.test(a.name)).length;
      const anatN = R.creative.blueprint.sections.length;
      console.log('isms', [...ids].join(','), '| contrast', contrast ? `${contrast.id}↔${contrast.contrast.with}` : '-', '| ism redo', redo.map((t) => t.id).join(',') || '-', '| ledger rules', ledger && ledger.rules.length, '| section calls', crCalls, '/', anatN, '| factStats', JSON.stringify(Object.fromEntries(Object.entries(run.factStats || {}).map(([k, v]) => [k, v.numbers]))));
      if (!contrast && !R.brief.plan.isms.some((x) => /대립/.test(x.why || ''))) { /* 화가가 이미 짝을 골랐으면 통과 */ }
      if (!ledger || !ledger.rules.length) fail('설계 원장이 없음');
      if (!redo.length) fail('겹친 사조 조작을 다시 두지 않음');
      if (crCalls > anatN * 2) fail(`설계 절 호출이 너무 많음 (${crCalls})`);
      if (/예비 판정입니다/.test(md.split('\n').slice(3).join('\n'))) fail('본문에 예비 판정 고지가 남음');
      if (!/## 11\. 검증 계획/.test(md)) fail('검증 계획이 보고서에 없음');
      if ((md.match(/\*\*확인할 것\*\*/g) || []).length) fail('확인할 것이 본문에 흩어져 있음');
      // 대립 사조 — 기능주의 넷만 고르면 반대편이 들어간다
      {
        const md2 = knowledge.load().files['skill/references/catalog-ism.md'];
        const pairs = [];
        for (const line of (md2.split(/^## A-99/m)[1] || '').split('\n')) { const m = line.match(/^\|\s*([^|]+?)\s*\|\s*`(ISM-[A-Z]+)`\s*([^|]*)\|\s*`(ISM-[A-Z]+)`\s*([^|]*)\|/); if (m) pairs.push({ issue: m[1], a: m[2], aSays: m[3], b: m[4], bSays: m[5] }); }
        const plan = { isms: [{ id: 'ISM-SWISS' }, { id: 'ISM-BAUHAUS' }, { id: 'ISM-ARTCRAFT' }, { id: 'ISM-NOUVEAU' }] };
        const added = orch.ensureContrast(plan, pairs, new Set(knowledge.load().isms.map((i) => i.id)));
        console.log('contrast pairs', pairs.length, '| added', added && `${added.id} (${added.contrast.issue})`);
        if (pairs.length < 6 || !added) fail('대립 사조를 넣지 않음');
      }
      // 수치 가드 단위 시험
      const facts = require(path.join(src, 'facts'));
      const g = facts.guardText('몸체 900~1200mm, 경사 3~5°, 보관 30일, WCAG 4.5:1 대비, 브리프의 2.4m 폭', facts.sourceIndex(['통로 폭 2.4m']));
      console.log('fact guard', g.text, '| hits', g.hits.join(','));
      if (/900|3~5°|30일/.test(g.text) || !/2\.4m/.test(g.text) || !/4\.5:1/.test(g.text)) fail('수치 가드 오동작');
      if (facts.stripBoiler('FREATIVE의 예비 판정입니다. T4를 고른다. 출처: 브리프·추론.') !== 'T4를 고른다.') fail('고지 문구 정리 오동작');
    }

    // 영감 → 터널부터 다시 (이번엔 중간 리뷰 자동 진행)
    require(path.join(src, 'settings')).set({ run: { midReview: 'auto', maxRounds: 3 } });
    process.env.CT_MOCK_FAIL_ROUND = '3'; // 자동 회차 3회차가 실패해도 2회차 최선으로 이어 가는지
    events.length = 0;
    await orch.inspire(p.id, 'tunnel', '대기 줄 자체를 경험으로 보고 싶다', emit);
    await waitFor((e) => e.kind === 'gate' && e.gate === 'C');
    const r2 = store.get(p.id).run;
    delete process.env.CT_MOCK_FAIL_ROUND;
    { const T = r2.results.think; console.log('auto rounds', T.rounds.length, '| final from', T.final && T.final.from_round, '| warnings', (r2.warnings || []).filter((w) => w.stage === 'think').length); if (!T.final || T.rounds.length !== 2 || T.final.from_round !== 2) fail('회차 실패 뒤 이어 가기 실패'); }
    { const u = require(path.join(src, 'cost')).summary({ includeMock: true }); console.log('cost byProject', u.byProject.length, u.byProject[0] && u.byProject[0].name, u.byProject[0] && u.byProject[0].calls, '| byDay', u.byDay.length); if (!u.byProject.length || !u.byDay.length || u.byProject[0].name !== '겨울 원두 팝업') fail('비용 프로젝트별·일별 집계 실패'); }
    console.log('inspire ok — versions', r2.versions.length, 'inspirations', r2.inspirations.length, 'airplane kept', !!r2.results.airplane, 'tunnel redone', r2.stages.tunnel.status);
    await orch.gate(p.id, 'go', '', emit);
    await waitFor((e) => e.kind === 'done' || e.kind === 'error');

    // PPT
    await orch.reportCore(p.id, emit);
    const ppt = await require(path.join(src, 'report-ppt')).exportPpt(p.id);
    { const R3 = store.get(p.id).run.results; const tm = R3.concept.tone_manner && R3.concept.tone_manner.mood && R3.concept.tone_manner.mood.desc;
      if (!global.__reaches(R3.concept.theme, '11_report') || !global.__reaches(tm, '11_report')) fail('리포트에 컨셉·톤앤매너 누락'); console.log('handoff report ok'); }
    console.log('ppt', ppt.exists, fs.statSync(ppt.file).size, 'bytes');

    // 프로젝트 파일(.freative) — 내보내기 → 가져오기 → 과정 다시 보기
    {
      const pkg = require(path.join(src, 'package'));
      const buf = await pkg.exportPackage(p.id, { withAttachments: false, by: '테스터', appVersion: 'test' });
      const user2 = await require(path.join(src, 'services/auth')).current();
      const imp = await pkg.importPackage(buf, user2);
      const src0 = store.get(p.id), got = store.get(imp.id);
      const img = got.run.results.creative.examples.find((e) => e.image);
      const imgFile = img && store.resolveProjectFile(imp.id, img.image.replace(`ct://project/${imp.id}/`, ''));
      console.log('package', buf.length, 'bytes | imported', imp.id, '| image rewired', !!(img && img.image.includes(imp.id)), '| file', !!imgFile, '| attachments', got.attachments.map((a) => a.excluded ? 'excluded' : a.name).join(','));
      if (!img || !img.image.includes(`ct://project/${imp.id}/`) || !imgFile) fail('가져온 프로젝트의 이미지 주소·파일이 이어지지 않음');
      if (JSON.stringify(got).includes(`ct://project/${p.id}/`)) fail('원래 프로젝트 주소가 남음');
      if (!got.imported || got.imported.exportedBy !== '테스터' || got.attachments.some((a) => a.rel)) fail('가져온 정보·첨부 제외 처리 이상');
      if (got.run.agents.length !== src0.run.agents.length || got.run.results.think.rounds.length !== src0.run.results.think.rounds.length) fail('실행 기록이 그대로 옮겨지지 않음');
      try { await pkg.importPackage(Buffer.from('not a zip'), user2); fail('잘못된 파일을 받아들임'); } catch (e) { if (!/FREATIVE 프로젝트 파일이 아닙니다/.test(e.message)) fail('잘못된 파일 오류 문구'); }
      // 과정 다시 보기 — 렌더러 모듈을 그대로 불러 시각별 상태를 확인
      const tmp = path.join(os.tmpdir(), `replay-${Date.now()}`); fs.mkdirSync(tmp);
      fs.writeFileSync(path.join(tmp, 'util.mjs'), fs.readFileSync(path.join(src, '../renderer/js/util.js'), 'utf8'));
      fs.writeFileSync(path.join(tmp, 'replay.mjs'), fs.readFileSync(path.join(src, '../renderer/js/replay.js'), 'utf8').replace("'./util.js'", "'./util.mjs'"));
      const rp = await import(require('url').pathToFileURL(path.join(tmp, 'replay.mjs')).href);
      const run = got.run, tl = rp.buildTimeline(run);
      const at = (f) => rp.snapshot(run, rp.realAt(tl, tl.total * f));
      const s0 = at(0), sMid = at(0.5), sEnd = at(1);
      const doneN = (x) => Object.values(x.stages).filter((v) => v.status === 'done').length;
      console.log('replay events', tl.r.length, '| virtual', Math.round(tl.total / 1000) + 's | done stages 0%', doneN(s0), '50%', doneN(sMid), '100%', doneN(sEnd), '| agents', s0.agents.length, sMid.agents.length, sEnd.agents.length, '| think rounds mid', (sMid.results.think || { rounds: [] }).rounds.length);
      if (!(doneN(s0) < doneN(sMid) && doneN(sMid) <= doneN(sEnd)) || doneN(sEnd) < 8) fail('다시 보기 단계 진행이 시간 순서와 맞지 않음');
      if (s0.results.creative || !sEnd.results.creative || sEnd.agents.some((a) => a.status === 'working')) fail('다시 보기 결과 노출 시점 이상');
      // 영감으로 다시 그리기 전 — 그때의 결과(versions)와 단계 상태가 보여야 한다
      const vAt = Date.parse(run.versions[0].at) - 1, sV = rp.snapshot(run, vAt);
      console.log('replay before inspire', 'concept', sV.stages.concept.status, '| tunnel exit', (sV.results.tunnel && sV.results.tunnel.synth && sV.results.tunnel.synth.exit_light || '').slice(0, 20), '| stageLog', run.stageLog.length);
      if (!['done', 'waiting'].includes(sV.stages.concept.status) || !sV.results.concept) fail('다시 보기 — 영감 전 상태가 복원되지 않음');
      const firstTunnel = run.stageLog.find((e) => e.id === 'tunnel' && e.ev === 'start');
      const tTunnel = Date.parse(firstTunnel.at) + 1, sT = rp.snapshot(run, tTunnel);
      if (sT.results.positioning || sT.stages.tunnel.status !== 'running') fail('다시 보기 — 터널 진행 중에 뒤 단계 결과가 보임');
    }

    // 이미지 그리기 — 자동 생성이 꺼져 있어도 '그리기'는 그린다 · 직접 지정에서 이미지 칸에 글 모델이 들어가도 이미지 모델로 부른다
    {
      const settings = require(path.join(src, 'settings'));
      const before = JSON.parse(JSON.stringify(settings.get()));
      settings.set({ run: { generateImages: false }, openai: { followRecommended: false, autoModel: false, stages: {}, imagePool: [], models: { ...before.openai.models, image: 'gpt-6-astra' } } });
      const pr = store.get(p.id);
      const ex0 = pr.run.results.creative.examples[0];
      const oldImg = ex0.image;
      const r = await orch.regenerateImage(p.id, 0, emit);
      const after = store.get(p.id);
      const img = after.run.agents.filter((a) => a.role === 'image').pop();
      console.log('regen', JSON.stringify(r), '| model', img.model, '|', img.why, '| changed', after.run.results.creative.examples[0].image !== oldImg);
      if (!r.ok || !/gpt-image/.test(img.model) || after.run.results.creative.examples[0].image === oldImg) fail('그리기 — 이미지가 다시 그려지지 않음');
      let threw = false; try { await orch.regenerateImage(p.id, 99, emit); } catch { threw = true; }
      if (!threw) fail('없는 예시 그리기가 조용히 지나감');
      settings.set({ run: { generateImages: before.run.generateImages }, openai: { followRecommended: before.openai.followRecommended, autoModel: before.openai.autoModel, stages: before.openai.stages || {}, imagePool: before.openai.imagePool || [], models: before.openai.models } });
    }

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
