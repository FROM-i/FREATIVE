// 브레인 맵의 형상 — 프로젝트마다 고를 수 있다.
//   brain   기본. 옆에서 본 뇌 (js/graph/brain.js)
//   stack   층을 쌓은 형상. 층마다 이름 · 색 · 맡는 노드군을 정한다. 예: 햄버거(번 · 패티 · 야채 · 토마토 · 양파 · 번)
// 형상이 바뀌어도 노드 · 판단 · 연결은 그대로다. 바뀌는 것은 자리와 색뿐이다.
import * as B from './brain.js';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const inPoly = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const rgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '207,227,242'; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };

export const brainShape = {
  id: 'brain', DOTS: B.DOTS, LOBES: B.LOBES, CENTER: B.CENTER, CORE: B.CORE, BOX: B.BOX,
  seats: B.seats, inside: B.inBrain, thickness: B.thickness,
  caption: (family) => B.onCortex(B.LOBES[family].caption.deg, B.LOBES[family].caption.depth),
  outlines: [{ pts: B.OUTLINE.cerebrum, close: true, alpha: 0.34 }, ...[...B.OUTLINE.stem, ...B.OUTLINE.cerebellum].map((pts) => ({ pts, close: false, alpha: 0.24 })), ...B.OUTLINE.sulci.map((pts) => ({ pts, close: false, alpha: 0.2 }))],
  labels: [], base: { x: B.CENTER.x + 40, y: 806 },
};

/** 층이 맡을 수 있는 것 — 노드군 셋과 그 밖의 자리 */
export const LAYER_ROLES = [
  { id: 'identity', name: '아이덴티티 노드' }, { id: 'airplane', name: '에어플레인 노드(사조)' }, { id: 'tunnel', name: '터널 노드' },
  { id: 'core', name: '이슈와 인사이트' }, { id: 'fact', name: '팩트' }, { id: 'mission', name: '미션' }, { id: 'none', name: '비워 둔다' },
];
/** 층의 모양 */
export const LAYER_FORMS = [{ id: 'dome', name: '둥근 윗면' }, { id: 'slab', name: '납작한 판' }, { id: 'wave', name: '물결 판' }, { id: 'base', name: '둥근 바닥' }];

/** 미리 만든 형상 */
export const PRESETS = {
  burger: { kind: 'stack', name: '햄버거', layers: [
    { id: 'bun-top', name: '번', form: 'dome', color: '#E0A45C', role: 'identity', w: 620, h: 150 },
    { id: 'patty', name: '패티', form: 'slab', color: '#8A4B2A', role: 'core', w: 650, h: 84 },
    { id: 'lettuce', name: '야채', form: 'wave', color: '#7CC36B', role: 'airplane', w: 690, h: 64 },
    { id: 'tomato', name: '토마토', form: 'slab', color: '#E5533D', role: 'tunnel', w: 610, h: 52 },
    { id: 'onion', name: '양파', form: 'slab', color: '#E9D9F0', role: 'fact', w: 570, h: 40 },
    { id: 'bun-bottom', name: '번', form: 'base', color: '#D69A52', role: 'mission', w: 620, h: 96 },
  ] },
};

