create extension if not exists vector;

create table if not exists profiles (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists movies (
  tmdb_id integer primary key,
  title text not null,
  original_title text,
  original_language text not null default 'en',
  overview text not null default '',
  poster_path text,
  backdrop_path text,
  release_date text,
  runtime integer,
  vote_average numeric not null default 0,
  vote_count integer not null default 0,
  popularity numeric not null default 0,
  adult boolean not null default false,
  genres jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  countries jsonb not null default '[]'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists movie_credits (
  tmdb_id integer primary key references movies(tmdb_id) on delete cascade,
  director text,
  actors jsonb not null default '[]'::jsonb,
  crew jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists movie_taste_facts (
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  kind text not null,
  value text not null,
  weight numeric not null default 1,
  source text not null default 'heuristic',
  primary key (tmdb_id, kind, value)
);

create table if not exists movie_embeddings (
  tmdb_id integer primary key references movies(tmdb_id) on delete cascade,
  model text not null default 'text-embedding-3-small',
  embedding vector(1536),
  feature_text text not null,
  updated_at timestamptz not null default now()
);

create table if not exists movie_exposures (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  source text not null,
  source_detail text,
  created_at timestamptz not null default now()
);

create table if not exists ratings (
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  rating text not null check (rating in ('best_ever', 'like', 'skip', 'dislike', 'hate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, tmdb_id)
);

create table if not exists recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  prompt_version text not null,
  scoring_version text not null,
  status text not null,
  baseline_average numeric,
  recommendation_average numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recommendation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  rank integer not null,
  score numeric not null,
  baseline_score numeric not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  explanation text not null,
  created_at timestamptz not null default now()
);

create table if not exists hidden_recommendations (
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (profile_id, tmdb_id)
);

insert into profiles (id) values ('default') on conflict do nothing;

alter table movies add column if not exists original_language text not null default 'en';
update movies
set original_language = coalesce(nullif(source_payload->>'original_language', ''), original_language, 'en');

create index if not exists movie_exposures_profile_idx on movie_exposures(profile_id, created_at desc);
create index if not exists recommendation_items_profile_idx on recommendation_items(profile_id, created_at desc);
create index if not exists movies_quality_idx on movies(vote_count desc, vote_average desc);

create or replace function match_movie_embeddings(
  query_embedding vector(1536),
  match_count integer default 250,
  exclude_tmdb_ids integer[] default '{}'
)
returns table (tmdb_id integer, similarity double precision)
language sql
stable
as $$
  select
    movie_embeddings.tmdb_id,
    1 - (movie_embeddings.embedding <=> query_embedding) as similarity
  from movie_embeddings
  where movie_embeddings.embedding is not null
    and not (movie_embeddings.tmdb_id = any(exclude_tmdb_ids))
  order by movie_embeddings.embedding <=> query_embedding
  limit match_count;
$$;
