-- Friends fixes: display names always fall back to the email prefix.

-- 1. Backfill existing profiles that signed up without a display name.
update profiles
set display_name = split_part(email, '@', 1)
where display_name is null and email is not null;

-- 2. New signups default to the email prefix when no display name is given.
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
    coalesce(
      nullif(left(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), 40), ''),
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 40), '')
    )
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(profiles.display_name, excluded.display_name);
  return new;
end;
$$;
