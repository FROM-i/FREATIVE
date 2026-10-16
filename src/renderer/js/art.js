// 라인 드로잉 소품 — 모두 1px~1.4px 선, 블랙 & 오프화이트. 노랑은 붓끝과 "지금"에만.
// 각 함수는 SVG 문자열을 돌려준다. class "d" = 그려지는(stroke-dash) 선.

export const L = 'ln d';

/** 화가 — 발 기준 (0,0), 오른쪽을 본다 */
export function painter({ brush = true, extra = '' } = {}) {
  return `
  <g class="painter-body">
    <g class="leg-a"><path class="ln" d="M-5,-22 L-7,0 L-1,0"/></g>
    <g class="leg-b"><path class="ln" d="M5,-22 L7,0 L13,0"/></g>
    <path class="ln fill-paper" d="M-12,-50 C-14,-40 -17,-30 -19,-21 L19,-21 C17,-30 14,-40 12,-50 Z"/>
    <path class="ln thin" d="M-7,-33 h7 M-7,-29 h5"/>
    <path class="ln" d="M-10,-46 C-16,-40 -18,-34 -16,-27"/>
    ${brush ? `<g class="brush-arm" style="transform-origin:10px -46px">
      <path class="ln" d="M10,-46 C17,-43 21,-39 25,-35"/>
      <path class="ln" d="M25,-35 L37,-49"/>
      <path d="M37,-49 L41,-54" stroke="var(--yellow)" stroke-width="4" stroke-linecap="round"/>
      <path class="ln thin" d="M36.5,-48 L41.5,-54.5" />
    </g>` : `<path class="ln" d="M10,-46 C16,-40 18,-34 16,-27"/>`}
    <path class="ln fill-paper" d="M-9,-52 q9,5 18,0"/>
    <circle class="ln fill-paper" cx="0" cy="-64" r="13"/>
    <path class="fill-ink" d="M-14.5,-67 C-15,-80 12,-83 16,-71 C9,-69.5 -5,-68 -14.5,-67 Z"/>
    <path class="ln" d="M2,-79 l1.5,-4"/>
    <circle class="fill-ink" cx="5" cy="-62" r="1.3"/><circle class="fill-ink" cx="-3" cy="-62" r="1.3"/>
    <path class="ln thin" d="M-0.5,-57.5 q2.6,2.2 5.2,0"/>
    <circle cx="8.5" cy="-58.5" r="2" fill="rgba(20,20,20,.08)"/>
    ${extra}
  </g>`;
}

/** 조수 — 작고 둥근, 동그란 안경. 발 기준 (0,0) */
export function assistant({ item = 'note' } = {}) {
  const it = item === 'case'
    ? `<rect class="ln fill-paper" x="8" y="-20" width="12" height="9" rx="1.5"/><path class="ln thin" d="M12,-20 v-2 h4 v2"/>`
    : item === 'lamp'
      ? `<path class="ln" d="M9,-24 L15,-30"/><circle cx="16" cy="-31" r="3" fill="var(--yellow)" stroke="var(--ink)" stroke-width="1"/>`
      : `<rect class="ln fill-paper" x="8" y="-24" width="9" height="11" rx="1"/><path class="ln thin" d="M10,-20 h5 M10,-17 h4"/>`;
  return `
  <g class="asst-body">
    <path class="ln" d="M-4,-8 L-5,0 M4,-8 L5,0"/>
    <ellipse class="ln fill-paper" cx="0" cy="-17" rx="10" ry="11"/>
    <circle class="ln fill-paper" cx="0" cy="-35" r="8.5"/>
    <path class="ln" d="M-8,-38 C-6,-46 6,-46 8,-38"/>
    <circle class="ln thin fill-paper" cx="-3.3" cy="-35" r="2.6"/><circle class="ln thin fill-paper" cx="3.3" cy="-35" r="2.6"/>
    <path class="ln thin" d="M-0.7,-35 h1.4"/>
    <path class="ln thin" d="M-1.5,-30.5 q1.5,1.2 3,0"/>
    ${it}
  </g>`;
}

