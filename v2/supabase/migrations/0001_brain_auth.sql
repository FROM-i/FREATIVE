-- 더프롬 브레인 — 로그인 · 권한 · 프로젝트 저장
--   가입: 회사 메일(@from.co.kr)만. 가입하면 "승인 대기"이고, 관리자가 승인해야 쓴다.
--   역할: pending(승인 대기) · member(사용) · admin(사용자 승인) · super_admin(관리자 지정까지)
--   프로젝트: 승인된 사용자는 모두 볼 수 있다. 고치고 지우는 것은 만든 사람과 관리자만.
--   처음 수퍼관리자: jh.min@from.co.kr — 이 메일로 가입하면 바로 수퍼관리자가 된다. 메일 확인(Confirm email)이 켜져 있어야 안전하다.

create type public.brain_role as enum ('pending', 'member', 'admin', 'super_admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role public.brain_role not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id)
);
alter table public.profiles enable row level security;

-- 지금 로그인한 사람의 역할. 정책 안에서 profiles를 다시 읽으면 정책이 자기 자신을 부르게 되므로 함수로 뺀다.
create or replace function public.brain_my_role() returns public.brain_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;
revoke all on function public.brain_my_role() from public, anon;
grant execute on function public.brain_my_role() to authenticated;

-- 가입할 때 프로필을 만든다. 회사 메일이 아니면 가입을 막는다.
create or replace function public.brain_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare boss boolean := lower(new.email) = 'jh.min@from.co.kr';
begin
  if lower(new.email) not like '%@from.co.kr' then
    raise exception '회사 메일(@from.co.kr)만 가입할 수 있습니다';
  end if;
  insert into public.profiles (id, email, name, role, approved_at)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'name', ''),
          case when boss then 'super_admin'::public.brain_role else 'pending'::public.brain_role end,
          case when boss then now() end);
  return new;
end $$;
revoke all on function public.brain_handle_new_user() from public, anon, authenticated;
create trigger brain_on_auth_user_created after insert on auth.users
  for each row execute function public.brain_handle_new_user();

-- 프로필: 자기 것은 본다. 관리자는 전부 본다. 직접 고치는 길은 없다(역할은 아래 함수로만 바꾼다).
create policy "profiles: 자기 것과 관리자" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.brain_my_role()) in ('admin', 'super_admin'));

-- 역할 바꾸기 — 관리자는 승인(pending ↔ member)만, 관리자 지정은 수퍼관리자만. 자기 역할은 못 바꾼다.
create or replace function public.brain_set_role(target uuid, new_role public.brain_role) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare me public.brain_role; cur public.brain_role; result public.profiles;
begin
  select role into me from public.profiles where id = (select auth.uid());
  if me is null or me not in ('admin', 'super_admin') then raise exception '권한이 없습니다'; end if;
  if target = (select auth.uid()) then raise exception '자기 역할은 바꿀 수 없습니다'; end if;
  select role into cur from public.profiles where id = target;
  if cur is null then raise exception '사용자를 찾을 수 없습니다'; end if;
  if me = 'admin' and (cur in ('admin', 'super_admin') or new_role in ('admin', 'super_admin')) then
    raise exception '관리자 역할은 수퍼관리자만 바꿀 수 있습니다';
  end if;
  update public.profiles
     set role = new_role,
         approved_at = case when new_role = 'pending' then null else coalesce(approved_at, now()) end,
         approved_by = (select auth.uid())
   where id = target returning * into result;
  return result;
end $$;
revoke all on function public.brain_set_role(uuid, public.brain_role) from public, anon;
grant execute on function public.brain_set_role(uuid, public.brain_role) to authenticated;

-- 프로젝트 — 화면의 프로젝트 하나를 통째로 넣는다(분석 결과 포함)
create table public.projects (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id),
  owner_email text not null default '',
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create index projects_owner_idx on public.projects (owner);
create index projects_updated_idx on public.projects (updated_at desc);

-- 고칠 때 만든 사람은 바뀌지 않고, 고친 시각을 적는다
create or replace function public.brain_touch_project() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.owner := old.owner; new.owner_email := old.owner_email; new.created_at := old.created_at; new.updated_at := now();
  return new;
end $$;
create trigger brain_projects_touch before update on public.projects
  for each row execute function public.brain_touch_project();

create policy "projects: 승인된 사용자는 본다" on public.projects for select to authenticated
  using ((select public.brain_my_role()) in ('member', 'admin', 'super_admin'));
create policy "projects: 승인된 사용자는 만든다" on public.projects for insert to authenticated
  with check (owner = (select auth.uid()) and (select public.brain_my_role()) in ('member', 'admin', 'super_admin'));
create policy "projects: 만든 사람과 관리자는 고친다" on public.projects for update to authenticated
  using ((owner = (select auth.uid()) and (select public.brain_my_role()) in ('member', 'admin', 'super_admin')) or (select public.brain_my_role()) in ('admin', 'super_admin'))
  with check ((owner = (select auth.uid()) and (select public.brain_my_role()) in ('member', 'admin', 'super_admin')) or (select public.brain_my_role()) in ('admin', 'super_admin'));
create policy "projects: 만든 사람과 관리자는 지운다" on public.projects for delete to authenticated
  using ((owner = (select auth.uid()) and (select public.brain_my_role()) in ('member', 'admin', 'super_admin')) or (select public.brain_my_role()) in ('admin', 'super_admin'));
