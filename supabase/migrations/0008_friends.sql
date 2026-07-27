-- Friends (Phase 1): display names, invite links, mutual friendships.

-- 1. Display names (backfill from email prefix for existing accounts).
alter table profiles add column if not exists display_name text
  check (display_name is null or char_length(display_name) between 1 and 40);
update profiles
set display_name = split_part(email, '@', 1)
where display_name is null and email is not null;

-- 2. Signup can provide a display name via auth metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id::text,
    new.email,
    nullif(left(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), 40), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(profiles.display_name, excluded.display_name);
  return new;
end;
$$;

-- 3. Invite links: multi-use until expiry, revocable by the inviter.
create table if not exists friend_invites (
  token uuid primary key default gen_random_uuid(),
  inviter_profile_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index if not exists friend_invites_inviter_idx on friend_invites(inviter_profile_id);

-- 4. Friendships: one row per pair, canonical ordering (a < b). Accepting an
-- invite creates the friendship directly; there is no pending state.
create table if not exists friendships (
  profile_a text not null references profiles(id) on delete cascade,
  profile_b text not null references profiles(id) on delete cascade,
  invited_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_a, profile_b),
  check (profile_a < profile_b)
);

create index if not exists friendships_profile_b_idx on friendships(profile_b);