/** 타임머신 비행기 — 몸통에 시계, 날개, 프로펠러. 중심 (0,0) */
export function plane() {
  return `
  <g class="plane-body">
    <path class="ln thin dash" d="M-150,4 L-80,2 M-140,16 L-86,12"/>
    <path class="ln fill-paper" d="M-72,-24 L-60,-24 L-44,-8 L-58,-6 Z"/>
    <path class="ln fill-paper" d="M-62,0 C-62,-18 40,-24 62,-7 C68,-3 68,4 60,6 C30,13 -50,15 -62,0 Z"/>
    <path class="ln fill-paper" d="M-12,4 L-34,26 L4,26 L14,6"/>
    <circle class="ln fill-paper" cx="-22" cy="-3" r="9"/>
    <g class="spin-slow" style="transform-origin:-22px -3px"><path class="ln thin" d="M-22,-3 L-22,-10"/></g>
    <g class="spin" style="transform-origin:-22px -3px"><path class="ln thin" d="M-22,-3 L-17,-3"/></g>
    <path class="ln thin" d="M-22,-12 v1.5 M-22,6 v-1.5 M-31,-3 h1.5 M-13,-3 h-1.5"/>
    <path class="ln fill-paper" d="M2,-16 C4,-30 26,-30 30,-14"/>
    <g transform="translate(16,-14) scale(.62)">
      <circle class="ln fill-paper" cx="0" cy="-12" r="13"/>
      <path class="fill-ink" d="M-14.5,-15 C-15,-28 12,-31 16,-19 C9,-17.5 -5,-16 -14.5,-15 Z"/>
      <circle class="fill-ink" cx="5" cy="-10" r="1.4"/><circle class="fill-ink" cx="-3" cy="-10" r="1.4"/>
    </g>
    <g transform="translate(-4,-12) scale(.5)">
      <circle class="ln fill-paper" cx="0" cy="-10" r="9"/>
      <circle class="ln thin" cx="-3.3" cy="-10" r="2.6"/><circle class="ln thin" cx="3.3" cy="-10" r="2.6"/>
    </g>
    <ellipse class="ln prop" cx="67" cy="0" rx="2" ry="15"/>
    <circle class="fill-ink" cx="65" cy="0" r="2"/>
    <g class="suitcase-count"></g>
  </g>`;
}

/** 자동차 — 바닥 기준 (0,0) */
export function car() {
  const wheel = (cx) => `<g transform="translate(${cx},-11)"><circle class="ln fill-paper" r="10"/><g class="spin wheel"><path class="ln thin" d="M-7,0 H7 M0,-7 V7"/></g><circle class="fill-ink" r="1.6"/></g>`;
  return `
  <g class="car-body">
    <rect class="ln fill-paper" x="-24" y="-66" width="26" height="14" rx="2"/>
    <path class="ln thin" d="M-16,-66 v-3 h10 v3 M-11,-66 v14"/>
    <path class="ln fill-paper" d="M-52,-11 L-52,-27 C-52,-31 -48,-33 -44,-33 L-28,-34 L-16,-50 L22,-50 L36,-34 L48,-32 C53,-31 56,-27 56,-22 L56,-11 Z"/>
    <path class="ln thin" d="M-24,-34 L-13,-46 L2,-46 L2,-34 Z M6,-34 L6,-46 L20,-46 L31,-34 Z"/>
    <g transform="translate(-6,-36) scale(.5)">
      <circle class="ln fill-paper" cx="0" cy="-12" r="13"/>
      <path class="fill-ink" d="M-14.5,-15 C-15,-28 12,-31 16,-19 C9,-17.5 -5,-16 -14.5,-15 Z"/>
      <circle class="fill-ink" cx="5" cy="-10" r="1.4"/>
    </g>
    <g transform="translate(16,-37) scale(.46)">
      <circle class="ln fill-paper" cx="0" cy="-10" r="9"/>
      <circle class="ln thin" cx="-3.3" cy="-10" r="2.6"/><circle class="ln thin" cx="3.3" cy="-10" r="2.6"/>
    </g>
    <circle cx="52" cy="-24" r="3" fill="var(--yellow)" stroke="var(--ink)" stroke-width="1"/>
    <path class="ln thin" d="M-52,-20 h-6"/>
    ${wheel(-30)}${wheel(32)}
  </g>`;
}

