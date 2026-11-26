// Brain 유니버스 — 뇌 형상의 홀로그램. 의존 라이브러리 없음.
// 점 구름(앞·뒤 반구 두 겹)이 형상을 만들고, 그 위에 기준 노드·신호·통합 인사이트가 뉴런으로 놓인다.
// 색은 셋만 쓴다: 홀로그램의 찬 흰색, 수렴의 노랑, 긴장의 빨강. (DESIGN.md)
import { brainShape } from './shapes.js';

const TAU = Math.PI * 2;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

// 색의 위계 — 흰색: 재료(기준 노드 · 판단 · 팩트) / 분홍: 계보(기본 노드에서 최종안까지의 연결) / 노랑: 결과(통합 인사이트) / 빨강: 충돌 · 미달
export const COLORS = { ground: '#08090B', holo: '#CFE3F2', yellow: '#FFD200', red: '#E85E53', pink: '#FF4FB0' };
const HOLO = '207,227,242';
const FONT = 'Pretendard, "Pretendard Variable", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';
const JUDGED = new Set(['cause', 'condition', 'reinforce', 'tension']);
const REST = { emit: 84, target: 130, use: 110, cause: 76, condition: 76, reinforce: 70, tension: 100 };
const PULL = { emit: 0.07, target: 0.009, use: 0.006, cause: 0.01, condition: 0.01, reinforce: 0.013, tension: 0.005 };
const SWAY = 0.15;          // 좌우로 흔들리는 각(라디안) — 홀로그램의 시차
const PERIOD = 15000;       // 한 번 흔들리는 시간(ms)

/** 빛 번짐 — 한 번 그려 두고 찍는다 */
function sprite(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'); const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, `rgba(${rgb},.55)`); grad.addColorStop(0.3, `rgba(${rgb},.16)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 96, 96);
  return c;
}

