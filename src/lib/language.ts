import { PRIMARY_ORIGINAL_LANGUAGE } from "@/lib/constants";
import type { Movie } from "@/lib/types";

export function movieOriginalLanguage(movie: Movie): string {
  if (movie.originalLanguage) return movie.originalLanguage;
  const payload = movie.sourcePayload;
  if (payload && typeof payload === "object" && "original_language" in payload) {
    const value = (payload as { original_language?: unknown }).original_language;
    if (typeof value === "string" && value) return value;
  }
  return PRIMARY_ORIGINAL_LANGUAGE;
}

export function isPrimaryAudienceMovie(movie: Movie): boolean {
  return movieOriginalLanguage(movie) === PRIMARY_ORIGINAL_LANGUAGE;
}
