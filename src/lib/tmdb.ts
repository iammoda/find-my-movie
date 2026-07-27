import {
  MIN_BROWSE_POPULARITY,
  MIN_BROWSE_VOTE_COUNT,
  MIN_GENRE_VOTE_COUNT,
  MIN_STABLE_RELEASE_DAYS,
  MIN_TOP_RATED_VOTE_COUNT,
  MOVIE_GENRES,
  PRIMARY_ORIGINAL_LANGUAGE,
  MAX_STARTER_POOL_MOVIES
} from "@/lib/constants";
import { FALLBACK_MOVIES } from "@/lib/data/fallbackMovies";
import { isPrimaryAudienceMovie } from "@/lib/language";
import { isoDateDaysAgo, isReleasedAtLeastDaysAgo, mainstreamScore } from "@/lib/quality";
import { deriveTasteFacts } from "@/lib/taste";
import type { BrowseCategory, Genre, Movie, MovieCredit } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TmdbMovieListItem {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  adult?: boolean;
  genre_ids?: number[];
}

interface TmdbListResponse {
  page: number;
  results: TmdbMovieListItem[];
}

interface TmdbSearchResponse extends TmdbListResponse {
  total_results: number;
}

interface TmdbDetailResponse extends TmdbMovieListItem {
  runtime?: number | null;
  genres?: Genre[];
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  keywords?: { keywords?: Array<{ id: number; name: string }> };
  credits?: {
    cast?: Array<{ name: string; order?: number }>;
    crew?: Array<{ name: string; job?: string; department?: string }>;
  };
}

function genreName(id: number) {
  return MOVIE_GENRES.find((genre) => genre.id === id)?.name ?? String(id);
}

