import fs from 'node:fs';
const C = await import('/home/claude/from-i/freative/v2/knowledge/criteria.js');
const key = JSON.parse(fs.readFileSync('judge/KEY4b.json', 'utf8'));
const per = {}; const groups = [];
for (const J of ['I1', 'I2', 'I3']) { const r = JSON.parse(fs.readFileSync(`judge/${J}.res.json`, 'utf8'));
  for (const [k, v] of Object.entries(r.cards)) { const { arm, src } = key[J][k]; const p = per[src] ??= { arm, d: [], e: [], rank: [], why: [] }; p.d.push(v.differentiation); p.e.push(v.effectiveness); p.why.push(`${v.diff_why} / ${v.eff_why}`); }
  r.rank.forEach((k, i) => per[key[J][k].src].rank.push(i + 1)); groups.push(`${J} ${JSON.stringify(r.groups.map((g) => g.map((k) => key[J][k].src)))} 1위 ${key[J][r.rank[0]].src}`); }
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
for (const [src, p] of Object.entries(per)) console.log([src, p.arm, '차별화: ' + p.d.join(' / '), '실효성: ' + p.e.join(' / '), '순위 ' + p.rank.join('/')].join(' | '));
for (const arm of ['base', 'brain']) { const ps = Object.values(per).filter((p) => p.arm === arm); const d = ps.flatMap((p) => p.d); const e = ps.flatMap((p) => p.e);
  console.log(arm, '| 차별화', C.DIFFERENTIATION.levels.map((l) => `${l} ${d.filter((x) => x === l).length}`).join(' · '), '| 실효성', C.EFFECTIVENESS.levels.map((l) => `${l} ${e.filter((x) => x === l).length}`).join(' · '), '| 평균 순위', avg(ps.flatMap((p) => p.rank))); }
console.log(groups.join('\n'));
fs.writeFileSync('judge/TALLY4b.json', JSON.stringify(per, null, 1));
