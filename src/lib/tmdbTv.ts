import { MEDIA_PROFILES, MIN_STABLE_RELEASE_DAYS, PRIMARY_ORIGINAL_LANGUAGE, TV_GENRES } from "@/lib/constants";
import { canonicalId, sourceIdOf } from "@/lib/mediaId";
import { isoDateDaysAgo, isReleasedAtLeastDaysAgo, mainstreamScore } from "@/lib/quality";
import { deriveTasteFacts } from "@/lib/taste";
import { tmdbConfigured, tmdbFetch } from "@/lib/tmdb";
import type { BrowseCategory, Genre, Movie, MovieCredit } from "@/lib/types";

/**
 * TMDB TV client. TV shows are mapped into the shared `Movie` shape with
 * canonical catalog ids (TV_ID_OFFSET + tmdb tv id) so the taste model, deck,
 * recommendations, watchlist, and friends stacks work unchanged. All vote
 * thresholds come from MEDIA_PROFILES.tv - TMDB TV vote counts run ~5-10x
 * lower than movies.
 */

const TV = MEDIA_PROFILES.tv;

interface TmdbTvListItem {
  id: number;
  name: string;
  original_name?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  genre_ids?: number[];
}

interface TmdbTvListResponse {
  page: number;
  results: TmdbTvListItem[];
}

interface TmdbTvDetailResponse extends TmdbTvListItem {
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  genres?: Genre[];
  origin_country?: string[];
  created_by?: Array<{ name: string }>;
  keywords?: { results?: Array<{ id: number; name: string }> };
  credits?: {
    cast?: Array<{ name: string; order?: number }>;
    crew?: Array<{ name: string; job?: string; department?: string }>;
  };
}

function tvGenreName(id: number) {
  return TV_GENRES.find((genre) => genre.id === id)?.name ?? String(id);
}

function mapListTv(item: TmdbTvListItem): Movie {
  const genres = (item.genre_ids ?? []).map((id) => ({ id, name: tvGenreName(id) }));
  return {
    tmdbId: canonicalId("tv", item.id),
    mediaType: "tv",
    title: item.name,
    originalTitle: item.original_name ?? item.name,
    originalLanguage: item.original_language ?? null,
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    releaseDate: item.first_air_date ?? null,
    runtime: null,
    voteAverage: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    popularity: item.popularity ?? 0,
    adult: item.adult ?? false,
    genres,
    keywords: [],
    countries: [],
    sourcePayload: item
  };
}

function mapDetailTv(item: TmdbTvDetailResponse): Movie {
  const catalogId = canonicalId("tv", item.id);
  const creators = (item.created_by ?? []).map((person) => person.name).filter(Boolean);
  const credit: MovieCredit = {
    tmdbId: catalogId,
    director: creators[0] ?? null,
    actors: (item.credits?.cast ?? [])
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 8)
      .map((person) => person.name),
    crew: creators.map((name) => `Creator: ${name}`)
  };
  const movie: Movie = {
    tmdbId: catalogId,
    mediaType: "tv",
    title: item.name,
    originalTitle: item.original_name ?? item.name,
    originalLanguage: item.original_language ?? null,
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    releaseDate: item.first_air_date ?? null,
    runtime: item.episode_run_time?.[0] ?? null,
    voteAverage: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    popularity: item.popularity ?? 0,
    adult: item.adult ?? false,
    genres: item.genres ?? [],
    keywords: item.keywords?.results?.map((keyword) => keyword.name) ?? [],
    countries: item.origin_country ?? [],
    credits: credit,
    // deriveTasteFacts reads these for format facts (limited vs long-runner).
    sourcePayload: { ...item, number_of_seasons: item.number_of_seasons, status: item.status }
  };
  return { ...movie, tasteFacts: deriveTasteFacts(movie) };
}

