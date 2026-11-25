-- 0002: 메일 확인(Confirm email)을 끄고 쓴다.
--   메일 확인이 없으면 주소의 주인인지 알 수 없다. 그래서 메일 주소만으로 수퍼관리자를 주지 않는다.
--   가입하면 모두 승인 대기다. 처음 수퍼관리자는 SQL Editor에서 한 번 올린다:
--     update public.profiles set role = 'super_admin', approved_at = now() where email = 'jh.min@from.co.kr';
create or replace function public.brain_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) not like '%@from.co.kr' then
    raise exception '회사 메일(@from.co.kr)만 가입할 수 있습니다';
  end if;
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;
revoke all on function public.brain_handle_new_user() from public, anon, authenticated;
