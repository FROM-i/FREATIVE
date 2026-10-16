// Creative Travel — 횡스크롤 라인 드로잉 여정
// 화가가 미션을 받고(01) 캔버스를 펼치고(02) 타임머신 비행기로 사조를 여행하고(03)
// 차를 타고 터널에서 인사이트를 겹치고(04) 언덕에서 지도를 펼치고(05) FoR·PoP·PoD를 세우고(06)
// 새 캔버스에 컨셉을 그리고(07) 갤러리에 Creative를 건다(08). 선 하나가 처음부터 끝까지 이어진다.
import * as A from './art.js';
import { esc, arr } from './util.js';

const H = 500;
const GY = 410;
export const SCENES = [
  { id: 'mission', stage: 'brief', no: '01', title: 'MISSION', x: 0, w: 1300, walk: [150, 560] },
  { id: 'canvas', stage: 'canvas', no: '02', title: 'CANVAS', x: 1300, w: 1300, walk: [1460, 1860] },
  { id: 'airplane', stage: 'airplane', no: '03', title: 'AIRPLANE — TIME TRAVEL', x: 2600, w: 2800, walk: [2760, 5280] },
  { id: 'tunnel', stage: 'tunnel', no: '04', title: 'TUNNEL — LAYERING', x: 5400, w: 2800, walk: [5560, 8060] },
  { id: 'exit', stage: 'positioning', no: '05', title: 'POSITIONING MAP', x: 8200, w: 1400, walk: [8320, 8850] },
  { id: 'compass', stage: 'forpop', no: '06', title: 'FoR · PoP · PoD', x: 9600, w: 1400, walk: [9700, 10130] },
  { id: 'newcanvas', stage: 'concept', no: '07', title: 'NEW CANVAS — CONCEPT', x: 11000, w: 1400, walk: [11100, 11520] },
  { id: 'gallery', stage: 'creative', no: '08', title: 'GALLERY — CREATIVE', x: 12400, w: 1600, walk: [12520, 13360] },
];
const W = 14000;
const PLANE = [2760, 5280];
const CAR = [5560, 8070];
const HILL = { a: 8520, b: 8740, c: 9060, d: 9280, h: 72 };
const TUN = { a: 6000, b: 7820, top: GY - 132 };
const MTN = 196; // 산 고원 높이(y)

function groundY(x) {
  if (x > HILL.a && x < HILL.b) { const t = (x - HILL.a) / (HILL.b - HILL.a); return GY - HILL.h * (t * t * (3 - 2 * t)); }
  if (x >= HILL.b && x <= HILL.c) return GY - HILL.h;
  if (x > HILL.c && x < HILL.d) { const t = (x - HILL.c) / (HILL.d - HILL.c); return GY - HILL.h * (1 - t * t * (3 - 2 * t)); }
  return GY;
}
function flightY(x) {
  const [a, b] = PLANE;
  if (x <= a) return GY - 30;
  if (x >= b) return GY - 30;
  const up = Math.min(1, (x - a) / 420), down = Math.min(1, (b - x) / 420);
  const k = Math.min(up, down);
  const ease = k * k * (3 - 2 * k);
  return GY - 30 - ease * 255 + Math.sin((x - a) / 140) * 10 * ease;
}

function groundPath() {
  let d = `M0,${GY} H3150`;
  for (let x = 3150; x < 5100; x += 300) d += ` Q${x + 150},${GY - 12} ${x + 300},${GY}`;
  d += ` H${HILL.a} C${HILL.a + 120},${GY} ${HILL.b - 90},${GY - HILL.h} ${HILL.b},${GY - HILL.h} H${HILL.c} C${HILL.c + 90},${GY - HILL.h} ${HILL.d - 120},${GY} ${HILL.d},${GY} H${W}`;
  return d;
}

function eraYear(era) {
  const s = String(era || '');
  const m = s.match(/(\d{4})/);
  const c = s.match(/(\d{2})(?:–\d{2})?C/);
  if (c && (!m || s.indexOf(c[0]) < s.indexOf(m[0]))) return (parseInt(c[1], 10) - 1) * 100 + 50;
  if (m) return parseInt(m[1], 10);
  return 1900;
}
function eraLabel(era) {
  const y = eraYear(era);
  return y % 100 === 50 && y < 1800 ? `${Math.floor(y / 100) + 1}C` : String(y);
}

