import fs from 'node:fs';
const key = JSON.parse(fs.readFileSync('KEY.json','utf8'));
const C = ['독창성','차별성','실효성','경쟁성'];
const per = {}; // src -> {crit:[...], rank:[...]}
const groupsOut = [];
for (const J of ['J1','J2','J3']) {
  const r = JSON.parse(fs.readFileSync(`${J}.res.json`,'utf8'));
  for (const [k, v] of Object.entries(r.scores)) { const { arm, src } = key[J][k]; const p = per[src] ??= { arm, s:{}, rank:[], why:[], unique:[] }; for (const c of C) (p.s[c] ??= []).push(v[c]); p.why.push(v.why); p.unique.push(r.unique?.[k]); }
  r.rank.forEach((k, i) => per[key[J][k].src].rank.push(i+1));
  groupsOut.push({ J, groups: r.groups.map(g => g.map(k => key[J][k].src)), common: r.common });
}
const avg = (a)=>a.reduce((x,y)=>x+y,0)/a.length; const f=(n)=>n.toFixed(2);
console.log('카드별 (판정자 3명 평균)');
console.log(['src','arm',...C,'합','순위(3명)'].join('\t'));
for (const [src,p] of Object.entries(per)) console.log([src,p.arm,...C.map(c=>f(avg(p.s[c]))+' ('+p.s[c].join('/')+')'),f(C.reduce((t,c)=>t+avg(p.s[c]),0)),p.rank.join('/')].join('\t'));
console.log('\n방식별 평균 (카드 3 × 판정자 3 = 9점수)');
for (const arm of ['base','1x','2x']) { const ps = Object.values(per).filter(p=>p.arm===arm); const row = C.map(c=>f(avg(ps.flatMap(p=>p.s[c])))); const tot = f(C.reduce((t,c)=>t+avg(ps.flatMap(p=>p.s[c])),0)); const rk = f(avg(ps.flatMap(p=>p.rank))); const best = ps.map(p=>C.reduce((t,c)=>t+avg(p.s[c]),0)).sort((a,b)=>b-a)[0]; console.log([arm,...row,'합 '+tot,'평균순위 '+rk,'최고카드 합 '+f(best)].join('\t')); }
console.log('\n1위로 뽑힌 카드:', ['J1','J2','J3'].map(J=>{const r=JSON.parse(fs.readFileSync(`${J}.res.json`,'utf8'));return J+':'+key[J][r.rank[0]].src}).join(' '));
console.log('상위 3:', ['J1','J2','J3'].map(J=>{const r=JSON.parse(fs.readFileSync(`${J}.res.json`,'utf8'));return J+':'+r.rank.slice(0,3).map(k=>key[J][k].src).join('>')}).join('  '));
console.log('\n묶음'); for (const g of groupsOut) console.log(g.J, JSON.stringify(g.groups), '\n  공통:', g.common);
console.log('\n카드별 고유 요소'); for (const [src,p] of Object.entries(per)) console.log(src, '|', p.unique.join(' || '));
fs.writeFileSync('TALLY.json', JSON.stringify({ per, groupsOut }, null, 1));