const CX = 520; const TOP = 96; const GAP = 12;
function layerPoly(l, y0) {
  const x0 = CX - l.w / 2; const x1 = CX + l.w / 2; const y1 = y0 + l.h; const pts = [];
  if (l.form === 'dome') { for (let i = 0; i <= 32; i++) { const a = Math.PI - (i / 32) * Math.PI; pts.push([CX + Math.cos(a) * (l.w / 2), y1 - Math.sin(a) * l.h]); } return pts; }
  if (l.form === 'base') { const r = Math.min(l.h * 0.8, 60); pts.push([x0, y0], [x1, y0]); for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); pts.push([x1 - r + Math.cos(a) * r, y1 - r + Math.sin(a) * r]); } for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + (i / 10) * (Math.PI / 2); pts.push([x0 + r + Math.cos(a) * r, y1 - r + Math.sin(a) * r]); } return pts; }
  if (l.form === 'wave') { const r = Math.min(l.h / 2, 18); pts.push([x0 + r, y0], [x1 - r, y0], [x1, y0 + r]); for (let i = 0; i <= 44; i++) { const x = x1 - (i / 44) * l.w; pts.push([x, y1 - 10 + Math.sin((i / 44) * Math.PI * 11) * 10]); } pts.push([x0, y0 + r]); return pts; }
  const r = Math.min(l.h / 2, 22);
  for (const [cx, cy, a0] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]) for (let i = 0; i <= 6; i++) { const a = ((a0 + i * 15) * Math.PI) / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

/** 층을 쌓은 형상을 만든다. def.layers: [{ id, name, form, color, role, w, h }] 위에서 아래 순서 */
export function stackShape(def) {
  const src = (Array.isArray(def?.layers) ? def.layers : []).filter((l) => l && l.h > 0 && l.w > 0).slice(0, 9);
  const total = src.reduce((s, l) => s + l.h, 0) + GAP * Math.max(0, src.length - 1);
  const scale = Math.min(1, 620 / (total || 1));
  let y = TOP + (620 - total * scale) / 2;
  const layers = src.map((l) => { const h = l.h * scale; const L = { ...l, h, y0: y, y1: y + h, rgb: rgb(l.color), poly: layerPoly({ ...l, h }, y) }; y += h + GAP * scale; return L; });
  const at = (x, yy) => layers.find((l) => inPoly(l.poly, x, yy)) || null;
  const inside = (x, yy) => !!at(x, yy);
  const maxW = Math.max(400, ...layers.map((l) => l.w));
  // 가운데가 두껍고 좌우 끝으로 갈수록 얇다 — 돌려 볼 때 둥글게 읽힌다
  const thickness = (x, yy) => { const l = at(x, yy); const half = (l ? l.w : maxW) / 2; const t = Math.min(1, Math.abs(x - CX) / half); return Math.max(12, 120 * Math.sqrt(1 - t * t)); };
  const byRole = (role) => layers.find((l) => l.role === role) || null;
  const mid = (l) => ({ x: CX, y: (l.y0 + l.y1) / 2 + (l.form === 'dome' ? l.h * 0.18 : 0) });
  const coreL = byRole('core') || layers[Math.floor(layers.length / 2)] || { y0: 300, y1: 380, w: 500, h: 80, form: 'slab' };
  const CORE = mid(coreL);
  const CENTER = { x: CX, y: TOP + 310 };

  const DOTS = []; const step = 14; const row = step * 0.866;
  for (const side of [-1, 1]) {
    const shift = side < 0 ? step / 2 : 0;
    for (let j = 0, yy = TOP - 10 + shift * 0.6; yy < TOP + 660; yy += row, j++) for (let x = CX - 380 + shift + (j % 2 ? step / 2 : 0); x < CX + 380; x += step) {
      const key = `${side}|${j}|${Math.round(x)}`; const px = x + (hash(`x${key}`) - 0.5) * 6; const py = yy + (hash(`y${key}`) - 0.5) * 6;
      const l = at(px, py); if (!l) continue;
      DOTS.push({ x: px, y: py, z: side * thickness(px, py) * (0.7 + hash(`z${key}`) * 0.3), front: side > 0, r: 1.0 + hash(`r${key}`) * 1.0, a: 0.75 + hash(`a${key}`) * 0.6, heat: 0, c: l.rgb });
    }
  }

  // 노드군의 이름표 — 층의 왼쪽 · 오른쪽에 번갈아 단다
  const FAMILY = { identity: { label: 'IDENTITY', sub: '판단의 출발점' }, airplane: { label: 'AIRPLANE', sub: '사조 여행' }, tunnel: { label: 'TUNNEL', sub: '레이어' } };
  const LOBES = {}; const captions = {}; const labels = [];
  layers.forEach((l, i) => {
    const left = i % 2 === 0; const x = left ? CX - l.w / 2 - 34 : CX + l.w / 2 + 34; const yy = (l.y0 + l.y1) / 2 - 8;
    if (FAMILY[l.role] && !LOBES[l.role]) { LOBES[l.role] = { label: `${FAMILY[l.role].label} · ${l.name}`, sub: FAMILY[l.role].sub, caption: { align: left ? 'right' : 'left' }, color: l.rgb }; captions[l.role] = { x, y: yy }; }
    else labels.push({ x, y: yy + 8, text: `${l.name}${l.role !== 'none' ? ` · ${LAYER_ROLES.find((r) => r.id === l.role)?.name || ''}` : ''}`, align: left ? 'right' : 'left', color: l.rgb });
  });
  // 맡을 층이 없는 노드군은 형상 아래에 이름만 둔다
  Object.keys(FAMILY).filter((f) => !LOBES[f]).forEach((f, i) => { LOBES[f] = { label: FAMILY[f].label, sub: FAMILY[f].sub, caption: { align: 'center' } }; captions[f] = { x: CX - 260 + i * 260, y: TOP + 668 }; });

  function seats(nodes) {
    const seat = new Map();
    const rowIn = (l, list, k = 0.1) => { if (!l) return; const usable = l.w - 110; list.forEach((n, i) => { const t = list.length > 1 ? i / (list.length - 1) : 0.5; const m = mid(l); seat.set(n.id, { x: CX - usable / 2 + usable * t, y: m.y + (list.length > 5 ? (i % 2 ? 1 : -1) * Math.min(14, l.h * 0.22) : 0), k }); }); };
    for (const f of ['identity', 'airplane', 'tunnel']) { const l = byRole(f); const mine = nodes.filter((n) => n.type === 'lens' && n.family === f); if (l) rowIn(l, mine, 0.09); else mine.forEach((n, i) => seat.set(n.id, { x: captions[f].x - 60 + (i % 6) * 24, y: captions[f].y - 40 - Math.floor(i / 6) * 16, k: 0.09 })); }
    const issues = nodes.filter((n) => n.type === 'issue'); const usable = Math.min(coreL.w - 220, 90 * Math.max(1, issues.length));
    issues.forEach((n, i) => { const t = issues.length > 1 ? i / (issues.length - 1) : 0.5; seat.set(n.id, { x: CX - usable / 2 + usable * t, y: CORE.y, k: 0.1 }); });
    rowIn(byRole('fact') || byRole('mission'), nodes.filter((n) => n.type === 'fact'), 0.14);
    const m = byRole('mission'); const mm = m ? mid(m) : { x: CX, y: TOP + 640 };
    for (const n of nodes) { if (n.type === 'gate') seat.set(n.id, { x: mm.x - 130, y: mm.y, k: 0.12 }); if (n.type === 'project') seat.set(n.id, { x: mm.x + 60, y: mm.y, k: 0.12 }); }
    return seat;
  }

  return {
    id: `stack:${def?.name || ''}`, DOTS, LOBES, CENTER, CORE, BOX: { x0: -60, y0: -10, x1: 1080, y1: 830 },
    seats, inside, thickness, caption: (family) => captions[family],
    outlines: layers.map((l) => ({ pts: l.poly, close: true, alpha: 0.5, color: l.rgb })),
    labels, base: { x: CX, y: TOP + 700 }, layers,
  };
}

const cache = new Map();
/** 프로젝트가 고른 형상. settings.look = { kind: 'brain' } | { kind: 'burger' } | { kind: 'stack', layers } */
export function shapeFor(project) {
  const look = project?.settings?.look;
  if (!look || look.kind === 'brain' || !look.kind) return brainShape;
  const def = look.kind === 'stack' && Array.isArray(look.layers) && look.layers.length ? look : (PRESETS[look.kind] || null);
  if (!def) return brainShape;
  const key = JSON.stringify(def);
  if (!cache.has(key)) { if (cache.size > 12) cache.clear(); cache.set(key, stackShape(def)); }
  return cache.get(key);
}
