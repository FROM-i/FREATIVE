// 브레인 맵의 형상 — 프로젝트마다 고를 수 있다.
//   brain   기본. 옆에서 본 뇌 (js/graph/brain.js)
//   stack   층을 쌓은 형상. 층마다 이름 · 색 · 맡는 노드군을 정한다. 예: 햄버거(번 · 패티 · 야채 · 토마토 · 양파 · 번)
//   figure  외곽선으로 그린 형상. 부분마다 이름 · 색 · 맡는 노드군을 정한다. 예: 전구, 번개, 폰을 쥔 손, 클라우드와 서버
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

// ---------- 외곽선 도구 (figure) ----------
const ell = (cx, cy, rx, ry, a0 = 0, a1 = 360, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const rrect = (x0, y0, x1, y1, r) => { r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2); return [...ell(x1 - r, y0 + r, r, r, -90, 0, 6), ...ell(x1 - r, y1 - r, r, r, 0, 90, 6), ...ell(x0 + r, y1 - r, r, r, 90, 180, 6), ...ell(x0 + r, y0 + r, r, r, 180, 270, 6)]; };
/** 두 점을 잇는 둥근 막대 */
const capsule = (ax, ay, bx, by, r) => { const d = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI; return [...ell(bx, by, r, r, d - 90, d + 90, 10), ...ell(ax, ay, r, r, d + 90, d + 270, 10)]; };
/** 다각형에서 y0~y1 띠만 남긴다 */
function band(poly, y0, y1) {
  const cut = (pts, y, keepBelow) => { const out = []; const ok = (p) => (keepBelow ? p[1] >= y : p[1] <= y);
    pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; if (ok(a)) out.push(a); if (ok(a) !== ok(b)) out.push([a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]); }); return out; };
  return cut(cut(poly, y0, true), y1, false);
}
/** 좌우 대칭 윤곽 — 높이마다 반폭을 준다 */
const profile = (half, y0, y1, cx = 520, n = 30) => { const ys = Array.from({ length: n + 1 }, (_, i) => y0 + ((y1 - y0) * i) / n); return [...ys.map((y) => [cx + half(y), y]), ...ys.reverse().map((y) => [cx - half(y), y])]; };

const bulbHalf = (y) => { const c = 330; const R = 235; if (y <= 450) return Math.sqrt(Math.max(0, R * R - (y - c) * (y - c))); const t = Math.min(1, (y - 450) / 92); return 96 + (200.5 - 96) * Math.pow(1 - t, 1.5); };
const BOLT = [[520, 96], [781, 96], [621, 330], [824, 330], [346, 716], [447, 440], [230, 440]];
const cloud = () => { const bumps = [[432, 178, 62], [520, 152, 82], [616, 176, 66]]; const top = []; for (let x = 372; x <= 680; x += 6) { let y = 222; for (const [cx, cy, r] of bumps) if (Math.abs(x - cx) < r) y = Math.min(y, cy - Math.sqrt(r * r - (x - cx) * (x - cx))); top.push([x, y]); } return [...top, [690, 230], [362, 230]]; };

/**
 * 미리 만든 외곽선 형상. parts: 위에서 아래 순서. 겹치는 곳은 앞에 적은 부분이 이긴다.
 * 좌표는 맵 좌표다(가로 가운데 520, 세로 96~716).
 */
