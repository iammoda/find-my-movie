import type { MediaType } from "@/lib/types";

/**
 * Canonical catalog ids.
 *
 * TMDB movie ids and TV ids are separate namespaces that can collide, but the
 * whole app (ratings, embeddings, exposures, watchlist, comparisons, caches)
 * keys on a single integer. The catalog therefore uses a canonical id:
 *
 *   movie -> tmdb movie id (unchanged; all pre-TV data is already canonical)
 *   tv    -> 1_000_000_000 + tmdb tv id
 *
 * The allocation rule is deterministic so upserts stay idempotent, and the
 * movies table stores media_type + source_id explicitly so the rule is data,
 * not just arithmetic. Only the TMDB client boundary translates ids; the rest
 * of the app treats canonical ids as opaque.
 */
export const TV_ID_OFFSET = 1_000_000_000;

export function canonicalId(mediaType: MediaType, sourceId: number): number {
  return mediaType === "tv" ? TV_ID_OFFSET + sourceId : sourceId;
}

/** The real TMDB id for API calls. */
export function sourceIdOf(canonical: number): number {
  return canonical >= TV_ID_OFFSET ? canonical - TV_ID_OFFSET : canonical;
}

export function mediaTypeOfId(canonical: number): MediaType {
  return canonical >= TV_ID_OFFSET ? "tv" : "movie";
}