/** 이젤 + 캔버스. 바닥 기준, 캔버스 크기 w×h */
export function easel(w = 220, h = 160, key = '') {
  const top = -h - 70;
  return `
  <g data-k="${key}">
    <path class="${L}" d="M${-w * 0.3},0 L${-w * 0.1},${top + 20} M${w * 0.3},0 L${w * 0.1},${top + 20} M0,${top + 10} L0,-30"/>
    <path class="${L}" d="M${-w / 2 - 6},${top + h + 12} H${w / 2 + 6}"/>
    <rect class="${L} fill-paper" x="${-w / 2}" y="${top}" width="${w}" height="${h}" rx="2"/>
  </g>`;
}

export function cloud(x, y, s = 1, cls = '') {
  return `<path class="${L} ${cls}" transform="translate(${x},${y}) scale(${s})" d="M-40,0 C-48,0 -50,-12 -40,-14 C-40,-26 -22,-30 -16,-20 C-10,-34 14,-32 16,-18 C26,-22 36,-12 30,-4 C36,0 32,6 26,6 L-36,6 C-44,6 -46,0 -40,0 Z"/>`;
}

/** 작업실(아틀리에) — 바닥 기준 */
export function atelier() {
  return `
  <g>
    <path class="${L}" d="M-120,0 V-150 L-40,-210 L40,-150 V0"/>
    <path class="${L}" d="M-130,-142 L-40,-216 L50,-142"/>
    <rect class="${L}" x="-100" y="-120" width="44" height="40"/>
    <path class="${L} thin" d="M-78,-120 V-80 M-100,-100 H-56"/>
    <path class="${L}" d="M-20,0 V-86 H20 V0"/>
    <circle class="fill-ink" cx="12" cy="-42" r="2"/>
    <path class="${L}" d="M30,-150 V-196 H48 V-160"/>
    <path class="${L} thin" d="M38,-200 c-6,-10 6,-14 0,-24 M44,-204 c-6,-10 6,-14 0,-24"/>
    <path class="${L}" d="M70,0 V-64 M60,-64 H96 V-88 H60 Z"/>
    <path class="${L} thin" d="M66,-80 L78,-72 L90,-80"/>
  </g>`;
}

/** 종이비행기(미션 편지) */
export function paperPlane() {
  return `<path class="ln fill-paper" d="M0,0 L36,-12 L10,6 Z"/><path class="ln" d="M10,6 L12,14 L18,2"/><path class="ln thin" d="M10,6 L36,-12"/>`;
}

