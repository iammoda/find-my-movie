import { MOVIE_GENRES } from "@/lib/constants";
import type { Genre } from "@/lib/types";

const GENRE_ALIASES: Record<string, number> = {
  scifi: 878,
  sciencefiction: 878,
  sf: 878,
  romcom: 10749,
  animated: 16,
  anime: 16,
  documentaries: 99,
  historical: 36,
  musical: 10402,
  scary: 27,
  funny: 35
};

function normalizeGenreInput(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolves free-typed genre input (e.g. "sci fi", "Horror", "35") to a
 * canonical TMDB genre. Returns null when nothing matches.
 */
export function resolveGenre(input: string): Genre | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const asId = Number(trimmed);
  if (Number.isInteger(asId)) {
    return MOVIE_GENRES.find((genre) => genre.id === asId) ?? null;
  }

  const normalized = normalizeGenreInput(trimmed);
  if (!normalized) return null;

  const aliasId = GENRE_ALIASES[normalized];
  if (aliasId) return MOVIE_GENRES.find((genre) => genre.id === aliasId) ?? null;

  const exact = MOVIE_GENRES.find((genre) => normalizeGenreInput(genre.name) === normalized);
  if (exact) return exact;

  const prefixMatches = MOVIE_GENRES.filter((genre) => normalizeGenreInput(genre.name).startsWith(normalized));
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

export function genreSuggestions(): string[] {
  return MOVIE_GENRES.map((genre) => genre.name);
}
