'use strict';
/**
 * 인증·권한 — AuthProvider 인터페이스
 *
 * 지금: LocalAuthProvider — 이 PC 사용자 한 명, 조직 'thefrom', 역할 owner.
 * 이후: CentralAuthProvider — 중앙관제(예: Supabase Auth) 로그인, 조직·팀·역할을 서버에서 받는다.
 *
 * 앱의 모든 IPC 처리기는 auth.can(user, action, resource)를 거친다.
 * 지금은 항상 통과하지만, 중앙관제로 바꿀 때 처리기를 고치지 않고 이 파일만 바꾸면 된다.
 *
 * interface AuthProvider {
 *   current(): Promise<User>              // { id, name, email, orgId, teamIds[], role }
 *   signIn?(credentials): Promise<User>
 *   signOut?(): Promise<void>
 * }
 */
const os = require('os');

const ROLES = {
  // 역할 → 허용 액션. 중앙관제에서 그대로 쓰도록 정의만 해 둔다.
  owner:    ['project:create', 'project:read', 'project:update', 'project:delete', 'project:share', 'run:execute', 'settings:manage', 'org:manage', 'team:manage'],
  admin:    ['project:create', 'project:read', 'project:update', 'project:delete', 'project:share', 'run:execute', 'settings:manage', 'team:manage'],
  lead:     ['project:create', 'project:read', 'project:update', 'project:delete', 'project:share', 'run:execute'],
  designer: ['project:create', 'project:read', 'project:update', 'run:execute'],
  viewer:   ['project:read'],
};

class LocalAuthProvider {
  constructor() {
    let name = 'designer';
    try { name = os.userInfo().username; } catch { /* noop */ }
    this.user = {
      id: `local:${os.hostname()}:${name}`,
      name,
      email: '',
      orgId: 'thefrom',
      teamIds: [],
      role: 'owner',
      provider: 'local',
    };
  }
  async current() { return this.user; }
}

let provider = new LocalAuthProvider();

function setProvider(p) { provider = p; }
async function current() { return provider.current(); }

/**
 * 권한 판정. resource는 { ownerId, orgId, teamId, visibility } 형태(프로젝트 메타)다.
 * visibility: 'private' | 'team' | 'org'
 */
function can(user, action, resource) {
  if (!user) return false;
  const allowed = ROLES[user.role] || [];
  if (!allowed.includes(action)) return false;
  if (!resource) return true;
  if (resource.orgId && user.orgId && resource.orgId !== user.orgId) return false;
  if (resource.ownerId === user.id) return true;
  if (action === 'project:read') {
    if (resource.visibility === 'org') return true;
    if (resource.visibility === 'team' && user.teamIds.includes(resource.teamId)) return true;
  }
  return ['owner', 'admin'].includes(user.role) || (user.role === 'lead' && user.teamIds.includes(resource.teamId));
}

module.exports = { current, can, setProvider, ROLES, LocalAuthProvider };