function tmdbConfigured() {
  return Boolean(process.env.TMDB_ACCESS_TOKEN);
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      Accept: "application/json"
    },
    next: { revalidate: 60 * 60 }
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 4000)));
    return tmdbFetch<T>(path, params);
  }

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function mapListMovie(item: TmdbMovieListItem): Movie {
  const genres = (item.genre_ids ?? []).map((id) => ({ id, name: genreName(id) }));
  return {
    tmdbId: item.id,
    title: item.title,
    originalTitle: item.original_title ?? item.title,
    originalLanguage: item.original_language ?? null,
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    releaseDate: item.release_date ?? null,
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

function mapDetailMovie(item: TmdbDetailResponse): Movie {
  const crew = item.credits?.crew ?? [];
  const director = crew.find((person) => person.job === "Director")?.name ?? null;
  const credit: MovieCredit = {
    tmdbId: item.id,
    director,
    actors: (item.credits?.cast ?? [])
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 8)
      .map((person) => person.name),
    crew: crew.slice(0, 12).map((person) => `${person.job}: ${person.name}`)
  };
  const movie: Movie = {
    tmdbId: item.id,
    title: item.title,
    originalTitle: item.original_title ?? item.title,
    originalLanguage: item.original_language ?? null,
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    releaseDate: item.release_date ?? null,
    runtime: item.runtime ?? null,
    voteAverage: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    popularity: item.popularity ?? 0,
    adult: item.adult ?? false,
    genres: item.genres ?? [],
    keywords: item.keywords?.keywords?.map((keyword) => keyword.name) ?? [],
    countries: item.production_countries?.map((country) => country.iso_3166_1) ?? [],
    credits: credit,
    sourcePayload: item
  };
  return { ...movie, tasteFacts: deriveTasteFacts(movie) };
}

function fallbackBy(category: BrowseCategory, genreId?: number | null): Movie[] {
  const movies = FALLBACK_MOVIES.map((movie) => ({ ...movie, tasteFacts: deriveTasteFacts(movie) }));
  if (category === "genre" && genreId) {
    return movies
      .filter((movie) => movie.genres.some((genre) => genre.id === genreId))
      .sort((a, b) => mainstreamScore(b) - mainstreamScore(a));
  }
  if (category === "top_rated") {
    return [...movies].sort((a, b) => mainstreamScore(b) - mainstreamScore(a));
  }
  return [...movies].sort((a, b) => b.popularity - a.popularity);
}

function credibleMovies(
  movies: Movie[],
  minVoteCount = MIN_BROWSE_VOTE_COUNT,
  minPopularity = MIN_BROWSE_POPULARITY,
  minReleaseAgeDays = 0
) {
  return movies.filter(
    (movie) =>
      !movie.adult &&
      Boolean(movie.posterPath) &&
      Boolean(movie.overview) &&
      movie.voteCount >= minVoteCount &&
      movie.popularity >= minPopularity &&
      isReleasedAtLeastDaysAgo(movie.releaseDate, minReleaseAgeDays) &&
      isPrimaryAudienceMovie(movie)
  );
}

function seedableCatalogMovies(movies: Movie[]) {
  return movies.filter(
    (movie) =>
      !movie.adult &&
      Boolean(movie.posterPath) &&
      Boolean(movie.overview) &&
      movie.voteCount >= 150 &&
      movie.popularity >= 0.5 &&
      isReleasedAtLeastDaysAgo(movie.releaseDate, MIN_STABLE_RELEASE_DAYS) &&
      isPrimaryAudienceMovie(movie)
  );
}

/**
 * Relaxed catalog filter for expansion slices: keeps quality/credibility floors but
 * drops the English-only and 120-day-old constraints so international films and recent
 * releases can enter the pool. The recommender applies soft penalties for these instead
 * of excluding them outright.
 */
function expandableCatalogMovies(movies: Movie[], minVoteCount: number, minReleaseAgeDays = 0) {
  return movies.filter(
    (movie) =>
      !movie.adult &&
      Boolean(movie.posterPath) &&
      Boolean(movie.overview) &&
      movie.voteCount >= minVoteCount &&
      isReleasedAtLeastDaysAgo(movie.releaseDate, minReleaseAgeDays)
  );
}

function normalizedTitle(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isTmdbVideo(movie: Movie) {
  const payload = movie.sourcePayload as { video?: unknown } | null | undefined;
  return payload?.video === true;
}

function usableSearchResult(movie: Movie, query: string) {
  const normalizedQuery = normalizedTitle(query);
  const exactTitleMatch = normalizedTitle(movie.title) === normalizedQuery || normalizedTitle(movie.originalTitle) === normalizedQuery;

  return (
    !movie.adult &&
    !isTmdbVideo(movie) &&
    Boolean(movie.posterPath) &&
    Boolean(movie.overview) &&
    (exactTitleMatch || movie.voteCount >= 50 || movie.popularity >= 1)
  );
}

async function fetchDiscoverPages(
  page: number,
  params: Record<string, string | number | boolean | undefined>,
  pagesToFetch = 3
) {
  const pages = Array.from({ length: pagesToFetch }, (_, offset) => page + offset);
  const batches = await Promise.all(pages.map((currentPage) => tmdbFetch<TmdbListResponse>("/discover/movie", { ...params, page: currentPage })));
  return batches.flatMap((batch) => batch.results).map(mapListMovie);
}

export async function fetchBrowseMovies(category: BrowseCategory, page = 1, genreId?: number | null): Promise<Movie[]> {
  if (!tmdbConfigured()) return fallbackBy(category, genreId);

  try {
    const params = {
      language: "en-US",
      page,
      include_adult: false,
      region: "US"
    };

    if (category === "popular") {
      const movies = await fetchDiscoverPages(page, {
        ...params,
        sort_by: "popularity.desc",
        "vote_count.gte": MIN_BROWSE_VOTE_COUNT,
        "popularity.gte": MIN_BROWSE_POPULARITY,
        "primary_release_date.lte": isoDateDaysAgo(0),
        with_original_language: PRIMARY_ORIGINAL_LANGUAGE
      });
      return credibleMovies(movies, MIN_BROWSE_VOTE_COUNT, MIN_BROWSE_POPULARITY, 0);
    }

    if (category === "top_rated") {
      const movies = await fetchDiscoverPages(page, {
        ...params,
        sort_by: "vote_average.desc",
        "vote_count.gte": MIN_TOP_RATED_VOTE_COUNT,
        "popularity.gte": MIN_BROWSE_POPULARITY,
        "primary_release_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS),
        with_original_language: PRIMARY_ORIGINAL_LANGUAGE
      });
      return credibleMovies(movies, MIN_TOP_RATED_VOTE_COUNT, MIN_BROWSE_POPULARITY, MIN_STABLE_RELEASE_DAYS).sort(
        (a, b) => mainstreamScore(b) - mainstreamScore(a)
      );
    }

    const movies = await fetchDiscoverPages(page, {
      ...params,
      sort_by: "popularity.desc",
      "vote_count.gte": MIN_GENRE_VOTE_COUNT,
      "popularity.gte": MIN_BROWSE_POPULARITY,
      "primary_release_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS),
      with_original_language: PRIMARY_ORIGINAL_LANGUAGE,
      with_genres: genreId ?? undefined
    });
    return credibleMovies(movies, MIN_GENRE_VOTE_COUNT, MIN_BROWSE_POPULARITY, MIN_STABLE_RELEASE_DAYS).sort(
      (a, b) => mainstreamScore(b) - mainstreamScore(a)
    );
  } catch (error) {
    console.warn("TMDB browse failed, using fallback movies", error);
    return fallbackBy(category, genreId);
  }
}

export async function fetchMovieDetails(tmdbId: number): Promise<Movie | null> {
  const fallback = FALLBACK_MOVIES.find((movie) => movie.tmdbId === tmdbId);
  if (!tmdbConfigured()) return fallback ? { ...fallback, tasteFacts: deriveTasteFacts(fallback) } : null;

  try {
    const data = await tmdbFetch<TmdbDetailResponse>(`/movie/${tmdbId}`, {
      language: "en-US",
      append_to_response: "credits,keywords"
    });
    return mapDetailMovie(data);
  } catch (error) {
    console.warn("TMDB detail failed, using fallback if present", error);
    return fallback ? { ...fallback, tasteFacts: deriveTasteFacts(fallback) } : null;
  }
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  if (!tmdbConfigured()) {
    return FALLBACK_MOVIES.filter((movie) => movie.title.toLowerCase().includes(normalized.toLowerCase()))
      .slice(0, 8)
      .map((movie) => ({ ...movie, tasteFacts: deriveTasteFacts(movie) }));
  }

  try {
    const data = await tmdbFetch<TmdbSearchResponse>("/search/movie", {
      query: normalized,
      language: "en-US",
      include_adult: false,
      region: "US",
      page: 1
    });
    const listMovies = data.results
      .map(mapListMovie)
      .filter((movie) => !movie.adult && !isTmdbVideo(movie) && Boolean(movie.posterPath) && Boolean(movie.overview))
      .slice(0, 14);
    const detailed = await Promise.all(listMovies.map((movie) => fetchMovieDetails(movie.tmdbId)));
    return (detailed.map((movie, index) => movie ?? listMovies[index]).filter(Boolean) as Movie[])
      .filter((movie) => usableSearchResult(movie, normalized))
      .sort((a, b) => {
        const queryTitle = normalizedTitle(normalized);
        const aExact = normalizedTitle(a.title) === queryTitle || normalizedTitle(a.originalTitle) === queryTitle;
        const bExact = normalizedTitle(b.title) === queryTitle || normalizedTitle(b.originalTitle) === queryTitle;
        if (aExact !== bExact) return bExact ? 1 : -1;
        return mainstreamScore(b) - mainstreamScore(a);
      })
      .slice(0, 8);
  } catch (error) {
    console.warn("TMDB search failed", error);
    return [];
  }
}

interface TmdbReviewResult {
  content?: string;
}

interface TmdbReviewsResponse {
  results?: TmdbReviewResult[];
  total_pages?: number;
}

/** Fetch up to `maxPages` of user reviews for a movie, returning trimmed review texts. */
export async function fetchMovieReviews(tmdbId: number, maxPages = 2): Promise<string[]> {
  if (!tmdbConfigured()) return [];
  const reviews: string[] = [];
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await tmdbFetch<TmdbReviewsResponse>(`/movie/${tmdbId}/reviews`, { language: "en-US", page });
      for (const result of response.results ?? []) {
        const content = (result.content ?? "").trim();
        if (content.length >= 40) reviews.push(content.slice(0, 2400));
      }
      if (!response.total_pages || page >= response.total_pages) break;
    }
  } catch (error) {
    console.warn(`TMDB reviews failed for ${tmdbId}`, error instanceof Error ? error.message : error);
  }
  return reviews;
}

