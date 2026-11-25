// THE FROM BRAIN(2.0) 엔진을 그대로 돌린다. 바꾼 것은 모델 공급자뿐 — 호출을 파일로 내보내고 답 파일을 기다린다.
import fs from 'node:fs'; import path from 'node:path';
import { newProject } from '/home/claude/from-i/freative/v2/js/graph/model.js';
import { think, proposeIssues } from '/home/claude/from-i/freative/v2/js/engine/think.js';
import { reportMarkdown } from '/home/claude/from-i/freative/v2/js/engine/report.js';

const DIR = '/tmp/eval/bridge/6x'; fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0; const LOG = [];
const wrap = (t) => t.split('\n').map((l) => { const out = []; while (l.length > 1500) { let k = l.lastIndexOf(' ', 1500); if (k < 800) k = 1500; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); return out.join('\n'); }).join('\n');
const provider = {
  name: 'claude-bridge',
  async json({ role, tier, system, user, task }) {
    const id = String(++seq).padStart(3, '0');
    const body = `# SYSTEM\n\n${wrap(system)}\n\n# USER\n\n${wrap(user)}\n`;
    fs.writeFileSync(path.join(DIR, `${id}.req.md`), body);
    const label = `${task.kind}${task.lens ? ':' + task.lens.id : ''}${task.cluster ? ':' + task.cluster.id + (task.attempt ? ':retry' : '') : ''}${task.kind === 'reframe' && task.attempt ? ':retry' : ''}${task.cand ? ':' + task.cand.id : ''}${task.tag ? ':' + task.tag : ''}`;
    LOG.push({ id, kind: label, role, tier, chars: body.length });
    fs.appendFileSync(path.join(DIR, 'log.txt'), `${id} ${label} ${role} ${tier} ${body.split('\n').length}줄\n`);
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

const project = newProject({
  title: '가전 브랜드 고객 앱 리뉴얼 (가정한 브리프)',
  category: 'integrated',
  brief: {
    what: '중견 생활가전 브랜드의 고객 앱(제품 등록 · AS 접수 · 사용설명서)을 리뉴얼한다',
    purpose: '구매 뒤에도 고객과의 관계를 이어 가서 소모품 매출과 재구매를 늘린다',
    target: '최근 5년 안에 이 브랜드의 가전(공기청정기 · 정수기 · 건조기 등)을 산 30~50대 가구',
    product: '고객 앱. 지금 기능은 제품 등록, AS 접수, 사용설명서, 공지',
    channel: '모바일 앱, 제품에 붙은 QR, 구매 후 문자',
    success: '한 달에 한 번 이상 앱을 여는 고객이 늘어난다',
    note: '제약: 광고성 푸시를 늘리지 않는다. 개발 인력 4명, 기간 6개월. 제품 하드웨어는 바꾸지 않는다.',
  },
  seed: { integrated: { parts: '기획 · 디자인 · 개발이 함께 한다', milestone: '6개월, 중간 점검 2회', touch: '앱, 제품 QR, 구매 후 문자', govern: '브랜드 마케팅팀이 방향을 정한다' } },
  facts: [
    { id: 'F1', kind: 'habit', text: '앱을 설치한 고객 가운데 90일 안에 다시 연 고객은 열 명 중 두 명이다.', sourceType: 'internal', source: '가정한 브리프 — 클라이언트 내부 자료', date: '', url: '', by: 'human', checked: true },
    { id: 'F2', kind: 'habit', text: '앱을 여는 이유는 대부분 AS 접수와 사용설명서 확인이다.', sourceType: 'internal', source: '가정한 브리프 — 클라이언트 내부 자료', date: '', url: '', by: 'human', checked: true },
    { id: 'F3', kind: 'notice', text: '브랜드는 필터 등 소모품 정기배송을 운영하지만 앱에서는 신청할 수 없다.', sourceType: 'internal', source: '가정한 브리프 — 클라이언트 내부 자료', date: '', url: '', by: 'human', checked: true },
    { id: 'F4', kind: 'issue', text: '푸시 알림을 끈 고객이 절반을 넘는다.', sourceType: 'internal', source: '가정한 브리프 — 클라이언트 내부 자료', date: '', url: '', by: 'human', checked: true },
  ],
  issues: [],
  settings: { concurrency: 16 },
});
// 이슈는 엔진이 브리프에서 뽑은 후보를 쓴다 — 사람이 없으므로 근본 이슈 첫 후보와 그 밖의 후보 2건
const proposed = await proposeIssues(project, provider);
// 목적과 성공 기준을 다 덮는다고 적힌 근본 이슈 후보를 먼저 쓴다
const rootC = proposed.find((i) => i.root && !i.misses) || proposed.find((i) => i.root) || proposed[0];
project.issues = [{ id: 'I1', root: true, title: rootC.title, detail: rootC.detail, test: rootC.test || '이 안이 있으면 고객이 한 달에 한 번 이상 앱을 여는가?', tags: [] }, ...proposed.filter((i) => i !== rootC && !i.root).slice(0, 2).map((i, n) => ({ id: `I${n + 2}`, root: false, title: i.title, detail: i.detail, test: '', tags: [] }))];
fs.writeFileSync(path.join(DIR, 'issues.json'), JSON.stringify({ proposed, used: project.issues }, null, 1));
project.run = await think(project, provider, { onEvent: (e) => { if (e.type === 'stage') console.log('stage', e.stage, '| calls', LOG.length); } });
fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ project, log: LOG }, null, 1));
fs.writeFileSync(path.join(DIR, 'REPORT.md'), reportMarkdown(project));
console.log('DONE | calls', LOG.length, '| insights', project.run.insights.map((i) => `${i.title}(${i.check.ok ? 'ok' : 'flag'})`).join(' / '));
process.exit(0);
