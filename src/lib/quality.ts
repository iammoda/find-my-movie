import type { Movie } from "@/lib/types";

const GLOBAL_AVERAGE = 6.5;
const VOTE_CONFIDENCE = 800;

export function weightedTmdbScore(movie: Pick<Movie, "voteAverage" | "voteCount">): number {
  const votes = Math.max(0, movie.voteCount);
  const average = Number.isFinite(movie.voteAverage) ? movie.voteAverage : GLOBAL_AVERAGE;
  return (votes / (votes + VOTE_CONFIDENCE)) * average + (VOTE_CONFIDENCE / (votes + VOTE_CONFIDENCE)) * GLOBAL_AVERAGE;
}

export function qualityScore(movie: Pick<Movie, "voteAverage" | "voteCount">): number {
  return (weightedTmdbScore(movie) - 5) / 5;
}

export function baselineScore(movie: Pick<Movie, "voteAverage" | "voteCount" | "popularity">): number {
  const quality = qualityScore(movie);
  const popularity = Math.log10(Math.max(1, movie.popularity)) / 3;
  return quality * 0.75 + popularity * 0.25;
}

export function mainstreamScore(movie: Pick<Movie, "voteAverage" | "voteCount" | "popularity">): number {
  const weightedQuality = weightedTmdbScore(movie) / 10;
  const voteConfidence = Math.min(1, Math.log10(Math.max(1, movie.voteCount)) / 4);
  const popularity = Math.min(1, Math.log10(Math.max(1, movie.popularity)) / 3);
  return weightedQuality * 0.52 + voteConfidence * 0.26 + popularity * 0.22;
}

export function releaseDecade(releaseDate?: string | null): string {
  if (!releaseDate) return "unknown";
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year)) return "unknown";
  return `${Math.floor(year / 10) * 10}s`;
}

export function isoDateDaysAgo(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function isReleasedAtLeastDaysAgo(releaseDate: string | null | undefined, days: number, from = new Date()): boolean {
  if (!releaseDate) return false;
  return releaseDate <= isoDateDaysAgo(days, from);
}