export const FIGURES = {
  bulb: { name: '전구', parts: () => [
    { id: 'glow', name: '빛', color: '#FFD84A', role: 'identity', polys: [profile(bulbHalf, 96, 214)] },
    { id: 'glass', name: '유리', color: '#F2E9B8', role: 'airplane', polys: [profile(bulbHalf, 226, 330)] },
    { id: 'filament', name: '필라멘트', color: '#FF9D3D', role: 'core', polys: [profile(bulbHalf, 342, 438)] },
    { id: 'neck', name: '목', color: '#CFE3F2', role: 'tunnel', polys: [profile(bulbHalf, 450, 542)] },
    { id: 'socket', name: '소켓', color: '#9AA7B4', role: 'fact', polys: [rrect(410, 554, 630, 630, 14)] },
    { id: 'tip', name: '꼭지', color: '#6E7A86', role: 'mission', polys: [rrect(440, 642, 600, 706, 26)] },
  ] },
  bolt: { name: '번개', parts: () => [
    { id: 'b1', name: '섬광', color: '#FFF3A6', role: 'identity', polys: [band(BOLT, 96, 196)] },
    { id: 'b2', name: '줄기', color: '#FFE04A', role: 'airplane', polys: [band(BOLT, 208, 330)] },
    { id: 'b3', name: '꺾임', color: '#FFC61A', role: 'core', polys: [band(BOLT, 342, 440)] },
    { id: 'b4', name: '낙하', color: '#FFA51A', role: 'fact', polys: [band(BOLT, 452, 548)] },
    { id: 'b5', name: '가지', color: '#FF7A1A', role: 'tunnel', polys: [band(BOLT, 560, 640)] },
    { id: 'b6', name: '끝', color: '#E5533D', role: 'mission', polys: [band(BOLT, 652, 716)] },
  ] },
  phone: { name: '폰을 쥔 손', parts: () => { const body = rrect(380, 96, 680, 640, 36); return [
    { id: 'thumb', name: '엄지', color: '#F2B28C', role: 'none', polys: [capsule(724, 566, 664, 404, 34)] },
    { id: 'p1', name: '상단 바', color: '#8FB8FF', role: 'identity', polys: [band(body, 96, 184)] },
    { id: 'p2', name: '피드', color: '#CFE3F2', role: 'airplane', polys: [band(body, 196, 306)] },
    { id: 'p3', name: '화면', color: '#FFD84A', role: 'core', polys: [band(body, 318, 452)] },
    { id: 'p4', name: '알림', color: '#7CC36B', role: 'fact', polys: [band(body, 464, 562)] },
    { id: 'p5', name: '홈 바', color: '#6E7A86', role: 'none', polys: [band(body, 574, 640)] },
    { id: 'fingers', name: '손가락', color: '#F2B28C', role: 'tunnel', polys: [300, 372, 444, 516].map((y) => rrect(286, y - 30, 372, y + 30, 28)) },
    { id: 'palm', name: '손바닥', color: '#E09A72', role: 'mission', polys: [[[352, 652], [706, 652], [668, 716], [404, 716]]] },
  ]; } },
  server: { name: '클라우드와 서버', parts: () => [
    { id: 'cloud', name: '클라우드', color: '#8FB8FF', role: 'identity', polys: [cloud()] },
    { id: 'u1', name: '유닛 1', color: '#CFE3F2', role: 'airplane', polys: [rrect(310, 246, 730, 338, 12)] },
    { id: 'u2', name: '유닛 2', color: '#FFD84A', role: 'core', polys: [rrect(310, 350, 730, 446, 12)] },
    { id: 'u3', name: '유닛 3', color: '#7CC36B', role: 'tunnel', polys: [rrect(310, 458, 730, 526, 12)] },
    { id: 'u4', name: '유닛 4', color: '#9AA7B4', role: 'fact', polys: [rrect(310, 538, 730, 626, 12)] },
    { id: 'rail', name: '받침', color: '#6E7A86', role: 'mission', polys: [rrect(280, 638, 760, 704, 16)] },
  ] },
};

/** 층을 쌓은 형상을 만든다. def.layers: [{ id, name, form, color, role, w, h }] 위에서 아래 순서 */
export function stackShape(def) {
  const src = (Array.isArray(def?.layers) ? def.layers : []).filter((l) => l && l.h > 0 && l.w > 0).slice(0, 9);
  const total = src.reduce((s, l) => s + l.h, 0) + GAP * Math.max(0, src.length - 1);
  const scale = Math.min(1, 620 / (total || 1));
  let y = TOP + (620 - total * scale) / 2;
  const layers = src.map((l) => { const h = l.h * scale; const L = { ...l, h, y0: y, y1: y + h, x0: CX - l.w / 2, x1: CX + l.w / 2, cx: CX, polys: [layerPoly({ ...l, h }, y)] }; y += h + GAP * scale; return L; });
  return build(`stack:${def?.name || ''}`, layers);
}

