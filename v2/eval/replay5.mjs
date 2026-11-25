// 5x의 결선 통과안 3개와 그때 받은 공격을 그대로 두고, 고친 엔진의 보완(다른 최종안을 보고 하나씩) → 같은 해법 재확인만 다시 돌린다.
import fs from 'node:fs'; import path from 'node:path';
import { revisePrompt, distinctPrompt } from '/home/claude/from-i/freative/v2/knowledge/prompts-arena.js';
const DIR = '/tmp/eval/bridge/5r'; fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f) => { const raw = fs.readFileSync(f, 'utf8'); return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); };
const R = J('bridge/5x/RESULT.json'); const project = R.project; const run = project.run;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
let seq = 0;
const ask = async (p, label, tier) => { const id = String(++seq).padStart(3, '0'); fs.writeFileSync(path.join(DIR, `${id}.req.md`), `# SYSTEM\n\n${p.system}\n\n# USER\n\n${p.user}\n`); fs.appendFileSync(path.join(DIR, 'log.txt'), `${id} ${label} - ${tier}\n`); const f = path.join(DIR, `${id}.res.json`); for (;;) { if (fs.existsSync(f)) { await sleep(300); try { return J(f); } catch { fs.renameSync(f, `${f}.bad`); } } await sleep(1000); } };
const byLens = new Map(run.proposals.map((p) => [p.lens, p]));
const cross = ['023', '024', '025', '026', '027'].map((id) => J(`bridge/5x/${id}.res.json`));
const pick = (id, lens) => { const c = run.arena.candidates.find((x) => x.id === id); const src = lens ? byLens.get(lens) : cross.find((x) => text(x.title) === c.title || text(x.concept) === c.concept); if (!src) throw new Error(`원본 없음 ${id}`); return { id, title: c.title, concept: c.concept, visual: text(src.visual), gain: text(src.gain) }; };
const winners = [pick('K20', null), pick('K11', 'ID-INERTIA'), pick('K8', 'ISM-BAUHAUS')];
const attacks = { K20: J('bridge/5x/045.res.json'), K11: J('bridge/5x/046.res.json'), K8: J('bridge/5x/047.res.json') };
const done = [];
for (const c of winners) {
  const a = attacks[c.id]; const attack = { attacks: a.attacks.map((x) => ({ from: text(x.from), hit: text(x.hit), severity: x.severity })), keep: text(a.keep) };
  const others = winners.filter((w) => w !== c).map((w) => { const v = done.find((d) => d.id === w.id) || w; return { title: v.title, concept: v.concept }; });
  const r = await ask(revisePrompt(project, c, attack, run.baseline, others), `revise:${c.id}`, 'make');
  done.push({ id: c.id, title: text(r.title) || c.title, concept: text(r.concept), visual: text(r.visual) || c.visual, gain: text(r.gain) || c.gain, fixed: r.fixed || [], open: r.open || [] });
}
const g = await ask(distinctPrompt(project, done), 'distinct:revised', 'judge');
fs.writeFileSync(path.join(DIR, 'RESULT.json'), JSON.stringify({ winners, revised: done, groups: g.groups }, null, 1));
console.log('DONE', JSON.stringify(g.groups.map((x) => [x.name, x.ids])));
process.exit(0);
