-- Ranking overhaul: verdicts + comparative ranking, appeal signals, exposure behavior capture.

-- 1. Ratings gain verdict / rank_score / media_type
alter table ratings add column if not exists verdict text check (verdict in ('loved', 'fine', 'disliked'));
alter table ratings add column if not exists rank_score numeric check (rank_score >= 0 and rank_score <= 10);
alter table ratings add column if not exists media_type text not null default 'movie';

create index if not exists ratings_profile_verdict_idx on ratings(profile_id, verdict, rank_score desc);

-- 2. Head-to-head comparisons ("which did you prefer?")
create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  winner_tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  loser_tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (winner_tmdb_id <> loser_tmdb_id)
);

create index if not exists comparisons_profile_idx on comparisons(profile_id, created_at desc);

-- 3. Appeal signals for unseen titles (want to watch / not interested)
create table if not exists appeal_signals (
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  signal text not null check (signal in ('want_to_watch', 'not_interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, tmdb_id)
);

create index if not exists appeal_signals_profile_idx on appeal_signals(profile_id, signal);

-- 4. Passive behavior capture on exposures
alter table movie_exposures add column if not exists dwell_ms integer;
alter table movie_exposures add column if not exists flipped boolean not null default false;
alter table movie_exposures add column if not exists decision_ms integer;