/** 외곽선 형상을 만든다. def: { kind: 'bulb' | …, parts: { [부분 id]: { name, color, role } } } — parts는 고친 것만 */
export function figureShape(kind, overrides = {}) {
  const fig = FIGURES[kind]; if (!fig) return null;
  const layers = fig.parts().map((p) => { const o = overrides?.[p.id] || {}; const q = { ...p, ...(o.name ? { name: o.name } : {}), ...(o.color ? { color: o.color } : {}), ...(o.role ? { role: o.role } : {}) };
    const xs = q.polys.flat().map((pt) => pt[0]); const ys = q.polys.flat().map((pt) => pt[1]);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    return { ...q, form: 'figure', x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2 }; });
  return build(`figure:${kind}`, layers);
}
/** 고칠 수 있는 부분 목록 — 화면의 편집 칸이 쓴다 */
export const figureParts = (kind, overrides = {}) => (FIGURES[kind]?.parts() || []).map((p) => ({ id: p.id, name: overrides?.[p.id]?.name || p.name, color: overrides?.[p.id]?.color || p.color, role: overrides?.[p.id]?.role || p.role }));

/** 부분(층)들로 형상을 만든다. 부분: { name, color, role, polys, x0, x1, y0, y1, w, h, cx } */
function build(id, src) {
  const layers = src.map((l) => ({ ...l, rgb: rgb(l.color) }));
  const at = (x, yy) => layers.find((l) => l.polys.some((poly) => inPoly(poly, x, yy))) || null;
  const inside = (x, yy) => !!at(x, yy);
  const maxW = Math.max(400, ...layers.map((l) => l.w));
  // 가운데가 두껍고 좌우 끝으로 갈수록 얇다 — 돌려 볼 때 둥글게 읽힌다
  const thickness = (x, yy) => { const l = at(x, yy); const half = (l ? l.w : maxW) / 2; const t = Math.min(1, Math.abs(x - (l ? l.cx : CX)) / half); return Math.max(12, Math.min(120, half * 0.6) * Math.sqrt(1 - t * t)); };
  const byRole = (role) => layers.find((l) => l.role === role) || null;
  const mid = (l) => ({ x: l.cx ?? CX, y: (l.y0 + l.y1) / 2 + (l.form === 'dome' ? l.h * 0.18 : 0) });
  // 그 높이에서 부분 안에 들어오는 가로 구간. 외곽선 형상은 높이마다 폭이 다르다
  const span = (l, yy) => { if (l.form !== 'figure') return [l.x0, l.x1]; let best = null; let run = null; for (let x = l.x0 - 2; x <= l.x1 + 2; x += 2) { const inP = l.polys.some((poly) => inPoly(poly, x, yy)); if (inP) run = run ? [run[0], x] : [x, x]; if ((!inP || x > l.x1) && run) { if (!best || run[1] - run[0] > best[1] - best[0]) best = run; run = null; } } if (run && (!best || run[1] - run[0] > best[1] - best[0])) best = run; return best || [l.x0, l.x1]; };
  const tall = (l) => l.form === 'figure' && l.h > l.w * 1.25;
  const coreL = byRole('core') || layers[Math.floor(layers.length / 2)] || { y0: 300, y1: 380, x0: CX - 250, x1: CX + 250, cx: CX, w: 500, h: 80, form: 'slab', polys: [] };
  const CORE = (() => { const m = mid(coreL); const [a, b] = span(coreL, m.y); return { x: coreL.form === 'figure' ? (a + b) / 2 : m.x, y: m.y }; })();
  const CENTER = { x: CX, y: TOP + 310 };
  const X0 = Math.min(CX - 380, ...layers.map((l) => l.x0 - 8)); const X1 = Math.max(CX + 380, ...layers.map((l) => l.x1 + 8));

  const DOTS = []; const step = 14; const row = step * 0.866;
  for (const side of [-1, 1]) {
    const shift = side < 0 ? step / 2 : 0;
    for (let j = 0, yy = TOP - 10 + shift * 0.6; yy < TOP + 660; yy += row, j++) for (let x = X0 + shift + (j % 2 ? step / 2 : 0); x < X1; x += step) {
      const key = `${side}|${j}|${Math.round(x)}`; const px = x + (hash(`x${key}`) - 0.5) * 6; const py = yy + (hash(`y${key}`) - 0.5) * 6;
      const l = at(px, py); if (!l) continue;
      DOTS.push({ x: px, y: py, z: side * thickness(px, py) * (0.7 + hash(`z${key}`) * 0.3), front: side > 0, r: 1.0 + hash(`r${key}`) * 1.0, a: 0.75 + hash(`a${key}`) * 0.6, heat: 0, c: l.rgb });
    }
  }

  // 노드군의 이름표 — 부분의 왼쪽 · 오른쪽에 번갈아 단다
  const FAMILY = { identity: { label: 'IDENTITY', sub: '판단의 출발점' }, airplane: { label: 'AIRPLANE', sub: '사조 여행' }, tunnel: { label: 'TUNNEL', sub: '레이어' } };
  const LOBES = {}; const captions = {}; const labels = [];
  layers.forEach((l, i) => {
    const m = mid(l); const [sa, sb] = span(l, m.y); const preferLeft = l.form === 'figure' ? (l.cx < CX - 40 ? true : l.cx > CX + 40 ? false : i % 2 === 0) : i % 2 === 0;
    const left = l.form === 'figure' && l.role === 'mission' ? true : preferLeft; const yy = m.y - 8;
    // 이름표 자리에 다른 부분이 있으면 바깥으로 민다
    let x = left ? sa - 34 : sb + 34;
    if (l.form === 'figure') for (let n = 0; n < 12; n++) { const probe = left ? x - 46 : x + 46; if ([yy - 6, yy + 12, yy + 30].some((py) => at(probe, py) || at(x, py))) x += left ? -20 : 20; else break; }
    if (FAMILY[l.role] && !LOBES[l.role]) { LOBES[l.role] = { label: `${FAMILY[l.role].label} · ${l.name}`, sub: FAMILY[l.role].sub, caption: { align: left ? 'right' : 'left' }, color: l.rgb }; captions[l.role] = { x, y: yy }; }
    else labels.push({ x, y: yy + 8, text: `${l.name}${l.role !== 'none' ? ` · ${LAYER_ROLES.find((r) => r.id === l.role)?.name || ''}` : ''}`, align: left ? 'right' : 'left', color: l.rgb });
  });
  // 맡을 부분이 없는 노드군은 형상 아래에 이름만 둔다
  Object.keys(FAMILY).filter((f) => !LOBES[f]).forEach((f, i) => { LOBES[f] = { label: FAMILY[f].label, sub: FAMILY[f].sub, caption: { align: 'center' } }; captions[f] = { x: CX - 260 + i * 260, y: TOP + 668 }; });

  function seats(nodes) {
    const seat = new Map();
    // 한 부분 안에 노드를 늘어놓는다. 세로로 긴 부분은 세로로, 나머지는 그 높이의 가로 구간에
    const rowIn = (l, list, k = 0.1) => {
      if (!l || !list.length) return; const m = mid(l);
      if (tall(l)) { const pad = Math.min(30, l.h * 0.12); list.forEach((n, i) => { const t = list.length > 1 ? i / (list.length - 1) : 0.5; const yy = l.y0 + pad + (l.h - pad * 2) * t; const [a, b] = span(l, yy); seat.set(n.id, { x: (a + b) / 2 + (list.length > 5 ? (i % 2 ? 1 : -1) * Math.min(14, (b - a) * 0.2) : 0), y: yy, k }); }); return; }
      const [a, b] = span(l, m.y); const pad = l.form === 'figure' ? Math.min(55, (b - a) * 0.14) : 55; const usable = Math.max(0, b - a - pad * 2); const c = (a + b) / 2;
      const rows = l.form === 'figure' && list.length > 5 && usable / list.length < 26 ? 3 : 2; const dy = Math.min(14, l.h * 0.22);
      list.forEach((n, i) => { const t = list.length > 1 ? i / (list.length - 1) : 0.5; const off = list.length > 5 ? (rows === 3 ? ((i % 3) - 1) * dy * 1.3 : (i % 2 ? 1 : -1) * dy) : 0; seat.set(n.id, { x: c - usable / 2 + usable * t, y: m.y + off, k }); });
    };
    for (const f of ['identity', 'airplane', 'tunnel']) { const l = byRole(f); const mine = nodes.filter((n) => n.type === 'lens' && n.family === f); if (l) rowIn(l, mine, 0.09); else mine.forEach((n, i) => seat.set(n.id, { x: captions[f].x - 60 + (i % 6) * 24, y: captions[f].y - 40 - Math.floor(i / 6) * 16, k: 0.09 })); }
    const issues = nodes.filter((n) => n.type === 'issue'); const [ca, cb] = span(coreL, CORE.y); const usable = Math.max(0, Math.min(cb - ca - (coreL.form === 'figure' ? Math.min(220, (cb - ca) * 0.3) : 220), 90 * Math.max(1, issues.length)));
    issues.forEach((n, i) => { const t = issues.length > 1 ? i / (issues.length - 1) : 0.5; seat.set(n.id, { x: CORE.x - usable / 2 + usable * t, y: CORE.y, k: 0.1 }); });
    rowIn(byRole('fact') || byRole('mission'), nodes.filter((n) => n.type === 'fact'), 0.14);
    const m = byRole('mission'); const mm = m ? mid(m) : { x: CX, y: TOP + 640 }; const [ma, mb] = m ? span(m, mm.y) : [CX - 200, CX + 200]; const mc = m && m.form === 'figure' ? (ma + mb) / 2 : mm.x; const reach = m && m.form === 'figure' ? Math.min(130, (mb - ma) * 0.3) : 130;
    for (const n of nodes) { if (n.type === 'gate') seat.set(n.id, { x: mc - reach, y: mm.y, k: 0.12 }); if (n.type === 'project') seat.set(n.id, { x: mc + reach * (60 / 130), y: mm.y, k: 0.12 }); }
    return seat;
  }

  return {
    id, DOTS, LOBES, CENTER, CORE, BOX: { x0: -60, y0: -10, x1: 1080, y1: 830 },
    seats, inside, thickness, caption: (family) => captions[family],
    outlines: layers.flatMap((l) => l.polys.map((pts) => ({ pts, close: true, alpha: 0.5, color: l.rgb }))),
    labels, base: { x: CX, y: TOP + 700 }, layers,
  };
}

const cache = new Map();
/** 프로젝트가 고른 형상. settings.look = { kind: 'brain' } | { kind: 'burger' } | { kind: 'stack', layers } | { kind: 'bulb' | 'bolt' | 'phone' | 'server', parts } */
export function shapeFor(project) {
  const look = project?.settings?.look;
  if (!look || look.kind === 'brain' || !look.kind) return brainShape;
  const key = JSON.stringify(look);
  if (cache.has(key)) return cache.get(key);
  let shape = null;
  if (FIGURES[look.kind]) shape = figureShape(look.kind, look.parts);
  else { const def = look.kind === 'stack' && Array.isArray(look.layers) && look.layers.length ? look : (PRESETS[look.kind] || null); if (def) shape = stackShape(def); }
  if (!shape) return brainShape;
  if (cache.size > 12) cache.clear(); cache.set(key, shape);
  return shape;
}
