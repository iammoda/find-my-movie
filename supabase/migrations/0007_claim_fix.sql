-- Claim fix: the "first account" guard must look at real auth users, not
-- profiles rows. Sentinel/junk profile rows (e.g. the anonymous read sentinel)
-- previously blocked the legacy-data claim.

-- 1. Backfill profiles for any auth users created before the 0006 trigger.
insert into profiles (id, email)
select id::text, email from auth.users
on conflict (id) do update set email = excluded.email;

-- 2. Recreate the claim with an auth.users-based guard.
create or replace function public.claim_default_profile(target_profile_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  other_users integer;
begin
  if target_profile_id is null or target_profile_id = 'default' then
    return false;
  end if;

  -- Only the first real auth user may claim the legacy data.
  select count(*) into other_users
  from auth.users
  where id::text <> target_profile_id;

  if other_users > 0 then
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

revoke execute on function public.claim_default_profile(text) from public, anon, authenticated;
grant execute on function public.claim_default_profile(text) to service_role;