async function collectSeedSlice(
  byId: Map<number, Movie>,
  params: Record<string, string | number | boolean | undefined>,
  pagesToFetch: number,
  target: number,
  filter: (movies: Movie[]) => Movie[] = seedableCatalogMovies,
  startPage = 1
) {
  if (byId.size >= target) return;
  const movies = await fetchDiscoverPages(startPage, params, pagesToFetch);
  for (const movie of filter(movies)) {
    byId.set(movie.tmdbId, movie);
    if (byId.size >= target) return;
  }
}

/** TMDB discover pagination hard-stops at page 500. */
const MAX_DISCOVER_PAGE = 460;
const EXPANSION_PAGES_PER_SLICE = 6;

/**
 * Deeper discover pages for catalog growth once the starter pool is spent.
 * `pageOffset` advances the read window per slice so successive expansions
 * keep ingesting movies the catalog has not seen yet (upserts dedupe overlap).
 */
export async function fetchCatalogExpansion(pageOffset: number, target = 400): Promise<Movie[]> {
  if (!tmdbConfigured()) return [];

  const byId = new Map<number, Movie>();
  const baseParams = {
    language: "en-US",
    include_adult: false,
    region: "US",
    with_original_language: PRIMARY_ORIGINAL_LANGUAGE,
    "primary_release_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS)
  };

  // baseStart skips the windows the starter pool already ingested.
  const slices: Array<{ baseStart: number; params: Record<string, string | number | boolean | undefined> }> = [
    { baseStart: 26, params: { ...baseParams, sort_by: "popularity.desc", "vote_count.gte": 150 } },
    { baseStart: 26, params: { ...baseParams, sort_by: "vote_average.desc", "vote_count.gte": 300 } },
    { baseStart: 1, params: { ...baseParams, sort_by: "vote_count.desc", "vote_count.gte": 150 } }
  ];

  try {
    for (const slice of slices) {
      const startPage = slice.baseStart + Math.max(0, pageOffset) * EXPANSION_PAGES_PER_SLICE;
      if (startPage > MAX_DISCOVER_PAGE) continue;
      await collectSeedSlice(byId, slice.params, EXPANSION_PAGES_PER_SLICE, target, seedableCatalogMovies, startPage);
      if (byId.size >= target) break;
    }
  } catch (error) {
    console.warn("TMDB catalog expansion failed, returning partial batch", error);
  }

  return Array.from(byId.values()).sort((a, b) => mainstreamScore(b) - mainstreamScore(a));
}

