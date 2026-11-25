// Claude API 서버 키 프록시 — 회사 키를 직원 PC에 나눠 주지 않고 쓴다.
// Vercel에 v2/ 를 올리면 이 파일이 /api/claude 함수가 된다. 로컬에서는 server.js 가 같은 forward()를 쓴다.
//   ANTHROPIC_API_KEY  필수
//   수파베이스가 연결돼 있으면(js/cloud/config.js) 로그인하고 승인된 사용자만 부를 수 있다.
//   BRAIN_ACCESS_CODE  선택 — 수파베이스 없이 쓸 때, 넣으면 화면의 "접속 코드"가 같아야 호출된다.
//   BRAIN_CLAUDE_MODELS 선택 — 쉼표로 적은 허용 모델. 기본은 claude-opus-5-5,claude-sonnet-5-5
import { guard, bearer } from './_guard.js';

const VERSION = '2026-10-21';

export async function forward({ method, code, token, payload, fetchImpl }) {
  const fail = (status, message) => ({ status, body: JSON.stringify({ error: { message } }) });
  if (method !== 'POST') return fail(405, 'POST만 받는다');
  const g = await guard({ code, token, fetchImpl });   // 누구인지부터 본다
  if (!g.ok) return fail(g.status, g.message);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(503, '서버에 ANTHROPIC_API_KEY가 없다');
  const body = payload?.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return fail(400, '허용하지 않는 요청');
  const allowed = new Set((process.env.BRAIN_CLAUDE_MODELS || 'claude-opus-5-5,claude-sonnet-5-5').split(',').map((x) => x.trim()));
  if (!allowed.has(body.model)) return fail(400, `허용하지 않는 모델: ${body.model}`);
  // 받는 항목만 넘긴다 — 도구나 다른 선택 항목은 프록시로 쓸 수 없다
  const safe = { model: body.model, max_tokens: Math.min(32000, Math.max(1, Number(body.max_tokens) || 8000)), system: typeof body.system === 'string' ? body.system : '', messages: body.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') };
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'anthropic-version': VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify(safe) });
  return { status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  const out = await forward({ method: req.method, code: req.headers['x-brain-code'], token: bearer(req.headers), payload: typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body });
  res.status(out.status).setHeader('Content-Type', 'application/json').send(out.body);
}
