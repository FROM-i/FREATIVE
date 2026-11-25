// 수파베이스 — 로그인, 역할, 프로젝트 저장. 의존 패키지 없이 Auth · REST 주소를 직접 부른다.
//   로그인 상태는 이 브라우저에 저장한다. 토큰은 만료 1분 전에 새로 받는다.
//   권한은 서버(RLS)가 지킨다. 여기서 숨기는 버튼은 편의일 뿐이다.
const LS_SESSION = 'thefrom-brain:session';
export const ROLES = { pending: '승인 대기', member: '사용자', admin: '관리자', super_admin: '수퍼관리자' };
export const canUse = (role) => ['member', 'admin', 'super_admin'].includes(role);
export const isAdmin = (role) => ['admin', 'super_admin'].includes(role);

const MESSAGES = [
  [/invalid_credentials|Invalid login credentials/i, '메일 주소나 비밀번호가 맞지 않습니다.'],
  [/email_not_confirmed|Email not confirmed/i, '메일 확인이 끝나지 않았습니다. 받은 메일의 확인 링크를 눌러 주세요.'],
  [/user_already_exists|already registered/i, '이미 가입한 메일 주소입니다. 로그인해 주세요.'],
  [/weak_password|Password should be/i, '비밀번호가 너무 짧거나 단순합니다. 8자 이상으로 정해 주세요.'],
  [/over_email_send_rate_limit|rate limit/i, '확인 메일을 너무 자주 보냈습니다. 잠시 뒤 다시 해 주세요.'],
  [/Database error saving new user|회사 메일/i, '회사 메일(@from.co.kr)만 가입할 수 있습니다.'],
  [/row-level security|permission denied|42501/i, '권한이 없습니다. 만든 사람이나 관리자만 고칠 수 있습니다.'],
];
const friendly = (raw) => { const text = typeof raw === 'string' ? raw : [raw?.error_code, raw?.code, raw?.msg, raw?.message, raw?.error_description, raw?.error].filter(Boolean).join(' '); const hit = MESSAGES.find(([re]) => re.test(text)); return hit ? hit[1] : (raw?.msg || raw?.message || raw?.error_description || text || '요청이 실패했습니다.'); };

export function createCloud({ url, key }, { fetchImpl = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  const base = String(url || '').replace(/\/$/, '');
  let session = null;
  try { session = JSON.parse(storage?.getItem(LS_SESSION) || 'null'); } catch { session = null; }
  const keep = (s) => { session = s; try { if (s) storage?.setItem(LS_SESSION, JSON.stringify(s)); else storage?.removeItem(LS_SESSION); } catch { /* 저장 실패는 넘어간다 */ } };

  async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
    const r = await fetchImpl(`${base}${path}`, { method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await r.text(); let json = null; try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
    if (!r.ok) throw Object.assign(new Error(friendly(json || raw)), { status: r.status, detail: json });
    return json;
  }
  const adopt = (j) => { if (!j?.access_token) return null; const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: (j.expires_at ? j.expires_at * 1000 : now() + (j.expires_in || 3600) * 1000), user: { id: j.user?.id, email: j.user?.email } }; keep(s); return s; };

  /** 쓸 수 있는 토큰 — 만료가 가까우면 새로 받는다. 로그인이 풀렸으면 null */
  async function token() {
    if (!session) return null;
    if (session.expires_at - now() > 60000) return session.access_token;
    try { const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }); return adopt(j)?.access_token || null; }
    catch { keep(null); return null; }
  }
  const authed = async (path, opt = {}) => { const t = await token(); if (!t) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 }); return call(path, { ...opt, token: t }); };

  return {
    get user() { return session?.user || null; },
    token,
    /** 가입 — 확인 메일을 보낸다. 메일을 확인해야 로그인할 수 있다 */
    async signUp(email, password, name) {
      const j = await call('/auth/v1/signup', { method: 'POST', body: { email: email.trim().toLowerCase(), password, data: { name: name.trim() } } });
      return { confirmed: !!adopt(j), email: j?.email || j?.user?.email || email };
    },
    async signIn(email, password) {
      const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim().toLowerCase(), password } });
      return adopt(j)?.user || null;
    },
    /** 확인 메일의 링크로 돌아왔을 때 — 주소 뒤(#)에 실려 온 로그인을 받는다 */
    async adoptHash(hash) {
      const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
      if (q.get('error_description')) throw new Error(friendly(q.get('error_description')));
      const access = q.get('access_token'); const refresh = q.get('refresh_token');
      if (!access || !refresh) return false;
      const user = await call('/auth/v1/user', { token: access });
      return !!adopt({ access_token: access, refresh_token: refresh, expires_in: Number(q.get('expires_in')) || 3600, user });
    },
    async signOut() { const t = session?.access_token; keep(null); if (t) { try { await call('/auth/v1/logout', { method: 'POST', token: t }); } catch { /* 이미 풀린 로그인 */ } } },
    /** 내 프로필 — 역할이 들어 있다 */
    async profile() { const rows = await authed(`/rest/v1/profiles?id=eq.${session.user.id}&select=id,email,name,role`); return rows?.[0] || null; },
    /** 사용자 목록 — 관리자만 전부 받는다 */
    listProfiles: () => authed('/rest/v1/profiles?select=id,email,name,role,created_at,approved_at&order=created_at.asc'),
    setRole: (id, role) => authed('/rest/v1/rpc/brain_set_role', { method: 'POST', body: { target: id, new_role: role } }),
    /** 프로젝트 목록 — 내용 없이 이름만 */
    listProjects: () => authed('/rest/v1/projects?select=id,title,owner,owner_email,updated_at&order=updated_at.desc'),
    async getProject(id) { const rows = await authed(`/rest/v1/projects?id=eq.${encodeURIComponent(id)}&select=id,owner,owner_email,data,updated_at`); return rows?.[0] || null; },
    /** 저장 — 없으면 만들고 있으면 고친다. 만든 사람은 서버가 지킨다 */
    saveProject: (project) => authed('/rest/v1/projects?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: project.id, title: project.title || '', owner: session.user.id, owner_email: session.user.email, data: project } }),
    deleteProject: (id) => authed(`/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
  };
}
