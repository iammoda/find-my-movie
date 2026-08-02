import type { Movie } from "@/lib/types";

/**
 * Engine quality metrics for the temporal backtest. Every recommendation
 * change must move these numbers (scripts/backtest-engine.ts) - "feels
 * better" is not a merge criterion.
 */

/** AUC of scores for positive vs negative labels (rank statistic). */
export function rankingAuc(positives: number[], negatives: number[]): number | null {
  if (!positives.length || !negatives.length) return null;
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      wins += positive > negative ? 1 : positive === negative ? 0.5 : 0;
    }
  }
  return wins / (positives.length * negatives.length);
}

/** Fraction of the top-k scored items that are positives. */
export function precisionAtK(scored: Array<{ score: number; positive: boolean }>, k: number): number | null {
  if (!scored.length) return null;
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, k);
  if (!top.length) return null;
  return top.filter((item) => item.positive).length / top.length;
}

/** Largest share of any single genre in a slate (flood metric; 1 = monoculture). */
export function genreConcentration(slate: Movie[]): number {
  if (!slate.length) return 0;
  const counts = new Map<string, number>();
  for (const movie of slate) {
    for (const genre of movie.genres) {
      counts.set(genre.name, (counts.get(genre.name) ?? 0) + 1);
    }
  }
  let max = 0;
  for (const count of counts.values()) max = Math.max(max, count);
  return max / slate.length;
}

/** Mean of a probability list (staleness metric when fed P(seen) of a slate). */
export function meanProbability(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
