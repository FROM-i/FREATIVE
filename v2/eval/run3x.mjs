// THE FROM BRAIN(2.0) 엔진을 그대로 돌린다. 바꾼 것은 모델 공급자뿐 — 호출을 파일로 내보내고 답 파일을 기다린다.
import fs from 'node:fs'; import path from 'node:path';
import { newProject } from '/home/claude/from-i/freative/v2/js/graph/model.js';
import { think, proposeIssues } from '/home/claude/from-i/freative/v2/js/engine/think.js';
import { reportMarkdown } from '/home/claude/from-i/freative/v2/js/engine/report.js';

const DIR = '/tmp/eval/bridge/3x'; fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0; const LOG = [];
const wrap = (t) => t.split('\n').map((l) => { const out = []; while (l.length > 1500) { let k = l.lastIndexOf(' ', 1500); if (k < 800) k = 1500; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); return out.join('\n'); }).join('\n');
const provider = {
  name: 'claude-bridge',
  async json({ role, system, user, task }) {
    const id = String(++seq).padStart(3, '0');
    const body = `# SYSTEM\n\n${wrap(system)}\n\n# USER\n\n${wrap(user)}\n`;
    fs.writeFileSync(path.join(DIR, `${id}.req.md`), body);
    const label = `${task.kind}${task.lens ? ':' + task.lens.id : ''}${task.cluster ? ':' + task.cluster.id + (task.attempt ? ':retry' : '') : ''}${task.cand ? ':' + task.cand.id : ''}${task.tag ? ':' + task.tag : ''}`;
    LOG.push({ id, kind: label, role, chars: body.length });
    fs.appendFileSync(path.join(DIR, 'log.txt'), `${id} ${label} ${role} ${body.split('\n').length}줄\n`);
    const resFile = path.join(DIR, `${id}.res.json`);
    for (;;) {
      if (fs.existsSync(resFile)) {
        await sleep(300);
        try { const raw = fs.readFileSync(resFile, 'utf8'); return { json: JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)), usage: null }; }
        catch (e) { fs.renameSync(resFile, `${resFile}.bad`); fs.writeFileSync(path.join(DIR, `${id}.err`), String(e.message)); }
      }
      await sleep(1000);
    }
  },
};

const form = JSON.parse(fs.readFileSync('/tmp/eval/form.json', 'utf8'));
const root = JSON.parse(fs.readFileSync('/tmp/eval/root.json', 'utf8'));   // 1.x가 확정한 근본 이슈를 그대로 쓴다
const project = newProject({
  title: form.projectName,
  brief: {
    what: `${form.product} · 범위: ${form.deliverableNote} · 결과물 유형: UI/UX`,
    purpose: `${form.purposes.join(', ')} — ${form.purposeNote}`,
    target: form.target, product: form.product, channel: `${form.channel} · ${form.devices.join(', ')}`,
    note: `핵심 순간: ${form.keyMoment}\n브랜드: ${form.brand}\n제약·금지: ${form.constraints}\n비교 대상: ${form.references}`,
  },
  issues: [{ id: 'I1', root: true, title: root.issue, detail: `과업: ${root.task || ''} → 목적: ${root.purpose || ''}`, test: root.test }],
  settings: { concurrency: 16 },
});
// 이슈는 앞선 2.0 실행과 같은 것을 쓴다 (비교를 위해). 팩트북은 직접 조사한 md를 읽는다.
const used = JSON.parse(fs.readFileSync('/tmp/eval/bridge/2x/issues.json', 'utf8')).used;
project.issues = used.map((i) => ({ tags: [], ...i }));
project.category = 'service';
project.seed = { service: { status: '앱인토스 미니앱으로 런칭해 운영 중', segment: '토스 앱 이용자 — 성향 분석을 하는 사람과 공개된 결과에 댓글을 다는 사람' } };
const { parseFactbook } = await import('/home/claude/from-i/freative/v2/knowledge/facts.js');
project.facts = parseFactbook(fs.readFileSync('/home/claude/from-i/freative/v2/eval/factbook-앱인토스.md', 'utf8'));
console.log('issues', project.issues.length, 'facts', project.facts.length);
project.run = await think(project, provider, { onEvent: (e) => { if (e.type === 'stage') console.log('stage', e.stage, '| calls', LOG.length); } });
fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ project, log: LOG }, null, 1));
fs.writeFileSync(path.join(DIR, 'REPORT.md'), reportMarkdown(project));
console.log('DONE | calls', LOG.length, '| insights', project.run.insights.map((i) => `${i.title}(${i.check.ok ? 'ok' : 'flag'})`).join(' / '));
process.exit(0);