/* ---------- 사조 아이콘 (60×60) ---------- */
export const ISM_ICON = {
  'ISM-ARTCRAFT': '<path d="M30 52 C12 42 12 18 30 8 C48 18 48 42 30 52 Z"/><path d="M30 52 V14 M30 24 L22 18 M30 32 L39 25 M30 40 L22 34"/>',
  'ISM-NOUVEAU': '<path d="M8 52 C16 8 36 52 46 14 C49 4 58 8 54 16 C51 22 44 18 47 13"/><path d="M8 52 C20 40 26 46 30 52"/>',
  'ISM-DECO': '<path d="M6 50 A24 24 0 0 1 54 50 Z"/><path d="M14 50 A16 16 0 0 1 46 50"/><path d="M30 50 V26 M30 50 L13 33 M30 50 L47 33 M30 50 L8 44 M30 50 L52 44"/>',
  'ISM-FUTUR': '<path d="M6 18 H36 M12 28 H46 M4 38 H40 M16 48 H30"/><path d="M40 22 L54 30 L40 38"/>',
  'ISM-DADA': '<circle cx="17" cy="17" r="8"/><path d="M36 8 L52 20 M52 8 L36 20"/><rect x="10" y="34" width="16" height="16" transform="rotate(-14 18 42)"/><path d="M34 50 L42 30 L50 50 Z"/>',
  'ISM-SUPREM': '<rect x="14" y="14" width="26" height="26" transform="rotate(18 27 27)"/><path d="M36 46 L54 40"/><circle cx="48" cy="14" r="3"/>',
  'ISM-CONSTR': '<path d="M6 54 L54 6"/><circle cx="20" cy="20" r="11"/><path d="M30 44 H54 M36 50 H54"/>',
  'ISM-STIJL': '<rect x="6" y="6" width="48" height="48"/><path d="M22 6 V54 M22 34 H54 M42 34 V54 M6 20 H22"/>',
  'ISM-BAUHAUS': '<circle cx="17" cy="20" r="10"/><path d="M38 10 L50 30 L26 30 Z"/><rect x="20" y="36" width="18" height="18"/>',
  'ISM-SWISS': '<path d="M10 6 V54 M24 6 V54 M38 6 V54 M52 6 V54" stroke-opacity=".35"/><path d="M10 14 H44 M10 22 H32 M10 40 H50 M10 46 H40 M10 52 H28"/>',
  'ISM-BRUTAL': '<rect x="8" y="30" width="44" height="22"/><rect x="16" y="12" width="28" height="18"/><path d="M16 38 H24 M30 38 H38 M44 38 H48"/>',
  'ISM-POSTMOD': '<path d="M6 24 C12 14 18 34 24 24 C30 14 36 34 42 24 C48 14 54 34 58 26"/><circle cx="14" cy="46" r="5"/><path d="M30 52 L38 38 L46 52 Z"/><circle cx="50" cy="10" r="2"/><circle cx="8" cy="8" r="2"/>',
  'ISM-DECON': '<rect x="8" y="8" width="30" height="30"/><rect x="20" y="22" width="32" height="30" transform="rotate(8 36 37)"/><path d="M4 46 L30 52"/>',
  'ISM-PUNK': '<path d="M6 14 L14 8 L20 16 L28 8 L34 16 L42 8 L48 16 L54 10"/><path d="M14 30 L46 50 M46 30 L14 50"/>',
  'ISM-JP': '<path d="M44 12 C30 4 10 14 10 32 C10 48 28 56 42 48 C50 44 52 36 50 30"/>',
  'ISM-KR': '<path d="M22 8 H38 M24 8 C24 14 12 18 12 32 C12 46 22 54 30 54 C38 54 48 46 48 32 C48 18 36 14 36 8"/><path d="M14 30 H46" stroke-opacity=".3"/>',
};
export function ismIcon(id, size = 60) {
  return `<svg viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true">${ISM_ICON[id] || '<circle cx="30" cy="30" r="20"/>'}</svg>`;
}

/* ---------- 결과물 유형 아이콘 (32×32) ---------- */
export const TYPE_ICON = {
  proposal: '<path d="M8 4 H20 L26 10 V28 H8 Z"/><path d="M20 4 V10 H26"/><circle cx="17" cy="17" r="4"/><path d="M15 23 H19 M17 21 V23"/>',
  ad: '<rect x="4" y="7" width="24" height="18" rx="1"/><path d="M8 20 H18 M8 16 H14"/><path d="M22 12 L26 10 V22 L22 20 Z"/>',
  video: '<rect x="4" y="7" width="24" height="18" rx="1"/><path d="M14 12 L20 16 L14 20 Z"/><path d="M4 28 H28"/><circle cx="12" cy="28" r="1.5"/>',
  uiux: '<rect x="10" y="3" width="13" height="26" rx="2.5"/><path d="M14.5 6 H18.5"/><rect x="13" y="10" width="7" height="6"/><path d="M13 20 H20 M13 23 H17"/>',
  kv: '<rect x="4" y="6" width="24" height="20"/><path d="M4 22 L12 14 L18 20 L22 16 L28 22"/><circle cx="21" cy="11" r="2"/>',
  page: '<rect x="4" y="5" width="24" height="22" rx="1"/><path d="M4 10 H28"/><circle cx="7" cy="7.5" r=".8"/><circle cx="10" cy="7.5" r=".8"/><path d="M8 15 H20 M8 19 H24 M8 23 H16"/>',
  signage: '<rect x="7" y="4" width="18" height="15" rx="1"/><path d="M16 19 V28 M10 28 H22"/><path d="M11 9 H21 M11 13 H17"/>',
  promotion: '<path d="M4 11 H28 V15 C26 15 26 19 28 19 V23 H4 V19 C6 19 6 15 4 15 Z"/><path d="M12 11 V23" stroke-dasharray="2 2"/><path d="M17 15 L19 17 L23 13"/>',
};
export function typeIcon(id) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${TYPE_ICON[id] || '<circle cx="16" cy="16" r="10"/>'}</svg>`;
}
