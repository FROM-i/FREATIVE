import fs from 'node:fs';
const C = await import('/home/claude/from-i/freative/v2/knowledge/criteria.js');
const key = JSON.parse(fs.readFileSync('judge/KEY6.json', 'utf8'));
const panels = { Sonnet: ['T1', 'T2', 'T3'], Opus: ['P1', 'P2', 'P3'] };
const out = {};
const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-');
for (const [panel, Js] of Object.entries(panels)) {
  const per = {}; const groups = [];
  for (const J of Js) { if (!fs.existsSync(`judge/${J}.res.json`)) continue; const r = JSON.parse(fs.readFileSync(`judge/${J}.res.json`, 'utf8'));
    for (const [k, v] of Object.entries(r.cards)) { const { arm, src } = key[J][k]; const p = per[`${arm}:${src}`] ??= { arm, src, d: [], e: [], s: [], rank: [], why: [] }; p.d.push(v.differentiation); p.e.push(v.effectiveness); p.s.push(v.success); p.why.push(`${v.diff_why} / ${v.eff_why}`); }
    r.rank.forEach((k, i) => per[`${key[J][k].arm}:${key[J][k].src}`].rank.push(i + 1));
    groups.push(`${J} ${JSON.stringify(r.groups.filter((g) => g.length > 1).map((g) => g.map((k) => `${key[J][k].arm}:${key[J][k].src}`)))} 1위 ${key[J][r.rank[0]].arm}:${key[J][r.rank[0]].src}`); }
  console.log(`\n=== ${panel} 판정단 ===`);
  for (const p of Object.values(per).sort((a, b) => avg(a.rank) - avg(b.rank))) console.log([`${p.arm}:${p.src}`, '순위 ' + p.rank.join('/') + ` (${avg(p.rank)})`, '차별화 ' + p.d.join('/'), '실효성 ' + p.e.join('/'), '성공기준 ' + p.s.join('/')].join(' | '));
  for (const arm of ['baseS', 'baseO', 'v5', 'v6']) { const ps = Object.values(per).filter((p) => p.arm === arm); const d = ps.flatMap((p) => p.d); const e = ps.flatMap((p) => p.e); const s = ps.flatMap((p) => p.s);
    console.log(arm, '| 평균 순위', avg(ps.flatMap((p) => p.rank)), '| 차별화', C.DIFFERENTIATION.levels.map((l) => `${l} ${d.filter((x) => x === l).length}`).join(' · '), '| 실효성', C.EFFECTIVENESS.levels.map((l) => `${l} ${e.filter((x) => x === l).length}`).join(' · '), '| 성공 기준', ['직접', '간접', '없음'].map((l) => `${l} ${s.filter((x) => x === l).length}`).join(' · ')); }
  console.log(groups.join('\n'));
  out[panel] = per;
}
fs.writeFileSync('judge/TALLY6.json', JSON.stringify(out, null, 1));
