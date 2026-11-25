// 뇌의 형상 — 왼쪽을 보는 옆모습. 유니버스의 모든 자리는 이 형상에서 나온다.
//   전두엽(앞)   THE FROM 아이덴티티 — 판단
//   두정·후두엽(위·뒤)   Airplane — 사조
//   측두엽(아래)   Tunnel — 시장·브랜드·타겟·사용 습관
//   중심부   이슈 — 모든 판단이 대입되는 자리
//   뇌간   미션이 들어오고, 문(N7)을 지나 나간다
// 좌표는 1000 × 760 상자 기준. 윤곽을 고치면 점 구름과 노드 자리가 함께 따라온다.

const CEREBRUM = [
  [92, 405], [100, 320], [140, 225], [215, 145], [320, 88], [450, 58], [585, 60], [710, 92], [815, 155], [888, 245],
  [925, 350], [928, 440], [895, 505], [820, 535], [730, 528], [650, 520], [600, 545], [540, 590], [450, 615], [360, 605],
  [295, 570], [262, 515], [285, 470], [230, 482], [160, 468], [112, 440],
];
const STEM = [[584, 572], [652, 556], [692, 640], [702, 742], [642, 750], [630, 662]];
const CEREBELLUM = { x: 772, y: 596, rx: 116, ry: 72 };
// 고랑 — 점을 비워 엽의 경계를 만든다
const SULCI = [
  { gap: 9, path: [[285, 470], [380, 462], [480, 442], [570, 412], [645, 384]] },   // 외측 고랑
  { gap: 8, path: [[506, 60], [500, 150], [482, 240], [460, 330], [446, 398]] },    // 중심 고랑
  { gap: 7, path: [[792, 140], [778, 225], [772, 300]] },                          // 두정후두 고랑
];
export const CENTER = { x: 520, y: 335 };
export const CORE = { x: 505, y: 372 };
export const BOX = { x0: -60, y0: -10, x1: 1080, y1: 830 };

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/** 닫힌 Catmull-Rom 곡선 → 촘촘한 다각형 */
function smooth(pts, steps = 10) {
  const out = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    for (let s = 0; s < steps; s++) {
      const t = s / steps; const t2 = t * t; const t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  return out;
}
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPath(path, x, y) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]; const [bx, by] = path[i + 1];
    const dx = bx - ax; const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

const cerebrum = smooth(CEREBRUM);
const stem = smooth(STEM, 6);
const sulci = SULCI.map((s) => ({ gap: s.gap, path: smooth([s.path[0], ...s.path, s.path[s.path.length - 1]], 6).slice(6, -6 * 2) }));
const inCerebellum = (x, y) => ((x - CEREBELLUM.x) / CEREBELLUM.rx) ** 2 + ((y - CEREBELLUM.y) / CEREBELLUM.ry) ** 2 <= 1;

/** 윤곽선 — 홀로그램의 외곽과 고랑을 그릴 때 쓴다 */
const ellipse = Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return [CEREBELLUM.x + Math.cos(a) * CEREBELLUM.rx, CEREBELLUM.y + Math.sin(a) * CEREBELLUM.ry]; });
/** 닫힌 윤곽에서 keep(x, y)인 구간만 남긴 선분 묶음 */
function visibleRuns(pts, keep) {
  const start = pts.findIndex(([x, y]) => !keep(x, y));
  if (start < 0) return [[...pts, pts[0]]];
  const runs = []; let run = [];
  for (let i = 1; i <= pts.length; i++) {
    const [x, y] = pts[(start + i) % pts.length];
    if (keep(x, y)) run.push([x, y]); else { if (run.length > 1) runs.push(run); run = []; }
  }
  return runs;
}
export const OUTLINE = {
  cerebrum,
  // 소뇌와 뇌간은 대뇌 뒤에 가려진 부분을 그리지 않는다
  cerebellum: visibleRuns(ellipse, (x, y) => !inPoly(cerebrum, x, y)),
  stem: visibleRuns(stem, (x, y) => !inPoly(cerebrum, x, y) && !inCerebellum(x, y)),
  sulci: sulci.map((q) => q.path),
};

export const inCerebrum = (x, y) => inPoly(cerebrum, x, y);
export const inBrain = (x, y) => inCerebrum(x, y) || inCerebellum(x, y) || inPoly(stem, x, y);

/** 중심에서 각도(도) 방향으로 쏜 선이 대뇌 윤곽과 만나는 거리 */
function reach(deg) {
  const a = (deg * Math.PI) / 180; const dx = Math.cos(a); const dy = Math.sin(a);
  let far = 0;
  for (let i = 0; i < cerebrum.length; i++) {
    const [x1, y1] = cerebrum[i]; const [x2, y2] = cerebrum[(i + 1) % cerebrum.length];
    const ex = x2 - x1; const ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - CENTER.x) * ey - (y1 - CENTER.y) * ex) / den;
    const u = ((x1 - CENTER.x) * dy - (y1 - CENTER.y) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) far = Math.max(far, t);
  }
  return far;
}
/** 피질 위의 한 점 — 각도와 깊이(1 = 윤곽, 0 = 중심) */
export function onCortex(deg, depth) {
  const r = reach(deg) * depth; const a = (deg * Math.PI) / 180;
  return { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r, deg };
}

