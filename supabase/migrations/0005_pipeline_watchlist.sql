-- Phase 2: intelligence pipeline caches + watchlist / outcome loop.

-- 1. Cached taxonomy trait embeddings (avoids re-embedding 90 traits per scoring run).
create table if not exists taxonomy_embeddings (
  trait_id text primary key,
  version text not null,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

-- 2. LLM enrichment ledger (idempotency + stored "essence" summary).
create table if not exists movie_enrichments (
  tmdb_id integer primary key references movies(tmdb_id) on delete cascade,
  version text not null,
  essence text,
  trait_count integer not null default 0,
  enriched_at timestamptz not null default now()
);

-- 3. Watchlist + post-watch outcomes.
create table if not exists watchlist_items (
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id integer not null references movies(tmdb_id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'watched', 'abandoned')),
  added_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (profile_id, tmdb_id)
);

create index if not exists watchlist_profile_status_idx on watchlist_items(profile_id, status);

-- movie_taste_facts already allows source 'llm' (text column, no enum), so no change needed there.
