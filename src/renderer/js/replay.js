// 과정 다시 보기 — 실행 기록(run)의 시각으로 그 순간의 화면 상태를 다시 만든다.
// 단계 시작·끝, 조수 호출 시작·끝, 브레인 판정, 회차, 사람의 답, 대사(lines)가 모두 시각을 갖고 있어서
// 결과 파일 하나만 있으면 어느 PC에서든 여정 · 단계 패널 · 조수 줄을 그때 그대로 훑어볼 수 있다.
import { arr } from './util.js';

const T = (x) => { const v = x ? Date.parse(x) : NaN; return Number.isFinite(v) ? v : null; };
const GAP_CAP = 2200; // 실제 간격이 길어도(게이트 대기·긴 추론) 다시 보기에서는 이 시간까지만 쓴다(ms)
const GAP_MIN = 120;

/** 실행 기록에서 사건 시각을 모아 '다시 보기 시간'으로 압축한 표를 만든다 */
export function buildTimeline(run) {
  const ts = [];
  const push = (x) => { const v = T(x); if (v) ts.push(v); };
  for (const st of Object.values(run.stages || {})) { push(st.startedAt); push(st.endedAt); }
  for (const e of arr(run.stageLog)) push(e.at);
  for (const a of arr(run.agents)) { push(a.startedAt); push(a.endedAt); }
  for (const l of arr(run.lines)) push(l.at);
  for (const b of Object.values(run.brain || {})) for (const at of arr(b && b.attempts)) push(at.at);
  const th = run.results && run.results.think;
  for (const r of arr(th && th.rounds)) { push(r.at); push(r.answer && r.answer.at); }
  for (const g of arr(run.gates && run.gates.brief && run.gates.brief.rounds)) push(g.at);
  for (const g of arr(run.gates && run.gates.C && run.gates.C.history)) push(g.at);
  if (run.root) push(run.root.at);
  for (const i of arr(run.inspirations)) push(i.at);
  const uniq = [...new Set(ts)].sort((a, b) => a - b);
  if (!uniq.length) return null;
  // 압축: 실제 시각 r[i] ↔ 다시 보기 시각 v[i]
  const r = [uniq[0]], v = [0];
  for (let i = 1; i < uniq.length; i++) {
    const g = uniq[i] - uniq[i - 1];
    r.push(uniq[i]); v.push(v[v.length - 1] + Math.max(GAP_MIN, Math.min(GAP_CAP, g)));
  }
  return { r, v, total: v[v.length - 1], start: r[0], end: r[r.length - 1] };
}

/** 다시 보기 시각(ms) → 실제 시각 */
export function realAt(tl, vt) {
  const { r, v } = tl;
  if (vt <= 0) return r[0];
  if (vt >= tl.total) return r[r.length - 1];
  let lo = 0, hi = v.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m] <= vt) lo = m; else hi = m; }
  const f = (vt - v[lo]) / Math.max(1, v[hi] - v[lo]);
  return r[lo] + f * (r[hi] - r[lo]);
}