function credibleShows(shows: Movie[], minVoteCount: number, minPopularity: number, minReleaseAgeDays = 0) {
  return shows.filter(
    (show) =>
      !show.adult &&
      Boolean(show.posterPath) &&
      Boolean(show.overview) &&
      show.voteCount >= minVoteCount &&
      show.popularity >= minPopularity &&
      isReleasedAtLeastDaysAgo(show.releaseDate, minReleaseAgeDays) &&
      (show.originalLanguage ?? "en") === PRIMARY_ORIGINAL_LANGUAGE
  );
}

async function fetchTvDiscoverPages(
  page: number,
  params: Record<string, string | number | boolean | undefined>,
  pagesToFetch = 3
) {
  const pages = Array.from({ length: pagesToFetch }, (_, offset) => page + offset);
  const batches = await Promise.all(pages.map((currentPage) => tmdbFetch<TmdbTvListResponse>("/discover/tv", { ...params, page: currentPage })));
  return batches.flatMap((batch) => batch.results).map(mapListTv);
}

export async function fetchBrowseTv(category: BrowseCategory, page = 1, genreId?: number | null): Promise<Movie[]> {
  if (!tmdbConfigured()) return [];

  try {
    const params = {
      language: "en-US",
      page,
      include_adult: false,
      include_null_first_air_dates: false
    };

    if (category === "popular") {
      const shows = await fetchTvDiscoverPages(page, {
        ...params,
        sort_by: "popularity.desc",
        "vote_count.gte": TV.minBrowseVoteCount,
        "first_air_date.lte": isoDateDaysAgo(0),
        with_original_language: PRIMARY_ORIGINAL_LANGUAGE
      });
      return credibleShows(shows, TV.minBrowseVoteCount, TV.minBrowsePopularity, 0);
    }

    if (category === "top_rated") {
      const shows = await fetchTvDiscoverPages(page, {
        ...params,
        sort_by: "vote_average.desc",
        "vote_count.gte": TV.minTopRatedVoteCount,
        "first_air_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS),
        with_original_language: PRIMARY_ORIGINAL_LANGUAGE
      });
      return credibleShows(shows, TV.minTopRatedVoteCount, TV.minBrowsePopularity, MIN_STABLE_RELEASE_DAYS).sort(
        (a, b) => mainstreamScore(b) - mainstreamScore(a)
      );
    }

    const shows = await fetchTvDiscoverPages(page, {
      ...params,
      sort_by: "popularity.desc",
      "vote_count.gte": TV.minGenreVoteCount,
      "first_air_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS),
      with_original_language: PRIMARY_ORIGINAL_LANGUAGE,
      with_genres: genreId ?? undefined
    });
    return credibleShows(shows, TV.minGenreVoteCount, TV.minBrowsePopularity, MIN_STABLE_RELEASE_DAYS).sort(
      (a, b) => mainstreamScore(b) - mainstreamScore(a)
    );
  } catch (error) {
    console.warn("TMDB TV browse failed", error);
    return [];
  }
}

/** `sourceId` is the raw TMDB tv id (callers translate from canonical ids). */
export async function fetchTvDetails(sourceId: number): Promise<Movie | null> {
  if (!tmdbConfigured()) return null;
  try {
    const data = await tmdbFetch<TmdbTvDetailResponse>(`/tv/${sourceId}`, {
      language: "en-US",
      append_to_response: "credits,keywords"
    });
    return mapDetailTv(data);
  } catch (error) {
    console.warn("TMDB TV detail failed", error);
    return null;
  }
}

