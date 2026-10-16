-- THE FROM FREATIVE — 중앙관제 스키마 초안 (지금은 배포하지 않는다)
-- 앱의 로컬 project.json 이 이미 ownerId·orgId·teamId·visibility 를 갖고 있어 그대로 옮겨진다.
-- 구현 시: src/main/services/auth.js 에 CentralAuthProvider, storage.js 에 CentralProjectStore 를 추가한다.

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- 역할: owner · admin · lead · designer · viewer  (auth.js ROLES 와 같은 이름)
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  role text not null check (role in ('owner','admin','lead','designer','viewer'))
);
create unique index memberships_uniq on memberships (user_id, org_id, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table projects (
  id text primary key,                         -- 로컬 id 그대로 (YYYYMMDD-xxxxxx)
  org_id uuid not null references orgs(id),
  team_id uuid references teams(id),
  owner_id uuid not null references auth.users(id),
  visibility text not null default 'private' check (visibility in ('private','team','org')),
  name text not null,
  brief jsonb not null,                        -- 접수 폼
  run jsonb,                                   -- 실행 상태·단계별 결과·게이트 기록
  status text generated always as (run->>'status') stored,
  knowledge_version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table artifacts (                       -- 첨부·생성 이미지·보고서 (Supabase Storage 경로)
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  kind text not null check (kind in ('attachment','image','report','brief')),
  path text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create table gate_decisions (                  -- C 게이트 판정 이력 (누가, 언제, 무엇을)
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  gate text not null,                          -- 'brief' | 'C' | 'G7' …
  decision text not null,                      -- go | revise | stop
  note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz default now()
);

alter table projects enable row level security;
alter table artifacts enable row level security;
alter table gate_decisions enable row level security;

-- 읽기: 본인 · 같은 팀(visibility=team) · 같은 조직(visibility=org) · 조직 owner/admin
create policy project_read on projects for select using (
  owner_id = auth.uid()
  or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = projects.org_id
             and (m.role in ('owner','admin')
                  or (projects.visibility = 'org')
                  or (projects.visibility = 'team' and m.team_id = projects.team_id)))
);
-- 쓰기: 본인 · 팀 lead · 조직 owner/admin
create policy project_write on projects for update using (
  owner_id = auth.uid()
  or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = projects.org_id
             and (m.role in ('owner','admin') or (m.role = 'lead' and m.team_id = projects.team_id)))
);
create policy project_insert on projects for insert with check (
  owner_id = auth.uid()
  and exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = projects.org_id and m.role <> 'viewer')
);
