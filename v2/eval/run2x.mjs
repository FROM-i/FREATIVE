// THE FROM BRAIN(2.0) 엔진을 그대로 돌린다. 바꾼 것은 모델 공급자뿐 — 호출을 파일로 내보내고 답 파일을 기다린다.
import fs from 'node:fs'; import path from 'node:path';
import { newProject } from '/home/claude/from-i/freative/v2/js/graph/model.js';
import { think, proposeIssues } from '/home/claude/from-i/freative/v2/js/engine/think.js';
import { reportMarkdown } from '/home/claude/from-i/freative/v2/js/engine/report.js';

const DIR = '/tmp/eval/bridge/2x'; fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0; const LOG = [];
const wrap = (t) => t.split('\n').map((l) => { const out = []; while (l.length > 1500) { let k = l.lastIndexOf(' ', 1500); if (k < 800) k = 1500; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); return out.join('\n'); }).join('\n');
const provider = {
  name: 'claude-bridge',
  async json({ role, system, user, task }) {
    const id = String(++seq).padStart(3, '0');
    const body = `# SYSTEM\n\n${wrap(system)}\n\n# USER\n\n${wrap(user)}\n`;
    fs.writeFileSync(path.join(DIR, `${id}.req.md`), body);
    const label = `${task.kind}${task.lens ? ':' + task.lens.id : ''}${task.cluster ? ':' + task.cluster.id + (task.attempt ? ':retry' : '') : ''}`;
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
// 2.0의 첫 걸음 — 브리프에서 이슈 후보를 뽑는다. 사람이 없으므로 근본 이슈가 아닌 후보 앞의 2건을 그대로 더한다.
const proposed = await proposeIssues(project, provider);
proposed.filter((i) => !i.root).slice(0, 2).forEach((i, n) => project.issues.push({ id: `I${n + 2}`, root: false, title: i.title, detail: i.detail, test: '' }));
fs.writeFileSync(path.join(DIR, 'issues.json'), JSON.stringify({ proposed, used: project.issues }, null, 1));
project.run = await think(project, provider, { onEvent: (e) => { if (e.type === 'stage') console.log('stage', e.stage, '| calls', LOG.length); } });
fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ project, log: LOG }, null, 1));
fs.writeFileSync(path.join(DIR, 'REPORT.md'), reportMarkdown(project));
console.log('DONE | calls', LOG.length, '| insights', project.run.insights.map((i) => `${i.title}(${i.check.ok ? 'ok' : 'flag'})`).join(' / '));
process.exit(0);
