'use strict';
// FREATIVE 1.x 오케스트레이터를 원본 그대로 돌린다. 바꾼 것은 둘뿐: electron 대역, 모델 공급자.
//   node run1x.js mock     → 호출 수 확인
//   node run1x.js bridge   → 호출을 파일로 내보내고 답 파일을 기다린다 (Claude 인스턴스가 답한다)
const path = require('path'); const fs = require('fs');
const MODE = process.argv[2] || 'mock';
const TAG = process.argv[3] || MODE;
const SRC = '/home/claude/from-i/freative/src/main';
const DIR = `/tmp/eval/bridge/1x-${TAG}`; fs.mkdirSync(DIR, { recursive: true });
process.env.EVAL_USERDATA = `/tmp/eval/userdata-${TAG}`; fs.rmSync(process.env.EVAL_USERDATA, { recursive: true, force: true }); fs.mkdirSync(process.env.EVAL_USERDATA, { recursive: true });
process.env.CT_MOCK_SPEED = '0.001';

const settings = require(path.join(SRC, 'settings')); settings.init();
// 평가 조건: 웹 정찰·이미지 끔(2.0에 없다) · 중간 리뷰 자동(사람 없음) · 지식 동기화 끔(로컬 내장본). 브레인·교열·회차는 기본값 그대로.
settings.set({ knowledge: { autoSync: false }, run: { webSearch: false, generateImages: false, midReview: 'auto', maxParallel: 8 } });
const store = require(path.join(SRC, 'services/storage')); store.init();
const knowledge = require(path.join(SRC, 'knowledge')); knowledge.init();
const providers = require(path.join(SRC, 'providers'));
const LOG = [];
const text = (o) => (o.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
let seq = 0;
if (MODE === 'mock') {
  providers.setMock(true);
  const mock = require(path.join(SRC, 'providers/mock'));
  const orig = mock.chat; mock.chat = async (o) => { fs.writeFileSync(path.join(DIR, `${String(++seq).padStart(3, '0')}.req.md`), `# SYSTEM\n\n${o.system}\n\n# USER\n\n${text(o)}\n`); LOG.push({ prompt: o.meta.prompt, stage: o.meta.stage, role: o.role, chars: (o.system || '').length + text(o).length }); return orig(o); };
  mock.search = undefined;
} else {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bridge = {
    async chat(o) {
      const id = String(++seq).padStart(3, '0');
      // 한 줄이 너무 길면 읽는 쪽에서 잘린다 — 공백에서 줄을 나눈다 (내용은 그대로)
      const wrap = (t) => t.split('\n').map((l) => { const out = []; while (l.length > 1500) { let k = l.lastIndexOf(' ', 1500); if (k < 800) k = 1500; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); return out.join('\n'); }).join('\n');
      const body = `# SYSTEM\n\n${wrap(o.system || '')}\n\n# USER\n\n${wrap(text(o))}\n`;
      fs.writeFileSync(path.join(DIR, `${id}.req.md`), body);
      LOG.push({ id, prompt: o.meta.prompt, stage: o.meta.stage, role: o.role, chars: body.length });
      fs.appendFileSync(path.join(DIR, 'log.txt'), `${id} ${o.meta.stage} ${o.meta.prompt} ${o.role} ${body.split('\n').length}줄\n`);
      const resFile = path.join(DIR, `${id}.res.json`);
      for (;;) {
        if (fs.existsSync(resFile)) {
          await sleep(300);
          try { const raw = fs.readFileSync(resFile, 'utf8'); const s = raw.indexOf('{'); const e = raw.lastIndexOf('}'); return { json: JSON.parse(raw.slice(s, e + 1)), model: 'claude', usage: null }; }
          catch (err) { fs.renameSync(resFile, `${resFile}.bad`); fs.writeFileSync(path.join(DIR, `${id}.err`), String(err.message)); }
        }
        if (o.signal && o.signal.aborted) throw new Error('취소됨');
        await sleep(1000);
      }
    },
  };
  providers.get = () => bridge;
}

(async () => {
  const orch = require(path.join(SRC, 'orchestrator'));
  const user = await require(path.join(SRC, 'services/auth')).current();
  const briefFile = '/tmp/eval/brief.md';
  const p = store.create(user, JSON.parse(fs.readFileSync('/tmp/eval/form.json', 'utf8')), [briefFile]);
  const state = () => fs.writeFileSync(path.join(DIR, 'state.json'), JSON.stringify({ calls: LOG.length, last: LOG[LOG.length - 1], at: new Date().toISOString() }));
  const done = (why) => {
    const run = store.get(p.id).run;
    fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ why, root: run.root, results: run.results, brain: run.brain, gates: run.gates, log: LOG }, null, 1));
    const by = {}; for (const l of LOG) by[l.prompt] = (by[l.prompt] || 0) + 1;
    console.log('DONE', why, '| calls', LOG.length, JSON.stringify(by));
    process.exit(0);
  };
  const emit = (e) => {
    state();
    if (e.kind === 'error') { console.log('ERROR', e.error); done('error: ' + e.error); }
    if (e.kind === 'gate') {
      console.log('gate', e.gate, '| calls so far', LOG.length);
      if (e.gate === 'brief') {
        const q = store.get(p.id).run.results.brief.questions || [];
        fs.writeFileSync(path.join(DIR, 'gate-brief.json'), JSON.stringify(q, null, 1));
        const wait = setInterval(() => { const f = path.join(DIR, 'gate-brief.answer.json'); if (MODE === 'mock' || fs.existsSync(f)) { clearInterval(wait); orch.answerBrief(p.id, MODE === 'mock' ? { Q1: '납득', Q2: '틈' } : JSON.parse(fs.readFileSync(f, 'utf8')), emit); } }, 500);
      }
      // 근본 이슈 — 사람 대신 모델이 추천한 후보를 그대로 확정한다 (2.0에도 같은 이슈를 넣는다)
      if (e.gate === 'root') { const ri = store.get(p.id).run.results.brief.root_issue; const id = ri.recommended || (ri.candidates[0] || {}).id; const pick = ri.candidates.find((c) => c.id === id) || ri.candidates[0]; fs.writeFileSync('/tmp/eval/root.json', JSON.stringify({ issue: pick.issue, test: pick.test, task: ri.task, purpose: ri.purpose }, null, 1)); console.log('root →', id); orch.answerRoot(p.id, { id }, emit); }
      if (e.gate === 'C') done('C gate');
    }
    if (e.kind === 'done') done('done');
  };
  await orch.start(p.id, emit);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