export class Journey {
  constructor(host, { onScene } = {}) {
    this.host = host;
    this.onScene = onScene;
    this.x = SCENES[0].walk[0];
    this.target = this.x;
    this.follow = true;
    this.userScrollAt = 0;
    this.drawn = new Set();
    this.run = null;
    this.isms = [];
    this.lastLineAt = '';
    this.build();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() { cancelAnimationFrame(this.raf); this.host.innerHTML = ''; }

  setIsms(list) { this.isms = list || []; this.renderSky(); }

  build() {
    const scroller = document.createElement('div');
    scroller.className = 'journey';
    scroller.innerHTML = `
    <svg class="world" viewBox="0 0 ${W} ${H}" width="${W * this.scale()}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Creative Travel 여정">
      <defs>
        <clipPath id="reach"><rect id="reachRect" x="0" y="0" width="900" height="${H}"/></clipPath>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 V6" stroke="#141414" stroke-width="1"/></pattern>
      </defs>
      <g id="sceneTitles">${SCENES.map((s) => `<g transform="translate(${s.x + 40},28)"><text class="scene-title">${s.no}</text><text class="scene-title" x="28">${esc(s.title)}</text></g><path class="ln faint" d="M${s.x},0 V${H}" stroke-dasharray="2 8"/>`).join('')}</g>
      <g id="sky"></g>
      <g clip-path="url(#reach)"><path id="ground" class="ln" d="${groundPath()}" style="stroke-width:1.6"/></g>
      ${SCENES.map((s) => `<g class="scene" id="sc-${s.id}" data-scene="${s.id}"><g class="static">${this.staticScene(s)}</g><g class="dyn"></g></g>`).join('')}
      <g id="vehicles"></g>
      <g id="walker" class="walker"></g>
      <g id="brainOrb" class="brain-orb-g"></g>
      <g id="speech"></g>
    </svg>`;
    this.host.appendChild(scroller);
    this.scroller = scroller;
    this.svg = scroller.querySelector('svg');
    this.reachRect = scroller.querySelector('#reachRect');
    this.walkerG = scroller.querySelector('#walker');
    this.vehG = scroller.querySelector('#vehicles');
    this.speechG = scroller.querySelector('#speech');
    this.orbG = scroller.querySelector('#brainOrb');
    this.orbG.innerHTML = `<g class="orb-beam"><path class="ln thin" d="M0,0 L70,120" stroke-dasharray="3 5"/></g>
      <g class="orb-body"><circle r="13" class="fill-paper" stroke="#141414" stroke-width="1.4"/><circle r="5" class="fill-y" stroke="#141414" stroke-width="1"/>
      <ellipse rx="20" ry="6" fill="none" stroke="#141414" stroke-width="1" transform="rotate(-18)"/></g>
      <text class="lbl-s" y="-20" text-anchor="middle" style="font-size:9px;font-weight:700">판단 브레인</text><g class="orb-stamp"></g>`;
    this.walkerG.innerHTML = `<g class="bodywrap">${A.painter()}</g>`;
    this.vehG.innerHTML = `<g id="planeG">${A.plane()}</g><g id="carG">${A.car()}</g>`;
    this.planeG = this.vehG.querySelector('#planeG');
    this.carG = this.vehG.querySelector('#carG');

    // 드래그·휠로 가로 스크롤
    let drag = null;
    scroller.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft += e.deltaY; e.preventDefault(); }
      this.userScrollAt = performance.now();
    }, { passive: false });
    scroller.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, s: scroller.scrollLeft }; scroller.classList.add('drag'); });
    window.addEventListener('pointermove', this._pm = (e) => { if (drag) { scroller.scrollLeft = drag.s - (e.clientX - drag.x); this.userScrollAt = performance.now(); } });
    window.addEventListener('pointerup', this._pu = () => { drag = null; scroller.classList.remove('drag'); });
    this.ro = new ResizeObserver(() => this.svg.setAttribute('width', W * this.scale()));
    this.ro.observe(scroller);
    this.revealUpTo(this.x);
  }

  scale() { const h = (this.scroller && this.scroller.clientHeight) || 420; return h / H; }

  /* ---------- 고정 소품 ---------- */
  staticScene(s) {
    const L = A.L;
    switch (s.id) {
      case 'mission': return `
        <g transform="translate(220,${GY})">${A.atelier()}</g>
        <g transform="translate(470,${GY})"><path class="${L}" d="M0,0 V-58 M-14,-58 H22 V-80 H-14 Z M-14,-80 C-14,-92 22,-92 22,-80"/><path class="${L} thin" d="M22,-74 H30 V-66"/></g>
        ${A.cloud(760, 110, 1, 'faint')}${A.cloud(1080, 70, .7, 'faint')}
        <path class="${L} faint" d="M900,${GY} q20,-18 40,0 M960,${GY} q14,-12 28,0"/>`;
      case 'canvas': return `
        <g transform="translate(2010,${GY})">${A.easel(300, 196)}</g>
        <g transform="translate(2290,${GY})"><path class="${L}" d="M-30,0 L-24,-44 H24 L30,0 M-26,-30 H26"/><rect class="${L}" x="-20" y="-58" width="12" height="14"/><rect class="${L}" x="-4" y="-62" width="10" height="18"/><path class="${L} thin" d="M12,-44 L18,-64"/></g>
        <g transform="translate(1630,${GY})"><path class="${L}" d="M-26,0 V-34 H26 V0 M-26,-34 L-20,-48 H20 L26,-34"/></g>
        ${A.cloud(1500, 90, .8, 'faint')}`;
      case 'airplane': return `
        <path class="${L}" d="M2700,${GY} H3080" style="stroke-width:3"/>
        <path class="${L} thin" d="M2720,${GY + 10} H3060" stroke-dasharray="18 14"/>
        <g transform="translate(2690,${GY})"><path class="${L}" d="M0,0 V-70 M0,-70 L26,-62 L0,-54"/></g>
        <path class="${L} faint" d="M2900,48 H5150"/>
        ${A.cloud(3150, 120, 1.1, 'faint')}${A.cloud(3900, 90, .8, 'faint')}${A.cloud(4600, 130, 1.2, 'faint')}${A.cloud(5050, 80, .7, 'faint')}
        <path class="${L}" d="M5180,${GY} H5420" style="stroke-width:3"/>
        <g transform="translate(5440,${GY})"><path class="${L}" d="M-30,0 V-60 C-30,-90 30,-90 30,-60 V0 M-30,-60 H30"/></g>`;
      case 'tunnel': {
        const n = 46, span = TUN.b - TUN.a;
        let hatch = '';
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = TUN.a + 30 + t * (span - 60);
          hatch += `<path class="ln thin hatch" data-t="${t.toFixed(3)}" d="M${x.toFixed(1)},${TUN.top + 6} V${GY - 2}" />`;
        }
        // 터널은 어둡게 시작해서 레이어가 겹칠수록 밝아진다 — hatch 밀도
        let dense = '';
        for (let x = TUN.a + 8; x < TUN.b - 8; x += 9) dense += `M${x},${TUN.top + 4} V${GY - 2} `;
        return `
        <path class="${L}" d="M5800,${GY} C5880,${GY - 40} 5900,${MTN} 6060,${MTN} H7760 C7920,${MTN} 7960,${GY - 40} 8040,${GY}"/>
        <path class="${L} faint" d="M6300,${MTN} l40,-30 l40,30 M6900,${MTN} l30,-22 l30,22 M7400,${MTN} l36,-26 l36,26"/>
        <path class="${L} fill-paper" d="M${TUN.a - 70},${GY} V${TUN.top + 40} C${TUN.a - 70},${TUN.top - 30} ${TUN.a + 70},${TUN.top - 30} ${TUN.a + 70},${TUN.top + 40} V${GY}" />
        <path class="${L}" d="M${TUN.a - 70},${TUN.top + 40} H${TUN.a - 90} M${TUN.a + 70},${TUN.top + 40} H${TUN.a + 90}"/>
        <path class="${L}" d="M${TUN.a},${TUN.top + 2} H${TUN.b}"/>
        <g id="tunnelDark"><path class="ln" d="${dense}" style="stroke-width:1.3"/></g>
        <g id="tunnelHatch" class="hidden">${hatch}</g>
        <path class="${L} fill-paper" d="M${TUN.b - 70},${GY} V${TUN.top + 40} C${TUN.b - 70},${TUN.top - 30} ${TUN.b + 70},${TUN.top - 30} ${TUN.b + 70},${TUN.top + 40} V${GY}" />
        <g id="exitRays" class="reveal">${Array.from({ length: 11 }, (_, i) => { const a = (-80 + i * 16) * Math.PI / 180; const r1 = 110, r2 = 190 + (i % 2) * 40; const cx = TUN.b + 80, cy = GY - 70; return `<path class="ln thin" d="M${(cx + Math.cos(a) * r1).toFixed(1)},${(cy + Math.sin(a) * r1).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)},${(cy + Math.sin(a) * r2).toFixed(1)}"/>`; }).join('')}<circle cx="${TUN.b + 80}" cy="${GY - 70}" r="60" class="fill-y" opacity=".35"/></g>
        <g transform="translate(5500,${GY})"><path class="${L}" d="M-60,0 V-70 L0,-100 L60,-70 V0 M-40,0 V-50 H40 V0"/></g>`;
      }
      case 'exit': return `
        <g transform="translate(8990,${GY - HILL.h})">${A.easel(190, 170)}</g>
        <g transform="translate(9200,${GY - HILL.h})"><path class="${L}" d="M0,0 V-150"/><path class="${L} flag-wave" d="M0,-150 H44 L34,-138 L44,-126 H0"/></g>
        ${A.cloud(8400, 100, .8, 'faint')}${A.cloud(9450, 140, .6, 'faint')}`;
      case 'compass': return `
        <g transform="translate(10380,${GY})">
          <path class="${L}" d="M-120,0 L-90,-60 M120,0 L90,-60 M0,0 V-60"/>
          <rect class="${L} fill-paper" x="-190" y="-320" width="380" height="260" rx="14"/>
          <circle class="${L}" cx="0" cy="-190" r="92"/>
          <circle class="${L}" cx="0" cy="-190" r="18"/>
        </g>`;
      case 'newcanvas': return `
        <g transform="translate(11760,${GY})">${A.easel(380, 230)}</g>
        <g transform="translate(12050,${GY})"><path class="${L}" d="M0,0 V-190"/><g id="cflag"><path class="${L} flag-wave" d="M0,-190 H70 L58,-174 L70,-158 H0"/></g></g>
        <g transform="translate(11420,${GY})"><path class="${L}" d="M-26,0 L-22,-30 H22 L26,0 M-30,-30 H30"/><circle class="${L}" cx="-8" cy="-38" r="6"/><circle class="${L}" cx="9" cy="-36" r="5"/></g>`;
      case 'gallery': return `
        <path class="${L}" d="M12460,${GY} V${GY - 290} H13960 V${GY}"/>
        <path class="${L} thin" d="M12460,${GY - 270} H13960"/>
        ${[0, 1, 2, 3].map((i) => `<path class="${L} thin" d="M${12700 + i * 300},${GY - 270} v10 l-14,16 h28 l-14,-16"/>`).join('')}
        <g transform="translate(13180,${GY})"><path class="${L}" d="M-70,0 V-22 H70 V0 M-70,-22 V-30 H70 V-22"/></g>
        <g transform="translate(13820,${GY})"><path class="${L}" d="M0,0 V-90 M-56,-90 H56 V-60 H-56 Z"/><text class="lbl" x="0" y="-70" text-anchor="middle" style="font-weight:700">사람의 판정 →</text></g>`;
      default: return '';
    }
  }

  /* 배경 하늘 — 16개 사조의 연표 */
  renderSky() {
    const sky = this.svg.querySelector('#sky');
    if (!this.isms.length) { sky.innerHTML = ''; return; }
    const sorted = [...this.isms].sort((a, b) => eraYear(a.era) - eraYear(b.era));
    const x0 = 2920, x1 = 5130;
    const selected = new Set(this.selectedIsms().map((i) => i.id));
    this.skyPos = {};
    sky.innerHTML = sorted.map((i, k) => {
      const x = x0 + (k / (sorted.length - 1)) * (x1 - x0);
      this.skyPos[i.id] = x;
      const on = selected.has(i.id);
      return `<g transform="translate(${x.toFixed(0)},48)" ${on ? '' : 'opacity=".35"'}>
        <path class="ln thin" d="M0,-5 V5"/>
        <text class="mono" y="18" text-anchor="middle" style="font-size:9px">${esc(eraLabel(i.era))}</text>
        <g transform="translate(-11,24) scale(.37)" class="ln thin" style="fill:none;stroke:#141414;stroke-width:2.6">${A.ISM_ICON[i.id] || ''}</g>
        <text class="lbl-s" y="${on ? 66 : 64}" text-anchor="middle" style="font-size:9px;${on ? 'font-weight:700;fill:#141414' : ''}">${esc(i.name.split(' / ')[0])}</text>
      </g>`;
    }).join('');
  }

  selectedIsms() {
    const r = this.run && this.run.results && this.run.results.brief;
    const plan = r && r.plan ? r.plan.isms : [];
    return plan.map((p) => this.isms.find((i) => i.id === p.id) || { id: p.id, name: p.id, era: '' }).sort((a, b) => eraYear(a.era) - eraYear(b.era));
  }

  /* ---------- 데이터 반영 ---------- */
  update(run) {
    this.run = run;
    if (!run) return;
    this.target = this.computeTarget(run);
    if (!this.inited) {
      // 이미 진행된 프로젝트를 열면 현재 위치에서 바로 시작
      this.inited = true;
      this.x = this.target;
      const sc = this.scale();
      requestAnimationFrame(() => { this.scroller.scrollLeft = Math.max(0, this.x * sc - this.scroller.clientWidth * 0.36); });
    }
    this.renderSky();
    for (const s of SCENES) {
      const g = this.svg.querySelector(`#sc-${s.id} .dyn`);
      const html = this.dynScene(s, run);
      if (g._html !== html) { g._html = html; g.innerHTML = html; this.drawNew(g); }
    }
    this.updateTunnelLight(run);
    this.updateFlag(run);
    this.updateSpeech(run);
    // 브레인 검증 도장
    const vs = Object.entries(run.brain || {}).filter(([, v]) => v && v.attempts && v.attempts.length).map(([k, v]) => ({ k, a: v.attempts[v.attempts.length - 1] })).sort((a, b) => (a.a.at || '').localeCompare(b.a.at || ''));
    const lv = vs[vs.length - 1];
    if (lv && lv.a.at !== this.lastVerifyAt) {
      if (this.lastVerifyAt !== undefined) this.stamp = { key: lv.a.at, verdict: lv.a.verdict, label: `검증 · ${lv.a.verdict}`, until: performance.now() + 4500 };
      this.lastVerifyAt = lv.a.at;
    } else if (!lv && this.lastVerifyAt === undefined) this.lastVerifyAt = null;
    this.walkerG.classList.toggle('painting', ['canvas', 'concept'].includes(run.stage) && run.stages[run.stage] && run.stages[run.stage].status === 'running');
  }

  computeTarget(run) {
    let x = SCENES[0].walk[0];
    for (const s of SCENES) {
      const st = run.stages[s.stage] || { status: 'pending' };
      if (st.status === 'done') { x = s.walk[1]; continue; }
      if (st.status === 'pending') break;
      const p = Math.max(0.04, Math.min(1, st.progress || 0));
      x = s.walk[0] + (s.walk[1] - s.walk[0]) * (st.status === 'waiting' ? 1 : p);
      break;
    }
    return x;
  }

  dynScene(s, run) {
    const R = run.results || {};
    const st = (run.stages[s.stage] || {}).status || 'pending';
    if (st === 'pending') return '';
    const fo = (x, y, w, h, inner, cls = '') => `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}" class="pop in ${cls}"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%">${inner}</div></foreignObject>`;
    switch (s.id) {
      case 'mission': {
        const b = R.brief;
        const fly = `<g class="pop in"><g>${A.paperPlane()}<animateMotion dur="2.6s" fill="freeze" path="M1260,40 C1000,20 760,180 ${b ? 560 : 640},${b ? 260 : 300}" rotate="auto"/></g></g>`;
        if (!b) return fly + fo(600, 150, 260, 60, `<div class="fo-bubble">미션 편지를 읽는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        const m = b.mission || {};
        const wait = st === 'waiting';
        return `
          <path class="ln d thin" d="M620,${GY - 120} L700,236"/>
          ${fo(640, 70, 330, 172, `<div class="fo-card"><div class="k">MISSION · 브리프 게이트 ${esc(b.gate)}</div><b>${esc(m.title || '')}</b>${esc(m.one_line || '')}<div style="margin-top:6px">${[m.deliverable, m.device, m.channel].filter(Boolean).map((x) => `<span class="fo-word">${esc(x)}</span>`).join('')}</div></div>`)}
          ${wait ? fo(380, 200, 220, 64, `<div class="fo-bubble" style="background:var(--yellow)">질문이 ${arr(b.questions).length}개 있어요 — 아래에서 답해 주세요</div>`) : ''}
          ${b.plan && b.plan.note ? fo(1000, 210, 250, 70, `<div class="fo-plain">“${esc(b.plan.note)}”</div>`) : ''}`;
      }
      case 'canvas': {
        const c = R.canvas;
        const top = GY - 70 - 196;
        if (!c) return fo(1700, 150, 160, 50, `<div class="fo-bubble">음…<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        const words = arr(c.thinking).slice(0, 7);
        const pos = [[1390, 150], [1500, 96], [1630, 130], [1430, 230], [1560, 200], [1700, 236], [1360, 300]];
        return `
          ${words.map((w, i) => fo(pos[i][0], pos[i][1], 150, 30, `<span class="fo-word">${esc(w)}</span>`)).join('')}
          ${fo(2010 - 142, top + 8, 284, 180, `<div class="fo-canvas"><div class="k mono" style="font-size:9px">S0 · 컨셉 한 문장 (초안)</div><div style="font-size:14px;font-weight:600">${esc(c.concept_draft)}</div><div style="color:#45433F;font-size:11px">${esc(c.tension || '')}</div></div>`)}
          ${fo(2330, 120, 230, 110, `<div class="fo-card"><div class="k">지킬 관성</div>${arr(c.inertia).map((x) => `— ${esc(x)}`).join('<br/>')}</div>`)}`;
      }
      case 'airplane': {
        const a = R.airplane || {};
        const sel = this.selectedIsms();
        if (!sel.length) return '';
        const travels = arr(a.travels);
        const agents = arr(run.agents).filter((x) => x.stage === 'airplane');
        const n = sel.length;
        const xs = sel.map((_, i) => 3350 + (i / Math.max(1, n - 1)) * 1500);
        let out = '';
        sel.forEach((ism, i) => {
          const x = xs[i];
          const t = travels.find((v) => v.id === ism.id);
          const ag = agents.find((v) => v.key === ism.id);
          const working = ag && ag.status === 'working';
          const skyX = this.skyPos && this.skyPos[ism.id];
          out += `<g data-k="isl-${ism.id}">
            ${skyX ? `<path class="ln d thin dash" d="M${skyX.toFixed(0)},118 L${x},178"/>` : ''}
            <path class="ln d fill-paper" d="M${x - 70},258 C${x - 80},244 ${x - 50},236 ${x - 36},242 C${x - 24},228 ${x + 10},228 ${x + 20},240 C${x + 40},232 ${x + 76},242 ${x + 70},258 Z"/>
            <g transform="translate(${x - 28},180) scale(.93)" style="fill:none;stroke:#141414;stroke-width:1.4" class="d-icon">${A.ISM_ICON[ism.id] || ''}</g>
            <text class="lbl" x="${x}" y="274" text-anchor="middle" style="font-weight:700">${esc(ism.name)}</text>
            <text class="mono" x="${x}" y="288" text-anchor="middle">${esc(ism.id)}</text>
            ${(ag || t) ? `<g transform="translate(${x + 44},244)">${A.assistant({ item: t ? 'case' : 'note' })}</g>` : ''}
            ${working ? fo(x + 58, 186, 120, 34, `<div class="fo-bubble">채집 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`) : ''}
            ${t && !t.error ? fo(x - 92, 300, 184, 92, `<div class="fo-card ${a.synth && arr(a.synth.selected).includes(ism.id) ? 'y' : ''}"><div class="k">CORE · fit ${Math.round((t.fit || 0) * 100)}</div><b>${esc(t.core || '')}</b>${esc((arr(t.take)[0] || '').slice(0, 46))}</div>`) : ''}
            ${t && t.error ? fo(x - 80, 300, 160, 40, `<div class="fo-card">여행 실패 · ${esc(t.error.slice(0, 30))}</div>`) : ''}
          </g>`;
        });
        if (a.synth) {
          out += fo(5000, 120, 220, 150, `<div class="fo-card ink"><div class="k">여행 가방 · HYBRID</div><b style="font-size:11px;line-height:1.4">${esc(a.synth.hybrid || '')}</b>${arr(a.synth.suitcase).map((x) => `· ${esc(x)}`).join('<br/>')}</div>`);
        }
        return out;
      }
      case 'tunnel': {
        const plan = (R.brief && R.brief.plan && R.brief.plan.layers) || [];
        const t = R.tunnel || {};
        const layers = arr(t.layers);
        const agents = arr(run.agents).filter((x) => x.stage === 'tunnel');
        const n = plan.length || 4;
        let out = '';
        plan.forEach((ly, i) => {
          const x = TUN.a + 230 + (i / Math.max(1, n - 1)) * (TUN.b - TUN.a - 460);
          const res = layers.find((v) => v.key === ly.key);
          const ag = agents.find((v) => v.key === ly.key);
          const done = res && !res.error;
          out += `<g data-k="ly-${ly.key}">
            <path class="ln d thin" d="M${x},${TUN.top + 2} V${TUN.top + 22}"/>
            <rect class="ln d ${done ? 'fill-ink' : 'fill-paper'}" x="${x - 50}" y="${TUN.top + 22}" width="100" height="26" rx="3"/>
            <text class="lbl" x="${x}" y="${TUN.top + 40}" text-anchor="middle" style="font-weight:700;${done ? 'fill:#F4F2EC' : ''}">${'①②③④⑤'[i] || ''} ${esc(ly.label)}</text>
            ${(ag || res) ? `<g transform="translate(${x - 30},${MTN})">${A.assistant({ item: 'lamp' })}</g>` : ''}
            ${ag && ag.status === 'working' ? fo(x - 8, MTN - 78, 130, 34, `<div class="fo-bubble">겹치는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`) : ''}
            ${done ? `<path class="ln d thin dash" d="M${x},${MTN - 2} V${TUN.top + 20}" />` + fo(x - 100, 44, 200, 140, `<div class="fo-card"><div class="k">${esc(ly.label)} LAYER · 빛 ${Math.round((res.light || 0) * 100)}</div><b>${esc(res.headline || '')}</b>${arr(res.insights).slice(0, 2).map((v) => `· ${esc(v.title)}`).join('<br/>')}</div>`) : ''}
          </g>`;
        });
        if (t.synth) out += fo(TUN.b + 150, 70, 210, 130, `<div class="fo-card y"><div class="k">EXIT LIGHT</div><b>${esc(t.synth.exit_light || '')}</b>${esc(t.synth.narrowed || '').slice(0, 70)}</div>`);
        return out;
      }
      case 'exit': {
        const p = R.positioning;
        const cx = 8990, top = GY - HILL.h - 70 - 170;
        if (!p) return fo(8700, 160, 170, 50, `<div class="fo-bubble">지도를 펼치는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        const sx = (v) => cx + v * 80, sy = (v) => top + 85 - v * 75;
        const cut = new Set(arr(p.rounds).flatMap((r) => arr(r.cut)));
        const fin = p.final && p.final.id;
        return `
          <path class="ln d thin" d="M${cx - 88},${top + 85} H${cx + 88} M${cx},${top + 6} V${top + 164}"/>
          <text class="lbl-s" x="${cx + 86}" y="${top + 80}" text-anchor="end" style="font-size:8px">${esc(p.axes.x.high)}</text>
          <text class="lbl-s" x="${cx + 4}" y="${top + 14}" style="font-size:8px">${esc(p.axes.y.high)}</text>
          ${arr(p.players).map((q) => `<circle class="ln thin" cx="${sx(q.x)}" cy="${sy(q.y)}" r="4"/>`).join('')}
          <circle cx="${sx(p.whitespace.x)}" cy="${sy(p.whitespace.y)}" r="18" class="ln" stroke-dasharray="3 3"/>
          ${arr(p.territories).map((t) => `<circle cx="${sx(t.x)}" cy="${sy(t.y)}" r="${t.id === fin ? 8 : 5}" class="${t.id === fin ? 'fill-y' : cut.has(t.id) ? 'fill-paper' : 'fill-ink'}" stroke="#141414"/>`).join('')}
          ${fo(9230, 120, 210, 150, `<div class="fo-card"><div class="k">5 → 4 → 3 → 1</div>${arr(p.territories).map((t) => `<div style="${t.id === fin ? 'font-weight:800' : cut.has(t.id) ? 'text-decoration:line-through;color:#8A867D' : ''}">${esc(t.id)} ${esc(t.name)}${t.id === fin ? ' ●' : ''}</div>`).join('')}</div>`)}
          ${fo(8330, 90, 200, 80, `<div class="fo-plain">빈자리 — <b>${esc(p.whitespace.label)}</b></div>`)}`;
      }
      case 'compass': {
        const f = R.forpop;
        const cx = 10380, cy = GY - 190;
        if (!f) return fo(10000, 170, 170, 50, `<div class="fo-bubble">틀을 세우는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        f.for = f.for || {}; f.core_pod = f.core_pod || {};
        const pops = arr(f.pop).slice(0, 4);
        const ang = [-140, -40, 140, 40];
        return `
          <circle cx="${cx}" cy="${cy}" r="18" class="fill-y" stroke="#141414"/>
          <text class="mono" x="${cx - 178}" y="${GY - 300}">FoR</text>
          ${fo(cx - 150, GY - 312, 300, 40, `<div class="fo-plain" style="text-align:center;font-weight:700">${esc(f.for.frame)}</div>`)}
          <text class="mono" x="${cx + 60}" y="${cy - 80}">PoP</text>
          ${pops.map((q, i) => { const a = ang[i] * Math.PI / 180; const x = cx + Math.cos(a) * 92, y = cy + Math.sin(a) * 92; return `<circle cx="${x}" cy="${y}" r="3" class="fill-ink"/>` + fo(x + (Math.cos(a) > 0 ? 6 : -146), y - 12, 140, 30, `<div class="fo-plain" style="font-size:10px;${Math.cos(a) > 0 ? '' : 'text-align:right'}">${esc(q.item)}</div>`); }).join('')}
          ${f.core_pod.item ? fo(cx - 70, cy + 22, 140, 48, `<div class="fo-plain" style="text-align:center;font-size:11px;font-weight:800">PoD · ${esc(f.core_pod.item)}</div>`) : ''}
          ${arr(f.shifts).map((sh, i) => { const dx = 10630 + i * 120, dy = GY - 300; return `<g data-k="sh-${i}"><path class="ln d fill-ink" d="M${dx},${dy - 26} L${dx + 26},${dy} L${dx},${dy + 26} L${dx - 26},${dy} Z"/><text x="${dx}" y="${dy + 4}" text-anchor="middle" style="font-size:8px;font-weight:800;fill:#F4F2EC">${esc((sh.shift && sh.shift.type) || '')}</text><text class="lbl-s" x="${dx}" y="${dy + 42}" text-anchor="middle" style="font-size:9px">전환 ${i + 1}</text></g>`; }).join('')}
          ${f.core_pod && f.core_pod.statement ? fo(10560, 190, 260, 110, `<div class="fo-card ink"><div class="k">PoD 5 → 3 → 1 · 판단 브레인</div>${esc(f.core_pod.statement || '')}</div>`) : ''}`;
      }
      case 'newcanvas': {
        const c = R.concept;
        const top = GY - 70 - 230;
        if (!c) return fo(11400, 170, 170, 50, `<div class="fo-bubble">새 캔버스<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        const props = arr(c.proposals); const picked = new Set(arr(c.first_round && c.first_round.picked)); const fin = c.final_id || (c.brain_select && c.brain_select.final && c.brain_select.final.id);
        const mini = props.map((pp, i) => `<g data-k="cp-${pp.id}"><rect class="ln d ${pp.id === fin ? 'fill-y' : 'fill-paper'}" x="${11120 + i * 46}" y="${GY - 330}" width="38" height="30" ${picked.has(pp.id) ? '' : 'stroke-dasharray="3 3" style="opacity:.5"'}/><text class="lbl-s" x="${11139 + i * 46}" y="${GY - 310}" text-anchor="middle" style="font-size:9px">${esc(pp.id)}</text></g>`).join('') + (props.length ? `<text class="lbl-s" x="${11120}" y="${GY - 340}" style="font-size:9px;font-weight:700">5 → 3 → 1</text>` : '');
        if (!c.theme) return mini + fo(11560, 170, 200, 50, `<div class="fo-bubble">브레인과 고르는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        return mini + `
          ${fo(11760 - 182, top + 8, 364, 214, `<div class="fo-canvas"><div class="mono" style="font-size:9px">THEME</div><div class="theme">${esc(c.theme)}</div><div style="font-size:12px;color:#45433F">${esc(c.concept)}</div><div>${arr(c.keywords).map((k) => `<span class="fo-word">${esc(k)}</span>`).join('')}</div></div>`)}`;
      }
      case 'gallery': {
        const c = R.creative;
        if (!c) return fo(12560, 180, 170, 50, `<div class="fo-bubble">그림을 거는 중<span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></div>`);
        const exs = arr(c.examples).slice(0, 5);
        const gap = exs.length > 4 ? 250 : 300;
        return exs.map((e, i) => {
          const x = 12650 + i * gap, y = GY - 236;
          const rec = c.selection && c.selection.recommended && (c.selection.recommended === e.title || String(c.selection.recommended).includes(e.title));
          return `<g data-k="fr-${i}">
            <rect class="ln d fill-paper" x="${x - 105}" y="${y}" width="210" height="150"/>
            <rect class="ln thin" x="${x - 98}" y="${y + 7}" width="196" height="136"/>
            ${e.image ? `<image href="${esc(e.image)}" x="${x - 98}" y="${y + 7}" width="196" height="136" preserveAspectRatio="xMidYMid slice" class="pop in"/>` : fo(x - 90, y + 40, 180, 80, `<div class="fo-plain" style="text-align:center;font-weight:800;font-size:15px">${esc(e.headline || e.title)}</div>`)}
            ${rec ? `<circle cx="${x + 98}" cy="${y}" r="9" class="fill-y" stroke="#141414"/>` : ''}
            <text class="lbl-s" x="${x - 105}" y="${y + 170}">${esc(e.direction || '')}</text>
            <text class="lbl" x="${x - 105}" y="${y + 186}" style="font-weight:700">${esc(e.title || '')}</text>
          </g>`;
        }).join('');
      }
      default: return '';
    }
  }

  updateTunnelLight(run) {
    const dark = this.svg.querySelector('#tunnelDark');
    const hatch = this.svg.querySelector('#tunnelHatch');
    const t = run.results && run.results.tunnel;
    const done = t ? arr(t.layers).filter((l) => !l.error).length : 0;
    const total = (run.results.brief && run.results.brief.plan && run.results.brief.plan.layers.length) || 4;
    const light = t && t.synth ? 1 : done / total;
    // 레이어가 겹칠수록 터널이 밝아진다
    dark.style.opacity = String(Math.max(0, 0.95 - light * 0.95));
    hatch.classList.toggle('hidden', light < 0.01);
    hatch.querySelectorAll('.hatch').forEach((p) => {
      const tt = parseFloat(p.dataset.t);
      p.style.opacity = String(Math.max(0.08, (1 - tt) * (1 - light) + 0.12));
    });
    this.svg.querySelector('#exitRays').classList.toggle('shown', !!(t && t.synth));
  }

  updateFlag(run) {
    const g = this.svg.querySelector('#cflag');
    if (!g) return;
    const st = run.stages.concept || {};
    const h = (run.gates && run.gates.C && run.gates.C.history) || [];
    const last = h[h.length - 1];
    let txt = '', fill = 'fill-paper';
    if (st.status === 'waiting') { txt = 'C · 판정 대기'; fill = 'fill-y'; }
    else if (last && last.decision === 'go') { txt = last.preliminary ? 'C · 예비 GO' : 'C · GO'; fill = 'fill-ink'; }
    else if (st.status === 'running') txt = 'C · 그리는 중';
    g.innerHTML = `<path class="ln flag-wave ${fill}" d="M0,-190 H92 L80,-174 L92,-158 H0"/>${txt ? `<text class="lbl-s" x="6" y="-171" style="font-size:10px;font-weight:700;${fill === 'fill-ink' ? 'fill:#F4F2EC' : ''}">${esc(txt)}</text>` : ''}`;
  }

  updateSpeech(run) {
    const last = arr(run.lines)[run.lines.length - 1];
    if (!last || last.at === this.lastLineAt) return;
    this.lastLineAt = last.at;
    this.speech = { text: last.text, who: last.who, until: performance.now() + 7000 };
  }

  /* ---------- 그리기 ---------- */
  drawNew(root) {
    const sid = root.parentNode.dataset.scene;
    root.querySelectorAll('.d').forEach((el, i) => {
      const k = el.closest('[data-k]');
      const key = `${sid}:${k ? k.dataset.k : ''}:${k ? [...k.querySelectorAll('.d')].indexOf(el) : i}`;
      if (this.drawn.has(key)) return;
      this.drawn.add(key);
      this.drawEl(el);
    });
  }

  drawEl(el) {
    try {
      const len = el.getTotalLength ? el.getTotalLength() : 0;
      if (!len) return;
      el.style.transition = 'none';
      el.style.strokeDasharray = `${len} ${len}`;
      el.style.strokeDashoffset = String(len);
      el.getBoundingClientRect();
      requestAnimationFrame(() => { el.style.transition = ''; el.style.strokeDashoffset = '0'; });
      setTimeout(() => { el.style.strokeDasharray = ''; }, 2200);
    } catch { /* noop */ }
  }

  revealUpTo(x) {
    for (const s of SCENES) {
      const g = this.svg.querySelector(`#sc-${s.id}`);
      if (g.classList.contains('shown')) continue;
      if (x > s.x - 380 || (this.run && this.run.stages[s.stage] && this.run.stages[s.stage].status !== 'pending')) {
        g.classList.add('shown');
        g.querySelectorAll('.static .d').forEach((el) => this.drawEl(el));
      }
    }
  }

  focus(stageId) {
    const s = SCENES.find((v) => v.stage === stageId || v.id === stageId);
    if (!s) return;
    this.userScrollAt = performance.now() + 4000;
    const sc = this.scale();
    this.scroller.scrollTo({ left: Math.max(0, s.x * sc - 40), behavior: 'smooth' });
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    const d = this.target - this.x;
    const step = Math.sign(d) * Math.min(Math.abs(d), Math.max(0.8, Math.min(Math.abs(d) > 1200 ? 48 : 9, Math.abs(d) * 0.035)));
    const moving = Math.abs(d) > 0.5;
    if (moving) this.x += step;
    const x = this.x;
    this.reachRect.setAttribute('width', String(x + 900));
    this.revealUpTo(x);

    // 탈것 모드
    const inPlane = x > PLANE[0] && x < PLANE[1];
    const inCar = x > CAR[0] && x < CAR[1];
    const px = inPlane ? x : x <= PLANE[0] ? PLANE[0] : PLANE[1];
    const py = flightY(px) + (inPlane ? Math.sin(performance.now() / 500) * 3 : 0);
    const tilt = inPlane ? Math.max(-10, Math.min(10, (flightY(px + 20) - flightY(px - 20)) * 0.6)) : 0;
    this.planeG.setAttribute('transform', `translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${tilt.toFixed(1)})`);
    const cx = inCar ? x : x <= CAR[0] ? CAR[0] : CAR[1];
    this.carG.setAttribute('transform', `translate(${cx.toFixed(1)},${GY})`);
    this.carG.querySelectorAll('.wheel').forEach((w) => { w.style.animationPlayState = inCar && moving ? 'running' : 'paused'; });
    const walking = !inPlane && !inCar;
    this.walkerG.style.display = walking ? '' : 'none';
    const wy = groundY(x);
    this.walkerG.setAttribute('transform', `translate(${x.toFixed(1)},${wy.toFixed(1)}) scale(1.25)`);
    this.walkerG.classList.toggle('moving', moving && walking);

    // 판단 브레인 — 화가 곁을 떠다니며 개입할 때 빛을 비춘다
    const oy = (inPlane ? py - 70 : inCar ? GY - 120 : wy - 150) + Math.sin(performance.now() / 700) * 5;
    const ox = (inPlane || inCar ? x - 90 : x - 60);
    this.orbG.setAttribute('transform', `translate(${ox.toFixed(1)},${oy.toFixed(1)})`);
    const active = this.run && arr(this.run.agents).some((a) => a.key === 'brain' && a.status === 'working');
    this.orbG.querySelector('.orb-beam').style.opacity = active ? '1' : '0';
    this.orbG.querySelector('.orb-body').style.transform = active ? `scale(${1 + Math.sin(performance.now() / 160) * 0.08})` : '';
    const st = this.orbG.querySelector('.orb-stamp');
    if (this.stamp && performance.now() < this.stamp.until) { if (st._v !== this.stamp.key) { st._v = this.stamp.key; st.innerHTML = `<g transform="translate(-60,-58)"><rect width="120" height="24" rx="12" fill="${this.stamp.verdict === '통과' ? '#141414' : this.stamp.verdict === '보완' ? '#FFD23C' : '#F4F2EC'}" stroke="${this.stamp.verdict === '재작업' ? '#B4471F' : '#141414'}"/><text x="60" y="16" text-anchor="middle" style="font-size:11px;font-weight:800;fill:${this.stamp.verdict === '통과' ? '#F4F2EC' : this.stamp.verdict === '재작업' ? '#B4471F' : '#141414'}">${esc(this.stamp.label)}</text></g>`; } }
    else if (st._v) { st._v = ''; st.innerHTML = ''; }

    // 말풍선
    if (this.speech && performance.now() < this.speech.until) {
      const sy = inPlane ? py - 90 : inCar ? GY - 150 : wy - 150;
      const html = `<foreignObject x="${(x - 20).toFixed(0)}" y="${sy.toFixed(0)}" width="280" height="64"><div xmlns="http://www.w3.org/1999/xhtml"><div class="fo-bubble"><b style="font-size:10px">${esc(this.speech.who)}</b> ${esc(this.speech.text)}</div></div></foreignObject>`;
      if (this.speechG._h !== html) { this.speechG.innerHTML = html; this.speechG._h = html; }
    } else if (this.speechG._h) { this.speechG.innerHTML = ''; this.speechG._h = ''; }

    // 카메라 따라가기
    if (this.follow && performance.now() - this.userScrollAt > 5000) {
      const sc = this.scale();
      const want = Math.max(0, x * sc - this.scroller.clientWidth * 0.36);
      const cur = this.scroller.scrollLeft;
      if (Math.abs(want - cur) > 1) this.scroller.scrollLeft = cur + (want - cur) * 0.06;
    }
  }
}