// 엽마다 노드가 앉는 각도 범위 (오른쪽 0° · 아래 90° · 왼쪽 180° · 위 -90°)
export const LOBES = {
  identity: { from: -120, to: -200, depth: [0.84, 0.84], caption: { deg: -137, depth: 1.19, align: 'right' }, label: 'IDENTITY', sub: '판단의 출발점 · 전두엽' },
  airplane: { from: -82, to: 30, depth: [0.87, 0.64], caption: { deg: -47, depth: 1.17, align: 'left' }, label: 'AIRPLANE', sub: '사조 여행 · 두정·후두엽' },
  tunnel: { from: 132, to: 80, depth: [0.86, 0.86], caption: { deg: 118, depth: 1.24, align: 'center' }, label: 'TUNNEL', sub: '레이어 · 측두엽' },
};

/** 구조 노드의 자리 */
export function seats(nodes) {
  const seat = new Map();
  for (const [family, lobe] of Object.entries(LOBES)) {
    const mine = nodes.filter((n) => n.type === 'lens' && n.family === family);
    mine.forEach((n, i) => {
      const t = mine.length > 1 ? i / (mine.length - 1) : 0.5;
      seat.set(n.id, { ...onCortex(lobe.from + (lobe.to - lobe.from) * t, lobe.depth[i % 2]), k: 0.09 });
    });
  }
  const issues = nodes.filter((n) => n.type === 'issue');
  issues.forEach((n, i) => {
    const a = ((-150 + (i * 360) / Math.max(3, issues.length)) * Math.PI) / 180;
    const r = issues.length > 6 ? 78 : 58;
    seat.set(n.id, { x: CORE.x + Math.cos(a) * r, y: CORE.y + Math.sin(a) * r * 0.8, k: 0.1 });
  });
  // 팩트 — 소뇌에 줄지어 놓는다. 기억해 둔 자료의 자리다.
  const facts = nodes.filter((n) => n.type === 'fact');
  facts.forEach((n, i) => {
    const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(facts.length * 1.6))));
    const row = Math.floor(i / cols); const col = i % cols;
    seat.set(n.id, { x: CEREBELLUM.x - 62 + col * (124 / Math.max(1, cols - 1)), y: CEREBELLUM.y - 30 + row * 20, k: 0.14 });
  });
  for (const n of nodes) {
    if (n.type === 'gate') seat.set(n.id, { x: 628, y: 612, k: 0.12 });
    if (n.type === 'project') seat.set(n.id, { x: 664, y: 716, k: 0.12 });
  }
  return seat;
}

/** 두께 — 옆에서 본 뇌에 깊이를 준다. 가운데가 두껍고 윤곽으로 갈수록 얇다. */
export const DEPTH = 150;
export function thickness(x, y) {
  if (!inCerebrum(x, y)) return 26;
  const deg = (Math.atan2(y - CENTER.y, x - CENTER.x) * 180) / Math.PI;
  const rho = Math.min(1, Math.hypot(x - CENTER.x, y - CENTER.y) / (reach(deg) || 1));
  return Math.max(14, DEPTH * Math.sqrt(1 - rho * rho));
}

/** 뉴런 점 구름 — 한 번만 만든다. 같은 형상이면 언제나 같은 점이다. 앞 반구와 뒤 반구 두 겹. */
export const DOTS = (() => {
  const dots = []; const step = 18; const row = step * 0.866;
  for (const layer of [-1, 1]) {
    const shift = layer < 0 ? step / 2 : 0;
    for (let j = 0, y = 30 + shift * 0.6; y < 770; y += row, j++) {
      for (let x = 60 + shift + (j % 2 ? step / 2 : 0); x < 960; x += step) {
        const key = `${layer}|${j}|${Math.round(x)}`;
        const px = x + (hash(`x${key}`) - 0.5) * 7; const py = y + (hash(`y${key}`) - 0.5) * 7;
        if (!inBrain(px, py)) continue;
        const cb = !inCerebrum(px, py) && inCerebellum(px, py);
        if (cb && ((py - CEREBELLUM.y + 400) % 15) < 5) continue;                                // 소뇌의 결
        if (!cb && layer > 0 && sulci.some((q) => distToPath(q.path, px, py) < q.gap)) continue;   // 고랑 (앞 반구에만)
        dots.push({ x: px, y: py, z: layer * thickness(px, py) * (0.72 + hash(`z${key}`) * 0.28), front: layer > 0, r: 0.95 + hash(`r${key}`) * 1.0, a: 0.45 + hash(`a${key}`) * 0.55, heat: 0 });
      }
    }
  }
  return dots;
})();
