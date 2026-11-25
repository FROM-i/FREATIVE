// 서버 키 프록시 — 회사 키를 직원 PC에 나눠 주지 않고 쓴다.
// Vercel에 v2/ 를 올리면 이 파일이 /api/llm 함수가 된다. 로컬에서는 server.js 가 같은 forward()를 쓴다.
//   OPENAI_API_KEY     필수
//   BRAIN_ACCESS_CODE  선택 — 넣으면 화면의 "접속 코드"가 같아야 호출된다. 사내 배포에서는 넣는다.
//   OPENAI_BASE_URL    선택 — 기본 https://api.openai.com/v1
import { guard, bearer } from './_guard.js';

const ALLOWED = new Set(['/responses', '/chat/completions']);

export async function forward({ method, code, token, payload }) {
  const fail = (status, message) => ({ status, body: JSON.stringify({ error: { message } }) });
  if (method !== 'POST') return fail(405, 'POST만 받는다');
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail(503, '서버에 OPENAI_API_KEY가 없다');
  const g = await guard({ code, token });
  if (!g.ok) return fail(g.status, g.message);
  const { path, body } = payload || {};
  if (!ALLOWED.has(path) || !body || typeof body !== 'object') return fail(400, '허용하지 않는 요청');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: false }) });
  return { status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  const out = await forward({ method: req.method, code: req.headers['x-brain-code'], token: bearer(req.headers), payload: typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body });
  res.status(out.status).setHeader('Content-Type', 'application/json').send(out.body);
}
