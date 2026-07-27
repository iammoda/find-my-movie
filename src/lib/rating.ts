import {
  MIN_POSITIVE_RATINGS,
  MIN_RECOMMENDATION_RATINGS,
  NEGATIVE_RATINGS,
  POSITIVE_RATINGS,
  RATING_WEIGHTS
} from "@/lib/constants";
import type { Rating, RatingReasonSentiment, RatingValue, Verdict } from "@/lib/types";

export function ratingWeight(rating: RatingValue): number {
  return RATING_WEIGHTS[rating];
}

export function isPositiveRating(rating: RatingValue): boolean {
  return POSITIVE_RATINGS.has(rating);
}

export function ratingSentiment(rating: RatingValue): RatingReasonSentiment | null {
  if (POSITIVE_RATINGS.has(rating)) return "positive";
  if (NEGATIVE_RATINGS.has(rating)) return "negative";
  return null;
}

export function ratingSupportsTraitPrompt(rating: RatingValue): boolean {
  return rating === "best_ever" || rating === "hate";
}

export function verdictLabel(verdict: Verdict): string {
  if (verdict === "loved") return "Loved it";
  if (verdict === "disliked") return "Not for me";
  return "It was fine";
}

/** A rating counts toward readiness when it carries real signal: any verdict, or a non-skip legacy rating. */
function countsTowardReadiness(rating: Rating): boolean {
  if (rating.verdict) return true;
  return rating.rating !== "skip";
}

function isPositiveSignal(rating: Rating): boolean {
  if (rating.verdict) return rating.verdict === "loved";
  return isPositiveRating(rating.rating);
}

export function recommendationReadiness(ratings: Rating[]) {
  const total = ratings.filter(countsTowardReadiness).length;
  const positives = ratings.filter(isPositiveSignal).length;

  return {
    ready: total >= MIN_RECOMMENDATION_RATINGS && positives >= MIN_POSITIVE_RATINGS,
    total,
    positives,
    neededRatings: Math.max(0, MIN_RECOMMENDATION_RATINGS - total),
    neededPositiveRatings: Math.max(0, MIN_POSITIVE_RATINGS - positives)
  };
}
