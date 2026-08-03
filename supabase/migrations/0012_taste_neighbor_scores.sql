-- Taste-neighbor (collaborative filtering) scores, computed offline by
-- scripts/build-taste-neighbors.ts from the MovieLens 32M dataset.
--
-- The content model predicts this catalog's dislikes well but cannot separate
-- "solid" from "loved" (backtest MAE 1.82, precision@10 0.50). Neighbor scores
-- from users with matching rating fingerprints reached MAE 1.69 / p@10 0.90 on
-- the same held-out ratings, so recommendation ranking blends them in as the
-- primary positive signal.

create table if not exists taste_neighbor_scores (
  profile_id text not null references profiles(id) on delete cascade,
  tmdb_id bigint not null,
  score real not null,        -- predicted rank score, 0-10 scale
  support integer not null,   -- how many neighbor users rated the movie
  updated_at timestamptz not null default now(),
  primary key (profile_id, tmdb_id)
);

create index if not exists taste_neighbor_scores_profile_score_idx
  on taste_neighbor_scores (profile_id, score desc);

alter table taste_neighbor_scores enable row level security;

-- Service-role access only (the app reads through the server store).
