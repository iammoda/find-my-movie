import { genresForMedia } from "@/lib/constants";
import type { Genre, MediaType } from "@/lib/types";

const GENRE_ALIASES: Record<string, string> = {
  scifi: "sci-fi",
  sciencefiction: "sci-fi",
  sf: "sci-fi",
  romcom: "romance",
  animated: "animation",
  anime: "animation",
  documentaries: "documentary",
  historical: "history",
  musical: "music",
  scary: "horror",
  funny: "comedy",
  action: "action",
  adventure: "adventure"
};

function normalizeGenreInput(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolves free-typed genre input (e.g. "sci fi", "Horror", "35") to a
 * canonical TMDB genre for the given media type. Returns null when nothing
 * matches. TV uses TMDB's combined genres ("Sci-Fi & Fantasy"), so alias and
 * prefix matching resolve against normalized names.
 */
export function resolveGenre(input: string, mediaType: MediaType = "movie"): Genre | null {
  const genres = genresForMedia(mediaType);
  const trimmed = input.trim();
  if (!trimmed) return null;

  const asId = Number(trimmed);
  if (Number.isInteger(asId)) {
    return genres.find((genre) => genre.id === asId) ?? null;
  }

  const normalized = normalizeGenreInput(trimmed);
  if (!normalized) return null;

  const resolveByName = (name: string) => {
    const target = normalizeGenreInput(name);
    const exact = genres.find((genre) => normalizeGenreInput(genre.name) === target);
    if (exact) return exact;
    const prefixMatches = genres.filter((genre) => normalizeGenreInput(genre.name).startsWith(target));
    return prefixMatches.length === 1 ? prefixMatches[0] : null;
  };

  const direct = resolveByName(trimmed);
  if (direct) return direct;

  const alias = GENRE_ALIASES[normalized];
  if (alias) return resolveByName(alias);

  return null;
}

export function genreSuggestions(mediaType: MediaType = "movie"): string[] {
  return genresForMedia(mediaType).map((genre) => genre.name);
}
