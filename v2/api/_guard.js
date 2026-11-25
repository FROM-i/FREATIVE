// 서버 키 프록시의 문지기 — 누가 부를 수 있는가.
//   수파베이스가 연결돼 있으면: 로그인한 사용자이고 승인된 역할(사용자 · 관리자 · 수퍼관리자)이어야 한다.
//   연결돼 있지 않으면: BRAIN_ACCESS_CODE를 넣었을 때 그 코드가 같아야 한다.
import { CLOUD } from '../js/cloud/config.js';

const OK_ROLES = new Set(['member', 'admin', 'super_admin']);

/** @returns {Promise<{ ok: true, user?: object } | { ok: false, status: number, message: string }>} */
export async function guard({ code, token, fetchImpl = (...a) => fetch(...a) }) {
  // 배포(VERCEL)에서는 config.js의 값으로 지킨다. 내 컴퓨터에서는 SUPABASE_URL을 넣었을 때만 로그인을 확인한다
  const on = !!process.env.SUPABASE_URL || !!process.env.VERCEL;
  const url = process.env.SUPABASE_URL || CLOUD.url; const key = process.env.SUPABASE_PUBLISHABLE_KEY || CLOUD.key;
  if (on && url && key) {
    if (!token) return { ok: false, status: 401, message: '로그인이 필요하다' };
    const headers = { apikey: key, Authorization: `Bearer ${token}` };
    const u = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers });
    if (!u.ok) return { ok: false, status: 401, message: '로그인이 만료됐다. 다시 로그인한다' };
    const user = await u.json();
    const p = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers });
    const rows = p.ok ? await p.json() : [];
    if (!OK_ROLES.has(rows?.[0]?.role)) return { ok: false, status: 403, message: '승인된 사용자만 쓸 수 있다' };
    return { ok: true, user: { id: user.id, email: user.email, role: rows[0].role } };
  }
  const need = process.env.BRAIN_ACCESS_CODE;
  if (need && code !== need) return { ok: false, status: 401, message: '접속 코드가 맞지 않는다' };
  return { ok: true };
}
export const bearer = (headers) => { const v = headers?.authorization || headers?.Authorization || ''; return v.startsWith('Bearer ') ? v.slice(7) : ''; };
