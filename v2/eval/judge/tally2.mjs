import fs from 'node:fs';
const V = await import('/home/claude/from-i/freative/v2/knowledge/viewpoint.js');
const key = JSON.parse(fs.readFileSync('judge/KEY2.json', 'utf8'));
const C = ['독창성', '차별성', '실효성', '경쟁성'];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length; const f = (n) => n.toFixed(2);
const per = {};
const groups = [];
for (const J of ['G1', 'G2', 'G3']) { if (!fs.existsSync(`judge/${J}.res.json`)) continue; const r = JSON.parse(fs.readFileSync(`judge/${J}.res.json`, 'utf8'));
  for (const [k, v] of Object.entries(r.scores)) { const { arm, src } = key[J][k]; const p = per[src] ??= { arm, s: {}, rank: [], from: [], frank: [], fv: [] }; for (const c of C) (p.s[c] ??= []).push(v[c]); }
  r.rank.forEach((k, i) => per[key[J][k].src].rank.push(i + 1)); groups.push({ J, groups: r.groups.map((g) => g.map((k) => key[J][k].src)) }); }
for (const J of ['F1', 'F2']) { if (!fs.existsSync(`judge/${J}.res.json`)) continue; const r = JSON.parse(fs.readFileSync(`judge/${J}.res.json`, 'utf8'));
  for (const [k, v] of Object.entries(r.scores)) { const p = per[key[J][k].src]; p.from.push(V.weightedScore(v)); p.fv.push(v.verdict); }
  r.rank.forEach((k, i) => per[key[J][k].src].frank.push(i + 1)); }
console.log('안별\nsrc\tarm\t' + C.join('\t') + '\t합\t일반순위\t더프롬점수\t더프롬순위\t판정');
for (const [src, p] of Object.entries(per).sort((a, b) => C.reduce((t, c) => t + avg(b[1].s[c]), 0) - C.reduce((t, c) => t + avg(a[1].s[c]), 0))) console.log([src, p.arm, ...C.map((c) => f(avg(p.s[c]))), f(C.reduce((t, c) => t + avg(p.s[c]), 0)), p.rank.join('/'), p.from.join('/'), p.frank.join('/'), p.fv.join('/')].join('\t'));
console.log('\n방식별');
for (const arm of ['base', '1x', '2x', '3x']) { const ps = Object.values(per).filter((p) => p.arm === arm); if (!ps.length) continue;
  console.log([arm, ...C.map((c) => c + ' ' + f(avg(ps.flatMap((p) => p.s[c])))), '합 ' + f(C.reduce((t, c) => t + avg(ps.flatMap((p) => p.s[c])), 0)), '일반 평균순위 ' + f(avg(ps.flatMap((p) => p.rank))), '더프롬 점수 ' + f(avg(ps.flatMap((p) => p.from))), '더프롬 평균순위 ' + f(avg(ps.flatMap((p) => p.frank))), '판정 ' + ['채택', '보완', '기각'].map((v) => v + ps.flatMap((p) => p.fv).filter((x) => x === v).length).join(' ')].join('\t')); }
for (const J of ['G1', 'G2', 'G3', 'F1', 'F2']) { if (!fs.existsSync(`judge/${J}.res.json`)) continue; const r = JSON.parse(fs.readFileSync(`judge/${J}.res.json`, 'utf8')); console.log(J, '상위 4:', r.rank.slice(0, 4).map((k) => key[J][k].src).join(' > ')); }
console.log('\n묶음'); for (const g of groups) console.log(g.J, JSON.stringify(g.groups));
fs.writeFileSync('judge/TALLY2.json', JSON.stringify({ per, groups }, null, 1));
