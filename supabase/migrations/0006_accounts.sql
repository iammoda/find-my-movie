-- Accounts: Supabase Auth integration.
-- Profiles map 1:1 to auth.users (profiles.id stores the auth user UUID as text).
-- The legacy single-user data lives under profile 'default'; the first real
-- account to sign up claims it via claim_default_profile().

-- 1. Profile metadata.
alter table profiles add column if not exists email text;

-- 2. Auto-create a profile row for every new auth user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id::text, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 3. First real account claims all legacy data stored under the 'default' profile.
-- Returns true when a claim happened. Safe to call repeatedly: subsequent
-- accounts (or repeat calls once another profile exists) are no-ops.
create or replace function public.claim_default_profile(target_profile_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  other_profiles integer;
begin
  if target_profile_id is null or target_profile_id = 'default' then
    return false;
  end if;

  -- Only the first real account may claim the legacy data.
  select count(*) into other_profiles
  from profiles
  where id <> 'default' and id <> target_profile_id;

  if other_profiles > 0 then
    return false;
  end if;

  -- Ensure the target profile exists (the auth trigger normally creates it).
  insert into profiles (id) values (target_profile_id) on conflict do nothing;

  update ratings set profile_id = target_profile_id where profile_id = 'default';
  update rating_reasons set profile_id = target_profile_id where profile_id = 'default';
  update rating_trait_reasons set profile_id = target_profile_id where profile_id = 'default';
  update comparisons set profile_id = target_profile_id where profile_id = 'default';
  update appeal_signals set profile_id = target_profile_id where profile_id = 'default';
  update movie_exposures set profile_id = target_profile_id where profile_id = 'default';
  update recommendation_runs set profile_id = target_profile_id where profile_id = 'default';
  update recommendation_items set profile_id = target_profile_id where profile_id = 'default';
  update hidden_recommendations set profile_id = target_profile_id where profile_id = 'default';
  update watchlist_items set profile_id = target_profile_id where profile_id = 'default';

  return true;
end;
$$;

-- Only the server (service role) may run the claim.
revoke execute on function public.claim_default_profile(text) from public, anon, authenticated;
grant execute on function public.claim_default_profile(text) to service_role;
