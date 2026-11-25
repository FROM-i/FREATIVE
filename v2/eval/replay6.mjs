// 5x의 결선 통과안 3개와 그때 받은 공격을 그대로 두고, 기조 세우기 → 기조를 지킨 보완(하나씩) → 기조 확인만 다시 돌린다.
import fs from 'node:fs'; import path from 'node:path';
import { revisePrompt, stancePrompt, holdPrompt } from '/home/claude/from-i/freative/v2/knowledge/prompts-arena.js';
import { tierOf } from '/home/claude/from-i/freative/v2/knowledge/orchestration.js';
const DIR = '/tmp/eval/bridge/6r'; fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f) => { const raw = fs.readFileSync(f, 'utf8'); return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); };
const R = J('bridge/5x/RESULT.json'); const project = R.project; const run = project.run;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
let seq = 0;
const ask = async (p, kind, label) => { const id = String(++seq).padStart(3, '0'); fs.writeFileSync(path.join(DIR, `${id}.req.md`), `# SYSTEM\n\n${p.system}\n\n# USER\n\n${p.user}\n`); fs.appendFileSync(path.join(DIR, 'log.txt'), `${id} ${label} - ${tierOf({ kind })}\n`); const f = path.join(DIR, `${id}.res.json`); for (;;) { if (fs.existsSync(f)) { await sleep(300); try { return J(f); } catch { fs.renameSync(f, `${f}.bad`); } } await sleep(1000); } };
const byLens = new Map(run.proposals.map((p) => [p.lens, p]));
const cross = ['023', '024', '025', '026', '027'].map((id) => J(`bridge/5x/${id}.res.json`));
const pick = (id, lens) => { const c = run.arena.candidates.find((x) => x.id === id); const src = lens ? byLens.get(lens) : cross.find((x) => text(x.title) === c.title || text(x.concept) === c.concept); return { id, title: c.title, concept: c.concept, visual: text(src.visual), gain: text(src.gain), where: c.from }; };
const winners = [pick('K20', null), pick('K11', 'ID-INERTIA'), pick('K8', 'ISM-BAUHAUS')];
const attacks = { K20: J('bridge/5x/045.res.json'), K11: J('bridge/5x/046.res.json'), K8: J('bridge/5x/047.res.json') };
const sraw = await ask(stancePrompt(project, winners), 'stance', 'stance');
for (const c of winners) { const x = (sraw.stances || []).find((y) => y.id === c.id); c.stance = { bet: text(x?.bet), device: text(x?.device), givesUp: text(x?.gives_up) }; }
const done = [];
for (const c of winners) {
  const a = attacks[c.id]; const attack = { attacks: a.attacks.map((x) => ({ from: text(x.from), hit: text(x.hit), severity: x.severity })), keep: text(a.keep) };
  const others = winners.filter((w) => w !== c).map((w) => { const v = done.find((d) => d.id === w.id) || w; return { title: v.title, concept: v.concept, bet: w.stance.bet, device: w.stance.device }; });
  const r = await ask(revisePrompt(project, c, attack, run.baseline, others, c.stance), 'revise', `revise:${c.id}`);
  done.push({ id: c.id, title: text(r.title) || c.title, concept: text(r.concept), visual: text(r.visual) || c.visual, gain: text(r.gain) || c.gain, responses: r.responses || [], open: r.open || [], attacks: attack.attacks.length });
}
const h = await ask(holdPrompt(project, winners.map((c) => ({ id: c.id, stance: { 거는_것: c.stance.bet, 핵심_장치: c.stance.device }, before: c, after: done.find((d) => d.id === c.id) }))), 'hold', 'hold');
fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ winners, revised: done, checks: h.checks, groups: h.groups }, null, 1));
console.log('DONE'); process.exit(0);
