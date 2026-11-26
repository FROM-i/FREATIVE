// 딥리서치 에이전트 — Claude 콘솔에서 만든 에이전트(Managed Agents)를 ID로 불러 팩트북 조사를 맡긴다.
// 조사는 Anthropic 쪽 세션에서 돌고, 이 함수는 세션을 열고(start) 진행 상황을 읽어 올(poll) 뿐이다 — 함수 실행 시간 한도(300초)에 걸리지 않는다.
//   ANTHROPIC_API_KEY  필수 (콘솔의 같은 키)
//   BRAIN_AGENT_ENV    선택 — 환경 ID. 기본은 아래 DEFAULT_ENV
//   BRAIN_AGENT_IDS    선택 — 쉼표로 적은 에이전트 ID. 기본은 아래 DEFAULT_AGENTS. 여기 적힌 에이전트만 부를 수 있다
// 지키는 것: 로그인하고 승인된 사용자만(_guard.js). 에이전트에는 조사 지시문만 보낸다 — 자료 원문을 보내지 않는다.
import { guard, bearer } from './_guard.js';

const API = 'https://api.anthropic.com/v1';
const VERSION = '2026-10-21';   // api/claude.js와 같은 값
const BETA = 'managed-agents-2026-04-01';
export const DEFAULT_ENV = 'env_01NkSgMqnM4YxFRxLwcGFVBs';
export const DEFAULT_AGENTS = ['agent_01T11he87F6rHEYZrX5aLeyT', 'agent_01KRCvFheyW247ex5eYJGD58'];

const conf = () => ({
  env: (process.env.BRAIN_AGENT_ENV || DEFAULT_ENV).trim(),
  agents: (process.env.BRAIN_AGENT_IDS || DEFAULT_AGENTS.join(',')).split(',').map((x) => x.trim()).filter(Boolean),
});
const ID = /^[A-Za-z0-9_-]{6,128}$/;

/** 세션의 이벤트를 읽어 지금 상태로 줄인다 — 에이전트가 쓴 글, 도구 사용 횟수, 끝났는지 */
export function digest(events) {
  let text = ''; let tools = 0; let status = 'running'; let error = ''; let stop = '';
  for (const e of events) {
    const t = e?.type || '';
    if (t === 'user.message') { text = ''; status = 'running'; error = ''; stop = ''; }   // 마지막 지시 뒤의 것만 본다
    else if (t === 'agent.message') { const part = (Array.isArray(e.content) ? e.content : []).filter((b) => b?.type === 'text').map((b) => b.text).join(''); if (part) text += (text ? '\n\n' : '') + part; }
    else if (t === 'agent.tool_use' || t === 'agent.mcp_tool_use' || t === 'agent.custom_tool_use') tools++;
    else if (t === 'session.status_running' || t === 'session.status_rescheduled') status = 'running';
    else if (t === 'session.status_idle') { status = 'idle'; stop = e.stop_reason?.type || ''; }
    else if (t === 'session.status_terminated' || t === 'session.deleted') status = 'ended';
    else if (t === 'session.error') { error = e.error?.message || '세션 오류'; if (e.error?.retry_status === 'terminal' || e.error?.retry_status === 'exhausted') status = 'error'; }
  }
  if (status === 'idle' && stop && stop !== 'end_turn') { status = 'error'; error = error || { requires_action: '에이전트가 승인을 기다린다 — 콘솔에서 도구 권한을 "항상 허용"으로 둔다', retries_exhausted: '재시도를 다 썼다', refusal: '에이전트가 거절했다', budget_reached: '세션 예산 한도에 닿았다' }[stop] || `멈춤: ${stop}`; }
  return { status, text, tools, error, stop, events: events.length };
}

export async function forward({ method, code, token, payload, fetchImpl = (...a) => fetch(...a) }) {
  const out = (status, body) => ({ status, body: JSON.stringify(body) });
  const fail = (status, message) => out(status, { error: { message } });
  if (method !== 'POST') return fail(405, 'POST만 받는다');
  const g = await guard({ code, token, fetchImpl });
  if (!g.ok) return fail(g.status, g.message);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(503, '서버에 ANTHROPIC_API_KEY가 없다');
  const c = conf(); const action = payload?.action;
  const call = async (path, init = {}) => {
    const r = await fetchImpl(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'anthropic-version': VERSION, 'anthropic-beta': BETA, 'Content-Type': 'application/json' } });
    const raw = await r.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 글로 온 오류 */ }
    return { ok: r.ok, status: r.status, json, message: json?.error?.message || raw.slice(0, 300) };
  };

  if (action === 'agents') {   // 쓸 수 있는 에이전트와 이름 — 이름은 콘솔에서 지은 것을 읽어 온다
    const list = await Promise.all(c.agents.map(async (id) => { const r = await call(`/agents/${id}`); return r.ok ? { id, name: r.json?.name || id, description: r.json?.description || '', model: typeof r.json?.model === 'string' ? r.json.model : r.json?.model?.id || '' } : { id, name: id, error: `${r.status}: ${r.message}` }; }));
    return out(200, { env: c.env, agents: list });
  }
  if (action === 'start') {
    const agent = String(payload.agent || ''); const prompt = String(payload.prompt || '').trim();
    if (!c.agents.includes(agent)) return fail(400, '허용하지 않는 에이전트');
    if (!prompt) return fail(400, '조사 지시문이 비어 있다');
    if (prompt.length > 40000) return fail(400, '조사 지시문이 너무 길다');
    const r = await call('/sessions', { method: 'POST', body: JSON.stringify({ agent, environment_id: c.env, title: String(payload.title || 'THE FROM BRAIN 조사').slice(0, 120), initial_events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }] }) });
    if (!r.ok) return fail(r.status, `세션을 열지 못했다 — ${r.message}`);
    return out(200, { session: r.json.id, agent });
  }
  if (action === 'poll' || action === 'stop') {
    const session = String(payload.session || '');
    if (!ID.test(session)) return fail(400, '세션 ID가 맞지 않는다');
    if (action === 'stop') { const r = await call(`/sessions/${session}/events`, { method: 'POST', body: JSON.stringify({ events: [{ type: 'user.interrupt' }] }) }); return r.ok ? out(200, { ok: true }) : fail(r.status, r.message); }
    // 이벤트를 처음부터 끝까지 읽는다. 쪽 넘김 이름이 문서마다 달라 둘 다 받는다
    const events = []; let page = ''; let query = '?limit=100&order=asc';
    for (let n = 0; n < 40; n++) {
      let r = await call(`/sessions/${session}/events${query}${page ? `&page=${encodeURIComponent(page)}` : ''}`);
      if (!r.ok && r.status === 400 && query !== '?limit=100') { query = '?limit=100'; r = await call(`/sessions/${session}/events${query}`); }
      if (!r.ok) return fail(r.status, `진행 상황을 읽지 못했다 — ${r.message}`);
      events.push(...(Array.isArray(r.json?.data) ? r.json.data : []));
      page = r.json?.next_page || ''; if (!page) break;
    }
    // 시간 순으로 맞춘다 — 최신부터 주는 경우를 대비한다
    events.sort((a, b) => String(a.processed_at || '').localeCompare(String(b.processed_at || '')));
    return out(200, digest(events));
  }
  return fail(400, '모르는 요청');
}

export default async function handler(req, res) {
  const r = await forward({ method: req.method, code: req.headers['x-brain-code'], token: bearer(req.headers), payload: typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body });
  res.status(r.status).setHeader('Content-Type', 'application/json').send(r.body);
}
