-- TV support: the movies table becomes a mixed-media catalog with a canonical
-- catalog id. `tmdb_id` stays the single-integer key every other table
-- references; movies keep tmdb_id = TMDB movie id, TV shows are stored at
-- 1_000_000_000 + TMDB tv id. media_type + source_id carry the truth
-- explicitly so nothing depends on arithmetic alone.

alter table movies add column if not exists media_type text not null default 'movie'
  check (media_type in ('movie', 'tv'));
alter table movies add column if not exists source_id integer;

update movies set source_id = tmdb_id where source_id is null;
alter table movies alter column source_id set not null;

create unique index if not exists movies_media_source_idx on movies(media_type, source_id);
create index if not exists movies_media_type_idx on movies(media_type);