export function createView(canvas, { onSelect = () => {}, onHover = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let SH = brainShape;   // 지금 형상 — setShape로 바꾼다
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const glow = { holo: sprite(HOLO), yellow: sprite('255,210,0') };
  const state = {
    nodes: [], links: [], byId: new Map(), adj: new Map(), counts: {},
    cam: { x: (SH.BOX.x0 + SH.BOX.x1) / 2, y: (SH.BOX.y0 + SH.BOX.y1) / 2, k: 0.7 }, w: 0, h: 0, dpr: 1,
    alpha: 0, hover: null, selected: null, focus: null, tint: null, path: [], pulses: new Map(), captions: [],
    show: { signals: true, dormant: true }, raf: 0, fitted: false, busy: false, theta: reduce ? 0.09 : 0, sin: 0, cos: 1, frame: 0,
  };

  // ---------- 데이터 ----------
  const radius = (n) => ({ lens: n.dormant || n.muted ? 3 : 5.5, gate: 4.5, project: 6, issue: 8.5, insight: 12, signal: 2.6 + 3.4 * (n.energy || 0), fact: 3.4 }[n.type] || 4);
  const visible = (n) => n.type !== 'hub' && (n.type !== 'signal' || state.show.signals) && (!(n.type === 'lens' && n.dormant) || state.show.dormant);

  function setData({ nodes, links }) {
    const seat = SH.seats(nodes);
    const next = nodes.map((n) => { const old = state.byId.get(n.id); const node = old ? Object.assign(old, n) : { ...n, vx: 0, vy: 0 }; node.seat = seat.get(n.id) || null; node.r = radius(node); return node; });
    const fresh = next.filter((n) => n.x == null);
    state.nodes = next; state.byId = new Map(next.map((n) => [n.id, n]));
    for (const type of ['project', 'hub', 'issue', 'lens', 'gate', 'fact', 'signal', 'insight']) {
      for (const n of fresh.filter((f) => f.type === type)) {
        if (n.seat) { n.x = n.seat.x; n.y = n.seat.y; n.z = type === 'lens' ? SH.thickness(n.x, n.y) * 0.9 : 0; }
        else if (type === 'signal') {
          // 신호는 낸 노드(피질)와 대입한 이슈(중심) 사이에서 태어난다
          const from = state.byId.get(n.lens); const to = state.byId.get(n.issue) || SH.CORE;
          const t = 0.3 + hash(`${n.id}t`) * 0.34;
          n.x = from.x + (to.x - from.x) * t + (hash(`${n.id}x`) - 0.5) * 50;
          n.y = from.y + (to.y - from.y) * t + (hash(`${n.id}y`) - 0.5) * 50;
          n.z = (from.z || 0) * (1 - t) * 0.8;
        } else if (type === 'insight') {
          const used = links.filter((l) => l.kind === 'use' && l.source === n.id).map((l) => state.byId.get(l.target)).filter((u) => u && u.x != null);
          n.x = used.length ? used.reduce((s, u) => s + u.x, 0) / used.length : SH.CORE.x; n.y = used.length ? used.reduce((s, u) => s + u.y, 0) / used.length : SH.CORE.y; n.z = 24;
        } else { n.x = SH.CORE.x; n.y = SH.CORE.y; n.z = 0; }
      }
    }
    state.links = links.filter((l) => l.kind !== 'hub' && l.kind !== 'issue' && state.byId.has(l.source) && state.byId.has(l.target)).map((l) => ({ ...l, a: state.byId.get(l.source), b: state.byId.get(l.target) }));
    state.adj = new Map(next.map((n) => [n.id, new Set()]));
    for (const l of state.links) { state.adj.get(l.source).add(l.target); state.adj.get(l.target).add(l.source); }
    state.counts = {};
    for (const f of Object.keys(SH.LOBES)) state.counts[f] = { lenses: next.filter((n) => n.type === 'lens' && n.family === f && !n.dormant).length, signals: next.filter((n) => n.type === 'signal' && n.family === f && !n.muted).length };
    if (state.selected && !state.byId.has(state.selected)) state.selected = null;
    if (fresh.length) state.alpha = Math.max(state.alpha, fresh.length > 6 ? 1 : 0.5);
    if (reduce || !state.fitted) { settle(); fit(); state.fitted = true; }
    reheat(); loop();
  }

  /** 생각이 지나간 자리가 밝아진다 — 신호 가까운 점일수록 */
  function reheat() {
    const src = state.nodes.filter((n) => n.type === 'signal' && !n.muted && visible(n) && (!state.focus || state.focus.has(n.id)));
    for (const d of SH.DOTS) {
      if (!d.front) continue;
      let hsum = 0;
      for (const s of src) { const dx = d.x - s.x; const dy = d.y - s.y; const q = dx * dx + dy * dy; if (q < 12000) hsum += (0.35 + (s.energy || 0)) * Math.exp(-q / 3800); }
      d.heat = Math.min(1, hsum * 0.7);
    }
  }

  // ---------- 힘 ----------
  function tick() {
    const ns = state.nodes.filter(visible); const a = state.alpha;
    for (let i = 0; i < ns.length; i++) {
      const p = ns[i];
      for (let k = i + 1; k < ns.length; k++) {
        const q = ns[k];
        let dx = p.x - q.x; let dy = p.y - q.y; let d2 = dx * dx + dy * dy;
        const both = p.type === 'insight' && q.type === 'insight';   // 인사이트끼리는 멀리 떨어뜨린다 — 이름이 겹치지 않게
        if (d2 > (both ? 90000 : 30000)) continue;
        if (d2 < 1) { dx = hash(p.id + q.id) - 0.5; dy = hash(q.id + p.id) - 0.5; d2 = 1; }
        const d = Math.sqrt(d2); const f = ((both ? 5200 : 230) * (p.r + q.r + 6)) / d2 * a;
        p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f;
      }
    }
    for (const l of state.links) {
      if (!PULL[l.kind] || !visible(l.a) || !visible(l.b)) continue;
      const dx = l.b.x - l.a.x; const dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - REST[l.kind]) * PULL[l.kind] * (JUDGED.has(l.kind) ? 0.5 + (l.weight || 0.5) : 1) * a;
      l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f; l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
    }
    for (const n of ns) {
      if (n.seat) { n.vx += (n.seat.x - n.x) * n.seat.k * a; n.vy += (n.seat.y - n.y) * n.seat.k * a; }
      else {
        const pull = SH.inside(n.x, n.y) ? 0.0012 : 0.05; // 형상 밖으로 나가면 중심으로 되돌린다
        n.vx += (SH.CORE.x - n.x) * pull * a; n.vy += (SH.CORE.y - n.y) * pull * a;
      }
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.8; n.vy *= 0.8;
      n.x += Math.max(-14, Math.min(14, n.vx)); n.y += Math.max(-14, Math.min(14, n.vy));
    }
    state.alpha *= 0.985;
    if (state.alpha < 0.02) { state.alpha = 0; reheat(); }
  }
  function settle(steps = 360) { state.alpha = 1; for (let i = 0; i < steps && state.alpha; i++) tick(); state.alpha = 0; }

  function loop() {
    if (state.raf) return;
    const step = (now) => {
      state.raf = 0;
      if (document.hidden) return;
      if (state.alpha) { tick(); if (state.frame % 12 === 0) reheat(); }
      for (const [id, t] of state.pulses) if (now - t > 1500) state.pulses.delete(id);
      const moving = state.alpha || state.pulses.size || state.busy;
      state.frame++;
      // 가만히 있을 때는 흔들림만 그린다 — 두 프레임에 한 번
      if (moving || state.frame % 2 === 0) { if (!reduce) state.theta = Math.sin((now / PERIOD) * TAU) * SWAY; draw(now); }
      if (!reduce || moving) state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  // ---------- 카메라 · 투영 ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    state.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const jump = !state.w || Math.abs(r.width - state.w) / state.w > 0.15 || Math.abs(r.height - state.h) / (state.h || 1) > 0.15;
    state.w = r.width; state.h = r.height;
    canvas.width = Math.round(r.width * state.dpr); canvas.height = Math.round(r.height * state.dpr);
    if (jump && state.fitted) fit(); else draw(performance.now());
  }
  function fit() {
    if (!state.w) return;
    state.cam.k = Math.max(0.2, Math.min(1.6, Math.min(state.w / (SH.BOX.x1 - SH.BOX.x0), (state.h - 150) / (SH.BOX.y1 - SH.BOX.y0))));
    state.cam.x = (SH.BOX.x0 + SH.BOX.x1) / 2; state.cam.y = (SH.BOX.y0 + SH.BOX.y1) / 2 - 18 / state.cam.k;
    draw(performance.now());
  }
  /** 세계 좌표(x, y, z) → 화면. 세로축을 중심으로 조금 돌린다. */
  function project(x, y, z = 0) {
    const xc = x - SH.CENTER.x;
    const X = xc * state.cos + z * state.sin;
    const p = 1 + (z * state.cos - xc * state.sin) * 0.00025;
    return [(SH.CENTER.x + X * p - state.cam.x) * state.cam.k + state.w / 2, (SH.CENTER.y + (y - SH.CENTER.y) * p - state.cam.y) * state.cam.k + state.h / 2];
  }
  const at = (n) => project(n.x, n.y, n.z || 0);
  function toWorld(sx, sy, z = 0) {
    const wx = (sx - state.w / 2) / state.cam.k + state.cam.x; const wy = (sy - state.h / 2) / state.cam.k + state.cam.y;
    return [SH.CENTER.x + (wx - SH.CENTER.x - z * state.sin) / (state.cos || 1), wy];
  }

  // ---------- 그리기 ----------
  function lit() {
    if (state.focus) return state.focus;
    const id = state.hover || state.selected;
    return id ? new Set([id, ...(state.adj.get(id) || [])]) : null;
  }

  function draw(now = 0) {
    if (!state.w) return;
    state.sin = Math.sin(state.theta); state.cos = Math.cos(state.theta);
    const { k } = state.cam;
    // 계보에 든 노드는 흐리게 하지 않는다 — 기본 노드에서 최종안까지 한눈에 보여야 한다
    const lineNow = lineageOf(state.selected);
    const base = lit();
    const on = lineNow ? new Set([...(base || []), ...lineNow.lenses.map((x) => x.id), ...lineNow.signals.map((x) => x.id), ...lineNow.uses.map(([, ins]) => ins.id), ...(state.selected ? [state.selected] : [])]) : base;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.fillStyle = COLORS.ground; ctx.fillRect(0, 0, state.w, state.h);
    instruments(now, k);
    contour(on ? 0.6 : 1);

    // 점 구름 — 밝기 단계별로 묶어 그린다
    const scan = state.busy && !reduce ? SH.BOX.x0 + (((now / 2600) % 1) * (SH.BOX.x1 - SH.BOX.x0)) : null;
    const quiet = on ? 0.55 : 1;
    const buckets = {};
    for (const d of SH.DOTS) {
      let a = (d.front ? 0.34 : 0.13) * d.a * quiet + (d.front ? d.heat * 0.55 : 0);
      if (scan != null) { const q = Math.abs(d.x - scan); if (q < 46) a += (1 - q / 46) * 0.5; }
      const b = Math.min(7, Math.floor(a * 8)); const key = `${d.c || HOLO}|${b}`;
      (buckets[key] ||= Object.assign([], { c: d.c || HOLO, i: b })).push(d);
    }
    Object.values(buckets).forEach((list) => {
      if (!list.length) return; const i = list.i;
      ctx.fillStyle = `rgba(${list.c},${(i + 0.6) / 8})`;
      ctx.beginPath();
      for (const d of list) { const [x, y] = project(d.x, d.y, d.z); const r = Math.max(0.6, (d.r + d.heat * 0.9) * k); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fill();
    });

    // 연결 — 중심 쪽으로 휘는 섬유
    for (const l of state.links) {
      if (!visible(l.a) || !visible(l.b)) continue;
      const active = !on || (on.has(l.source) && on.has(l.target));
      const judged = JUDGED.has(l.kind);
      const structural = l.kind === 'emit' || l.kind === 'target' || l.kind === 'evidence';
      const near = l.source === (state.hover || state.selected) || l.target === (state.hover || state.selected);
      if (structural && !(near || (state.focus && active))) continue;
      const w = l.weight || 0.5;
      ctx.setLineDash([]); ctx.lineWidth = 1;
      let alpha;
      if (l.kind === 'tension') { ctx.strokeStyle = COLORS.red; ctx.setLineDash([4, 4]); ctx.lineWidth = 0.9 + w * 0.7; alpha = 0.75; }
      else if (l.kind === 'use') { ctx.strokeStyle = COLORS.pink; alpha = on && active ? 0.5 : 0.12; ctx.lineWidth = 0.8; }
      else if (l.kind === 'hint') { ctx.strokeStyle = COLORS.holo; ctx.setLineDash([1, 5]); alpha = 0.6; }
      else if (judged) { ctx.strokeStyle = COLORS.holo; ctx.lineWidth = 0.5 + w * 0.9; alpha = 0.16 + w * 0.34; if (l.kind === 'condition') ctx.setLineDash([2, 3]); }
      else { ctx.strokeStyle = COLORS.holo; alpha = 0.22; ctx.lineWidth = 0.6; }
      ctx.globalAlpha = alpha * (active ? 1 : 0.1);
      const [x1, y1] = at(l.a); const [x2, y2] = at(l.b);
      const [cx, cy] = project((l.a.x + l.b.x) / 2 + (SH.CORE.x - (l.a.x + l.b.x) / 2) * 0.2, (l.a.y + l.b.y) / 2 + (SH.CORE.y - (l.a.y + l.b.y) / 2) * 0.2, ((l.a.z || 0) + (l.b.z || 0)) / 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
      if ((l.kind === 'cause' || l.kind === 'condition') && on && active) arrow(cx, cy, x2, y2, l.b.r * k + 3);
    }
    ctx.setLineDash([]);

    // 계보 — 고른 것이 어느 기본 노드에서 나와 어느 최종안까지 갔는지를 분홍 선으로 잇는다
    //   기본 노드군(IDENTITY · AIRPLANE · TUNNEL) → 기준 노드 → 판단 → 통합 인사이트
    const line = lineNow;
    if (line) {
      ctx.setLineDash([]); ctx.strokeStyle = COLORS.pink; ctx.lineJoin = 'round';
      const seg = (x1, y1, x2, y2, w, a) => { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      for (const lens of line.lenses) { const cap = state.captions.find((q) => q.id === `HUB-${lens.family.toUpperCase()}`); if (cap) { const [x, y] = at(lens); seg((cap.x0 + cap.x1) / 2, (cap.y0 + cap.y1) / 2, x, y, 1.4, 0.9); } }
      for (const sg of line.signals) { const from = state.byId.get(sg.lens); if (from && line.lenses.includes(from)) { const [x1, y1] = at(from); const [x2, y2] = at(sg); seg(x1, y1, x2, y2, 1.2, 0.8); } }
      for (const [sg, ins] of line.uses) { const [x1, y1] = at(sg); const [x2, y2] = at(ins); seg(x1, y1, x2, y2, 1.6, 0.95); }
      ctx.fillStyle = COLORS.pink; ctx.globalAlpha = 1;
      for (const n of [...line.lenses, ...line.signals]) { const [x, y] = at(n); disc(x, y, 2.2); }
    }

    // 사고의 경로 — 선택한 인사이트의 인과 사슬을 순서대로 잇는다
    const pathNodes = state.path.map((id) => state.byId.get(id)).filter(Boolean);
    if (pathNodes.length > 1) {
      ctx.globalAlpha = 0.95; ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath(); pathNodes.forEach((n, i) => { const [x, y] = at(n); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    }

    // 뉴런
    const order = { lens: 0, gate: 0, project: 0, signal: 1, issue: 2, insight: 3 };
    const shown = state.nodes.filter(visible).sort((a, b) => order[a.type] - order[b.type]);
    ctx.globalCompositeOperation = 'lighter';
    for (const n of shown) {
      const active = !on || on.has(n.id);
      if (!active || n.muted || (n.type === 'lens' && n.dormant)) continue;
      const [x, y] = at(n); const g = n.type === 'insight' ? glow.yellow : glow.holo;
      const s = (n.type === 'insight' ? 5.2 : n.type === 'signal' ? 3 + (n.energy || 0) * 3 : 3.6) * n.r * k;
      ctx.globalAlpha = n.type === 'insight' ? 0.9 : n.type === 'signal' ? 0.5 + (n.energy || 0) * 0.5 : 0.55;
      ctx.drawImage(g, x - s, y - s, s * 2, s * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const n of shown) {
      const [x, y] = at(n); const r = Math.max(1.4, n.r * k);
      const active = !on || on.has(n.id); const dim = n.muted || (n.type === 'lens' && n.dormant);
      ctx.globalAlpha = (active ? 1 : 0.16) * (dim ? 0.42 : 1);
      ctx.lineWidth = 1.2;
      if (n.type === 'insight') { ctx.fillStyle = COLORS.yellow; disc(x, y, r); if (n.flagged) { ctx.strokeStyle = COLORS.red; ring(x, y, r + 4); } }
      else if (n.type === 'issue') { ctx.fillStyle = COLORS.ground; disc(x, y, r); ctx.strokeStyle = COLORS.holo; ctx.lineWidth = n.root ? 2 : 1.2; ring(x, y, r); ctx.fillStyle = COLORS.holo; disc(x, y, n.root ? r * 0.42 : r * 0.22); }
      else if (n.type === 'lens') { if (dim) { ctx.strokeStyle = COLORS.holo; ring(x, y, r); } else { ctx.fillStyle = COLORS.holo; disc(x, y, r * 0.62); ctx.strokeStyle = COLORS.holo; ctx.globalAlpha *= 0.6; ring(x, y, r + 2.5); } }
      else if (n.type === 'gate') { ctx.strokeStyle = COLORS.holo; ring(x, y, r); ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke(); }
      else if (n.type === 'project') { ctx.strokeStyle = COLORS.holo; ring(x, y, r); ring(x, y, r + 4); }
      else if (n.type === 'fact') { ctx.fillStyle = COLORS.holo; ctx.fillRect(x - r * 0.75, y - 0.9, r * 1.5, 1.8); ctx.strokeStyle = n.unchecked ? COLORS.red : COLORS.holo; ring(x, y, r); }
      else { ctx.fillStyle = COLORS.holo; disc(x, y, r); }

      const pulse = state.pulses.get(n.id);
      if (pulse != null && !reduce) { const t = (now - pulse) / 1500; if (t >= 0 && t < 1) { ctx.globalAlpha = (1 - t) * 0.9; ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 1.4; ring(x, y, r + 3 + t * 30); } }
      const tc = state.tint && state.tint.get(n.id);   // 전략 한 장이 기댄 노드 — 색 고리를 두른다
      if (tc) { ctx.globalAlpha = 0.95; ctx.strokeStyle = tc; ctx.lineWidth = 1.5; ring(x, y, r + 3.2); }
      if (n.id === state.selected) { ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 1.6; ring(x, y, r + 5); }
    }

    // 글자
    for (const n of shown) {
      const active = !on || on.has(n.id);
      const step = state.path.indexOf(n.id);
      const [x, y] = at(n); const r = Math.max(1.4, n.r * k);
      if (step >= 0) { ctx.globalAlpha = 1; ctx.fillStyle = COLORS.pink; disc(x + r + 9, y - r - 7, 8); text(String(step + 1), x + r + 9, y - r - 6.5, `700 10.5px ${MONO}`, COLORS.ground, 'center'); }
      if (!active) continue;
      const hot = n.id === state.hover || n.id === state.selected;
      const dim = n.muted || (n.type === 'lens' && n.dormant);
      if (n.type === 'lens') {
        if (dim && !(hot || k > 1.5)) continue;
        // 이름은 뇌의 바깥쪽으로 놓는다
        const a = Math.atan2(n.y - SH.CENTER.y, n.x - SH.CENTER.x); const cos = Math.cos(a); const off = r + 9;
        ctx.globalAlpha = dim ? 0.5 : hot || on ? 1 : 0.82;
        text(clip(n.name, 20), x + cos * off, y + Math.sin(a) * off, `500 11.5px ${FONT}`, COLORS.holo, Math.abs(cos) < 0.35 ? 'center' : cos < 0 ? 'right' : 'left');
      } else if (n.type === 'signal') {
        if (!(hot || step >= 0 || k > 1.7)) continue;
        ctx.globalAlpha = 0.95; text(n.id, x + r + (step >= 0 ? 22 : 7), y, `500 10.5px ${MONO}`, COLORS.holo, 'left');
      } else if (n.type === 'issue') { ctx.globalAlpha = 1; text(n.id, x, y - r - 9, `700 10.5px ${MONO}`, COLORS.holo, 'center'); }
      else if (n.type === 'insight') {
        const lx = x + r + (step >= 0 ? 24 : 9); const label = clip(n.name, 22);
        ctx.font = `400 12.5px ${FONT}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        ctx.globalAlpha = 0.78; ctx.fillStyle = COLORS.ground; ctx.fillRect(lx - 4, y - 10, ctx.measureText(label).width + 8, 20);
        ctx.globalAlpha = 1; text(label, lx, y, `700 12.5px ${FONT}`, COLORS.yellow, 'left');
      }
      else if (n.type === 'project') { ctx.globalAlpha = 0.9; text('MISSION', x + r + 12, y - 7, `400 10px ${MONO}`, COLORS.holo, 'left', 1.5); ctx.globalAlpha = 0.6; text(clip(n.name, 22), x + r + 12, y + 8, `500 11px ${FONT}`, COLORS.holo, 'left'); }
      else if (n.type === 'gate') { ctx.globalAlpha = 0.75; text('N7 · 문', x + r + 9, y, `500 10px ${MONO}`, COLORS.holo, 'left'); }
    }

    // 엽의 이름 — 노드군의 허브를 대신한다
    state.captions = [];
    for (const [family, lobe] of Object.entries(SH.LOBES)) {
      const c = SH.caption(family); const [x, y] = project(c.x, c.y, 0);
      const cnt = state.counts[family] || { lenses: 0, signals: 0 }; const id = `HUB-${family.toUpperCase()}`;
      const lit2 = !on || state.selected === id; const al = lobe.caption.align;
      ctx.globalAlpha = lit2 ? 0.95 : 0.35;
      const w1 = text(lobe.label, x, y, `400 11px ${MONO}`, state.selected === id ? COLORS.pink : lobe.color ? `rgb(${lobe.color})` : COLORS.holo, al, 2.4);
      ctx.globalAlpha = lit2 ? 0.55 : 0.2;
      text(lobe.sub, x, y + 16, `500 10.5px ${FONT}`, COLORS.holo, al);
      text(`${String(cnt.lenses).padStart(2, '0')} NODES  ${String(cnt.signals).padStart(2, '0')} SIGNALS`, x, y + 31, `500 9.5px ${MONO}`, COLORS.holo, al, 0.8);
      const wide = Math.max(w1, 150); const x0 = al === 'right' ? x - wide : al === 'center' ? x - wide / 2 : x;
      state.captions.push({ id, x0, y0: y - 10, x1: x0 + wide, y1: y + 40 });
    }
    ctx.globalAlpha = 1;
  }

  /** 계기 — 뇌를 감싸는 얇은 호와 눈금. 생각하는 동안 돈다. */
  function instruments(now, k) {
    const [cx, cy] = project(SH.CENTER.x, SH.CENTER.y + 55, 0);
    const spin = reduce ? 0 : (now / (state.busy ? 9000 : 60000)) * TAU;
    ctx.strokeStyle = COLORS.holo; ctx.lineWidth = 1;
    for (const [r, a0, span, alpha] of [[505, -0.5, 1, 0.16], [505, Math.PI - 0.5, 1, 0.16], [530, 0.2 + spin, 0.5, 0.1], [530, Math.PI + 0.2 + spin, 0.5, 0.1]]) {
      ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(cx, cy, r * k, a0, a0 + span); ctx.stroke();
    }
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU; const c = Math.cos(a);
      if (Math.abs(c) < 0.84) continue;                        // 좌우에만 눈금을 둔다
      const r0 = 512 * k; const r1 = (i % 6 === 0 ? 524 : 517) * k;
      ctx.moveTo(cx + c * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + c * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  /** 외곽선과 고랑 — 점 구름이 뇌로 읽히게 하는 가는 선 */
  function contour(q) {
    const trace2 = (pts, close) => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = project(x, y, 0); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); if (close) ctx.closePath(); ctx.stroke(); };
    ctx.strokeStyle = COLORS.holo; ctx.lineWidth = 1; ctx.setLineDash([]);
    for (const o of SH.outlines) { ctx.strokeStyle = o.color ? `rgb(${o.color})` : COLORS.holo; ctx.globalAlpha = o.alpha * q; trace2(o.pts, o.close); }
    ctx.strokeStyle = COLORS.holo;
    // 노드군이 아닌 층의 이름
    for (const l of SH.labels) { const [lx, ly] = project(l.x, l.y, 0); ctx.globalAlpha = 0.6 * q; text(l.text, lx, ly, `600 10.5px ${FONT}`, l.color ? `rgb(${l.color})` : COLORS.holo, l.align); }
    // 받침 — 홀로그램이 떠 있는 자리
    const [bx, by] = project(SH.base.x, SH.base.y, 0); const k2 = state.cam.k;
    for (const [rx, ry, al] of [[250, 15, 0.3], [330, 20, 0.16], [410, 25, 0.08]]) { ctx.globalAlpha = al * q; ctx.beginPath(); ctx.ellipse(bx, by, rx * k2, ry * k2, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function ring(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  function arrow(x1, y1, x2, y2, back) {
    const a = Math.atan2(y2 - y1, x2 - x1); const tx = x2 - Math.cos(a) * back; const ty = y2 - Math.sin(a) * back;
    ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - Math.cos(a - 0.4) * 6.5, ty - Math.sin(a - 0.4) * 6.5); ctx.lineTo(tx - Math.cos(a + 0.4) * 6.5, ty - Math.sin(a + 0.4) * 6.5); ctx.closePath(); ctx.fill();
  }
  function text(str, x, y, font, color, align = 'left', spacing = 0) {
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = align; ctx.fillStyle = color;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(str, x, y + 0.5);
    return ctx.measureText(str).width;
  }

  // ---------- 입력 ----------
  /** 계보 — 고른 것에서 위(기본 노드)와 아래(최종안)로 이어지는 노드들 */
  function lineageOf(id) {
    if (!id) return null;
    const nodes = state.nodes; const n = state.byId.get(id);
    const hub = /^HUB-/.test(id) ? id.slice(4).toLowerCase() : null;
    let lenses = []; let signals = null;
    if (hub) lenses = nodes.filter((x) => x.type === 'lens' && x.family === hub && !x.dormant);
    else if (!n) return null;
    else if (n.type === 'lens') lenses = [n];
    else if (n.type === 'signal') { signals = [n]; lenses = [state.byId.get(n.lens)].filter(Boolean); }
    else if (n.type === 'insight') { signals = state.links.filter((l) => l.kind === 'use' && l.source === n.id).map((l) => l.b); lenses = [...new Set(signals.map((x) => state.byId.get(x.lens)).filter(Boolean))]; }
    else return null;
    if (!signals) { const ids = new Set(lenses.map((l) => l.id)); signals = nodes.filter((x) => x.type === 'signal' && ids.has(x.lens) && !x.muted); }
    const sid = new Set(signals.map((x) => x.id));
    const uses = state.links.filter((l) => l.kind === 'use' && sid.has(l.target) && (!n || n.type !== 'insight' || l.source === n.id)).map((l) => [l.b, l.a]);
    return { lenses, signals, uses };
  }

  function pick(sx, sy) {
    let best = null; let bd = Infinity;
    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const [x, y] = at(n); const d = Math.hypot(x - sx, y - sy);
      if (d <= n.r * state.cam.k + 7 && d < bd) { best = n; bd = d; }
    }
    if (best) return best;
    const c = state.captions.find((q) => sx >= q.x0 && sx <= q.x1 && sy >= q.y0 && sy <= q.y1);
    return c ? state.byId.get(c.id) || null : null;
  }
  const pointers = new Map(); let drag = null; let pinch = 0;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e); pointers.set(e.pointerId, [x, y]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; return; }
    const n = pick(x, y);
    drag = { node: n && n.type !== 'hub' ? n : null, hit: n, x, y, moved: false };
    if (drag.node) drag.node.fixed = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [x, y]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; return; }
    if (drag) {
      const dx = x - drag.x; const dy = y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.node && drag.moved) { [drag.node.x, drag.node.y] = toWorld(x, y, drag.node.z || 0); state.alpha = Math.max(state.alpha, 0.25); }
      else if (drag.moved) { state.cam.x -= dx / state.cam.k; state.cam.y -= dy / state.cam.k; drag.x = x; drag.y = y; }
      loop(); return;
    }
    const n = pick(x, y); const id = n ? n.id : null;
    if (id !== state.hover) { state.hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; onHover(n); loop(); }
  });
  const release = (e) => {
    pointers.delete(e.pointerId); pinch = 0;
    if (!drag) return;
    if (drag.node) drag.node.fixed = false;
    if (!drag.moved) select(drag.hit ? drag.hit.id : null, true);
    drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (state.hover) { state.hover = null; onHover(null); } });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 60 / state.cam.k;
    if (e.key === 'ArrowLeft') state.cam.x -= step; else if (e.key === 'ArrowRight') state.cam.x += step;
    else if (e.key === 'ArrowUp') state.cam.y -= step; else if (e.key === 'ArrowDown') state.cam.y += step;
    else if (e.key === '+' || e.key === '=') zoomAt(state.w / 2, state.h / 2, 1.2); else if (e.key === '-') zoomAt(state.w / 2, state.h / 2, 1 / 1.2);
    else if (e.key === '0') fit(); else return;
    e.preventDefault(); draw(performance.now());
  });
  function zoomAt(sx, sy, f) {
    const before = [(sx - state.w / 2) / state.cam.k + state.cam.x, (sy - state.h / 2) / state.cam.k + state.cam.y];
    state.cam.k = Math.max(0.2, Math.min(4, state.cam.k * f));
    state.cam.x = before[0] - (sx - state.w / 2) / state.cam.k; state.cam.y = before[1] - (sy - state.h / 2) / state.cam.k;
    draw(performance.now());
  }
  function select(id, user = false) { state.selected = id; draw(performance.now()); if (user) onSelect(id ? state.byId.get(id) : null); }

  const ro = new ResizeObserver(resize); ro.observe(canvas);
  resize(); loop();

  return {
    setData, select, fit, resize,
    /** 형상을 바꾼다 — 노드의 자리를 새 형상에 맞춰 다시 잡는다 */
    setShape(shape) { if (!shape || shape === SH) return; SH = shape; for (const n of state.nodes) { n.x = null; n.y = null; n.vx = 0; n.vy = 0; } state.byId = new Map(); state.nodes = []; state.fitted = false; },
    zoom: (f) => zoomAt(state.w / 2, state.h / 2, f),
    /** 인사이트의 근거만 밝히고 인과 사슬을 순서대로 잇는다. null이면 해제 */
    trace(ids, path = []) { state.focus = ids ? new Set(ids) : null; state.path = path; reheat(); draw(performance.now()); },
    /** 노드에 색 고리를 두른다 — Map(노드 id → 색). null이면 해제 */
    tint(map) { state.tint = map && map.size ? map : null; draw(performance.now()); },
    pulse(id) { if (state.byId.has(id)) { state.pulses.set(id, performance.now()); loop(); } },
    busy(on) { state.busy = on; loop(); },
    show(key, on) { state.show[key] = on; state.alpha = Math.max(state.alpha, 0.3); reheat(); loop(); },
    center(id) { const n = state.byId.get(id); if (n && n.type !== 'hub') { state.cam.x = n.x; state.cam.y = n.y; state.cam.k = Math.max(state.cam.k, 1.1); draw(performance.now()); } },
    destroy() { ro.disconnect(); cancelAnimationFrame(state.raf); },
  };
}