/** 실제 시각 t의 화면 상태 — 그때까지 일어난 것만 남긴다 */
export function snapshot(run, t) {
  // 영감·수정 요청으로 다시 그리기 전의 시각이면, 그때 남겨 둔 결과(versions)를 쓴다
  const ver = arr(run.versions).filter((x) => T(x.at) != null && T(x.at) > t).sort((a, b) => T(a.at) - T(b.at))[0];
  const R = (ver && ver.results) || run.results || {};
  const done = (iso) => { const v = T(iso); return v != null && v <= t; };
  const out = { ...run, status: 'replay', pausedAt: null, error: null, results: {}, brain: {}, stages: {}, replayAt: t };
  // 단계
  let cur = 'brief';
  const LOG = arr(run.stageLog);
  if (LOG.length) {
    // 단계 기록이 있으면 그것이 기준 — 같은 단계를 여러 번 그린 것까지 순서대로
    let curAt = -1;
    for (const [id, st] of Object.entries(run.stages || {})) {
      const evs = LOG.filter((e) => e.id === id && T(e.at) <= t);
      const lastEv = evs[evs.length - 1];
      let status = 'pending', progress = 0;
      if (lastEv) {
        const la = T(lastEv.at);
        if (lastEv.ev === 'start') {
          const next = LOG.find((e) => e.id === id && T(e.at) > la && e.ev !== 'start');
          const ne = next ? T(next.at) : null;
          status = 'running'; progress = ne ? Math.min(0.95, Math.max(0.05, (t - la) / Math.max(1, ne - la))) : 0.5;
        } else if (lastEv.ev === 'end') { status = 'done'; progress = 1; }
        else if (lastEv.ev === 'wait') { status = 'waiting'; progress = 1; }
        else if (lastEv.ev === 'reset') { status = 'pending'; }
        else { status = lastEv.ev; }
        if (status !== 'pending' && la >= curAt) { curAt = la; cur = id; }
      }
      out.stages[id] = { ...st, status, progress };
    }
  }
  for (const [id, st] of Object.entries(LOG.length ? {} : run.stages || {})) {
    const s = T(st.startedAt), e = T(st.endedAt);
    let status = 'pending', progress = 0;
    if (s != null && t >= s) {
      cur = id;
      if (e != null && t >= e) { status = 'done'; progress = 1; } else if (e == null && st.status === 'waiting') { status = 'waiting'; progress = 1; } else if (e == null && st.status === 'done') { status = 'done'; progress = 1; } else { status = 'running'; progress = e ? Math.min(0.95, Math.max(0.05, (t - s) / (e - s))) : 0.5; }
    } else if (s == null && st.status === 'done') {
      // 시각이 없는 단계(이전 버전 기록) — 다음 단계가 시작됐으면 끝난 것으로 본다
      status = 'pending';
    }
    if (id === 'think' && status === 'pending' && arr(R.think && R.think.rounds).some((x) => done(x.at))) { status = 'running'; progress = 0.5; cur = id; } // 이전 기록 — 회차 시각으로 보정
    out.stages[id] = { ...st, status, progress };
  }
  out.stage = cur;
  // 조수 호출 — 시작한 것만, 끝난 것은 done
  out.agents = arr(run.agents).filter((a) => done(a.startedAt)).map((a) => {
    const fin = done(a.endedAt);
    return { ...a, live: undefined, status: fin ? (a.status === 'error' ? 'error' : 'done') : 'working' };
  });
  const ended = (pred) => out.agents.some((a) => a.status !== 'working' && pred(a));
  out.lines = arr(run.lines).filter((l) => done(l.at));
  out.usage = { ...(run.usage || {}), cost: out.agents.filter((a) => a.status !== 'working').reduce((n, a) => n + (a.cost || 0), 0), calls: out.agents.filter((a) => a.status !== 'working').length };
  const st = (id) => (out.stages[id] || {}).status;
  // 결과 — 끝난 단계는 통째로, 진행 중인 단계는 끝난 조수의 몫만
  for (const [id, val] of Object.entries(R)) {
    if (st(id) === 'done' || st(id) === 'waiting') { out.results[id] = val; continue; }
    if (st(id) !== 'running') continue;
    if (id === 'airplane' && val) out.results.airplane = { ...val, synth: null, travels: arr(val.travels).filter((x) => ended((a) => a.stage === 'airplane' && a.key === x.id)) };
    else if (id === 'tunnel' && val) out.results.tunnel = { ...val, synth: null, layers: arr(val.layers).filter((x) => ended((a) => a.stage === 'tunnel' && a.key === x.key)) };
    else if (id === 'think' && val) out.results.think = { ...val, final: null, awaiting: false, rounds: arr(val.rounds).filter((x) => done(x.at)).map((x) => ({ ...x, answer: x.answer && done(x.answer.at) ? x.answer : null })) };
    else if (id === 'brief' && val && ended((a) => a.stage === 'brief' && a.key === 'painter')) out.results.brief = val;
  }
  if (R.brief && !out.results.brief && ended((a) => a.stage === 'brief' && a.key === 'painter')) out.results.brief = R.brief;
  if (R.baseline && ended((a) => a.stage === 'brief' && a.key === 'brain' && /기본안/.test(a.task || ''))) out.results.baseline = R.baseline;
  if (R.report) delete out.results.report;
  // 근본 이슈 확정은 사람이 고른 시각부터
  out.root = run.root && done(run.root.at) ? run.root : null;
  // 브레인 — 방향은 방향 호출이 끝난 뒤, 판정은 그 시각까지
  for (const [id, b] of Object.entries(run.brain || {})) {
    if (!b) continue;
    const attempts = arr(b.attempts).filter((x) => done(x.at));
    const direct = b.direct && ended((a) => a.stage === id && a.key === 'brain' && /방향/.test(a.task || '')) ? b.direct : null;
    if (!direct && !attempts.length) continue;
    out.brain[id] = { ...b, direct, attempts, verify: attempts.length ? b.verify && { ...b.verify, verdict: attempts[attempts.length - 1].verdict } : null, fixPending: undefined };
  }
  // 게이트 · 영감 · 교열
  out.gates = { brief: { rounds: arr(run.gates && run.gates.brief && run.gates.brief.rounds).filter((x) => done(x.at)) }, C: { history: arr(run.gates && run.gates.C && run.gates.C.history).filter((x) => done(x.at)) } };
  out.inspirations = arr(run.inspirations).filter((x) => done(x.at));
  out.polish = Object.fromEntries(Object.entries(run.polish || {}).filter(([k]) => st(k) === 'done'));
  out.polishStats = Object.fromEntries(Object.entries(run.polishStats || {}).filter(([k]) => st(k) === 'done'));
  return out;
}