export async function fetchStarterPool(target = MAX_STARTER_POOL_MOVIES): Promise<Movie[]> {
  if (!tmdbConfigured()) {
    return fallbackBy("popular").slice(0, target);
  }

  const byId = new Map<number, Movie>();
  const baseParams = {
    language: "en-US",
    include_adult: false,
    region: "US",
    with_original_language: PRIMARY_ORIGINAL_LANGUAGE,
    "primary_release_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS)
  };

  const slices: Array<{
    pages: number;
    params: Record<string, string | number | boolean | undefined>;
    filter?: (movies: Movie[]) => Movie[];
  }> = [
    {
      pages: 25,
      params: {
        ...baseParams,
        sort_by: "popularity.desc",
        "vote_count.gte": 150
      }
    },
    {
      pages: 25,
      params: {
        ...baseParams,
        sort_by: "vote_average.desc",
        "vote_count.gte": 450
      }
    }
  ];

  // International slices: drop the English-only constraint (voteCount >= 300 for credibility).
  const internationalBase = {
    language: "en-US",
    include_adult: false,
    "primary_release_date.lte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS)
  };
  slices.push(
    {
      pages: 12,
      params: { ...internationalBase, sort_by: "vote_average.desc", "vote_count.gte": 300 },
      filter: (movies) => expandableCatalogMovies(movies, 300)
    },
    {
      pages: 12,
      params: { ...internationalBase, sort_by: "popularity.desc", "vote_count.gte": 300 },
      filter: (movies) => expandableCatalogMovies(movies, 300)
    }
  );

  // Recent releases: last 120 days, lower vote floor so new films can enter the pool.
  slices.push({
    pages: 10,
    params: {
      language: "en-US",
      include_adult: false,
      region: "US",
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      "primary_release_date.gte": isoDateDaysAgo(MIN_STABLE_RELEASE_DAYS)
    },
    filter: (movies) => expandableCatalogMovies(movies, 100)
  });

  for (const yearStart of [2020, 2010, 2000, 1990, 1980, 1970, 1960]) {
    slices.push({
      pages: 8,
      params: {
        ...baseParams,
        sort_by: "popularity.desc",
        "vote_count.gte": 150,
        "primary_release_date.gte": `${yearStart}-01-01`,
        "primary_release_date.lte": `${yearStart + 9}-12-31`
      }
    });
  }

  for (const genre of MOVIE_GENRES.filter((genre) => genre.name !== "TV Movie")) {
    slices.push(
      {
        pages: 8,
        params: {
          ...baseParams,
          sort_by: "popularity.desc",
          "vote_count.gte": 150,
          with_genres: genre.id
        }
      },
      {
        pages: 5,
        params: {
          ...baseParams,
          sort_by: "vote_average.desc",
          "vote_count.gte": 350,
          with_genres: genre.id
        }
      }
    );
  }

  try {
    for (const slice of slices) {
      await collectSeedSlice(byId, slice.params, slice.pages, target, slice.filter);
      if (byId.size >= target) break;
    }
  } catch (error) {
    console.warn("TMDB starter pool failed, returning partial catalog", error);
  }

  if (!byId.size) {
    return fallbackBy("popular").slice(0, target);
  }

  return Array.from(byId.values())
    .sort((a, b) => mainstreamScore(b) - mainstreamScore(a))
    .slice(0, target);
}
