create table if not exists rating_trait_reasons (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  trait_id text not null,
  sentiment text not null check (sentiment in ('positive', 'negative')),
  created_at timestamptz not null default now(),
  unique (profile_id, tmdb_id, sentiment, trait_id)
);

create index if not exists rating_trait_reasons_profile_movie_idx on rating_trait_reasons(profile_id, tmdb_id);
