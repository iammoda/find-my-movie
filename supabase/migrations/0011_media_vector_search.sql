-- Media-aware vector search. Without a media filter the ANN query returns
-- mostly movies (they dominate the table and the query anchors are usually
-- loved movies), starving the TV candidate pool. Media is encoded in the
-- canonical catalog id: tv rows live at tmdb_id >= 1e9 (see src/lib/mediaId).

create or replace function match_movie_embeddings(
  query_embedding vector(1536),
  match_count integer default 250,
  exclude_tmdb_ids integer[] default '{}',
  media text default null
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
    and (
      media is null
      or (media = 'tv' and movie_embeddings.tmdb_id >= 1000000000)
      or (media = 'movie' and movie_embeddings.tmdb_id < 1000000000)
    )
  order by movie_embeddings.embedding <=> query_embedding
  limit match_count;
$$;
