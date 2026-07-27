create table if not exists rating_reasons (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  reason text not null check (reason in ('story', 'tone', 'character', 'pacing', 'visuals_world', 'ending_payoff')),
  sentiment text not null check (sentiment in ('positive', 'negative')),
  created_at timestamptz not null default now()
);

create index if not exists rating_reasons_profile_movie_idx on rating_reasons(profile_id, tmdb_id);