function normalizedTitle(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function searchTv(query: string): Promise<Movie[]> {
  const normalized = query.trim();
  if (!normalized || !tmdbConfigured()) return [];

  try {
    const data = await tmdbFetch<TmdbTvListResponse>("/search/tv", {
      query: normalized,
      language: "en-US",
      include_adult: false,
      page: 1
    });
    const listShows = data.results
      .map(mapListTv)
      .filter((show) => !show.adult && Boolean(show.posterPath) && Boolean(show.overview))
      .slice(0, 14);
    const detailed = await Promise.all(listShows.map((show) => fetchTvDetails(sourceIdOf(show.tmdbId))));
    return (detailed.map((show, index) => show ?? listShows[index]).filter(Boolean) as Movie[])
      .filter((show) => {
        const exact = normalizedTitle(show.title) === normalizedTitle(normalized) || normalizedTitle(show.originalTitle) === normalizedTitle(normalized);
        return exact || show.voteCount >= 20 || show.popularity >= 1;
      })
      .sort((a, b) => {
        const queryTitle = normalizedTitle(normalized);
        const aExact = normalizedTitle(a.title) === queryTitle || normalizedTitle(a.originalTitle) === queryTitle;
        const bExact = normalizedTitle(b.title) === queryTitle || normalizedTitle(b.originalTitle) === queryTitle;
        if (aExact !== bExact) return bExact ? 1 : -1;
        return mainstreamScore(b) - mainstreamScore(a);
      })
      .slice(0, 8);
  } catch (error) {
    console.warn("TMDB TV search failed", error);
    return [];
  }
}

function seedableShows(shows: Movie[]) {
  return shows.filter(
    (show) =>
      !show.adult &&
      Boolean(show.posterPath) &&
      Boolean(show.overview) &&
      show.voteCount >= 50 &&
      show.popularity >= 0.5 &&
      isReleasedAtLeastDaysAgo(show.releaseDate, MIN_STABLE_RELEASE_DAYS) &&
      (show.originalLanguage ?? "en") === PRIMARY_ORIGINAL_LANGUAGE
  );
}

const MAX_TV_DISCOVER_PAGE = 460;
const TV_EXPANSION_PAGES_PER_SLICE = 6;

/**
 * TV catalog growth from the popular head: most-voted of all time, currently
 * popular with real vote mass, and recent well-known series. Same strategy as
 * the movie expansion; `pageOffset` advances the read window per slice.
 */
export async function fetchTvCatalogExpansion(pageOffset: number, target = 400): Promise<Movie[]> {
  if (!tmdbConfigured()) return [];

  const byId = new Map<number, Movie>();
  const baseParams = {
    language: "en-US",
    include_adult: false,
    include_null_first_air_dates: false,
    with_original_language: PRIMARY_ORIGINAL_LANGUAGE,
    "first_air_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS)
  };

  const slices: Array<{ baseStart: number; params: Record<string, string | number | boolean | undefined> }> = [
    { baseStart: 1, params: { ...baseParams, sort_by: "vote_count.desc", "vote_count.gte": 500 } },
    { baseStart: 1, params: { ...baseParams, sort_by: "popularity.desc", "vote_count.gte": 200 } },
    {
      baseStart: 1,
      params: {
        ...baseParams,
        sort_by: "popularity.desc",
        "vote_count.gte": 100,
        "first_air_date.gte": isoDateDaysAgo(365 * 2)
      }
    }
  ];

  try {
    for (const slice of slices) {
      const startPage = slice.baseStart + Math.max(0, pageOffset) * TV_EXPANSION_PAGES_PER_SLICE;
      if (startPage > MAX_TV_DISCOVER_PAGE) continue;
      if (byId.size >= target) break;
      const shows = await fetchTvDiscoverPages(startPage, slice.params, TV_EXPANSION_PAGES_PER_SLICE);
      for (const show of seedableShows(shows)) {
        byId.set(show.tmdbId, show);
        if (byId.size >= target) break;
      }
    }
  } catch (error) {
    console.warn("TMDB TV catalog expansion failed, returning partial batch", error);
  }

  return Array.from(byId.values()).sort((a, b) => mainstreamScore(b) - mainstreamScore(a));
}

/** Starter pool for first-time TV seeding: the popular head, a few thousand shows. */
export async function fetchTvStarterPool(target = 3000): Promise<Movie[]> {
  if (!tmdbConfigured()) return [];
  const byId = new Map<number, Movie>();
  for (let offset = 0; offset < 30 && byId.size < target; offset += 1) {
    const batch = await fetchTvCatalogExpansion(offset, target - byId.size);
    if (!batch.length) break;
    for (const show of batch) byId.set(show.tmdbId, show);
  }
  return Array.from(byId.values());
}
