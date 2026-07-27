import "./loadEnv";
import { MIN_CANDIDATE_VOTE_COUNT } from "../src/lib/constants";
import { ratingWeight } from "../src/lib/rating";
import {
  buildTasteAnchors,
  buildTasteProfile,
  lovedContextsFor,
  scoreCandidateWithModel,
  scoreMovieCandidate,
  semanticContextForMovie
} from "../src/lib/recommendations";
import { getStore } from "../src/lib/store";
import { buildTasteSamples, fitTasteModel } from "../src/lib/tasteModel";
import type { AppealSignal, Movie, MovieEmbedding, MovieExposure, Rating, RatingReason, RatingTraitReason } from "../src/lib/types";

const MAX_CASES = 40;

function usable(movie: Movie) {
  // Matches recommendations.candidateUsable (hard gate only; quality is soft-scored).
  return !movie.adult && Boolean(movie.posterPath) && Boolean(movie.overview) && movie.voteCount >= MIN_CANDIDATE_VOTE_COUNT;
}

interface EvalContext {
  movies: Movie[];
  ratings: Rating[];
  embeddings: Map<number, MovieEmbedding>;
  exposures: MovieExposure[];
  appealSignals: AppealSignal[];
  ratingReasons: RatingReason[];
  ratingTraitReasons: RatingTraitReason[];
}

function candidatesFor(context: EvalContext, heldOut: Rating, trainRatedIds: Set<number>) {
  return context.movies.filter((movie) => usable(movie) && (!trainRatedIds.has(movie.tmdbId) || movie.tmdbId === heldOut.tmdbId));
}

function rankHeldOutLegacy(context: EvalContext, heldOut: Rating): number {
  const trainRatings = context.ratings.filter((rating) => rating.tmdbId !== heldOut.tmdbId);
  const trainRatedIds = new Set(trainRatings.map((rating) => rating.tmdbId));
  const profile = buildTasteProfile(
    context.movies,
    trainRatings,
    context.exposures,
    context.ratingReasons.filter((reason) => reason.tmdbId !== heldOut.tmdbId),
    context.ratingTraitReasons.filter((reason) => reason.tmdbId !== heldOut.tmdbId)
  );
  const trainEmbeddings = [...context.embeddings.values()].filter((embedding) => embedding.tmdbId !== heldOut.tmdbId);
  const anchors = buildTasteAnchors(context.movies, trainRatings, trainEmbeddings, context.exposures);
  const candidates = candidatesFor(context, heldOut, trainRatedIds);

  const scored = candidates
    .map((movie) => {
      const embedding = context.embeddings.get(movie.tmdbId);
      const semantic = semanticContextForMovie(movie, embedding?.embedding, anchors.positiveAnchors, anchors.negativeAnchor, anchors.ratedContexts);
      return scoreMovieCandidate(movie, profile, new Set(), {
        embeddingSimilarity: semantic.positiveAnchorScore,
        semantic
      });
    })
    .sort((a, b) => b.score - a.score);

  return scored.findIndex((candidate) => candidate.movie.tmdbId === heldOut.tmdbId) + 1;
}

function rankHeldOutLearned(context: EvalContext, heldOut: Rating): number {
  const trainRatings = context.ratings.filter((rating) => rating.tmdbId !== heldOut.tmdbId);
  const trainRatedIds = new Set(trainRatings.map((rating) => rating.tmdbId));
  const embeddingsById = new Map<number, number[]>();
  for (const [tmdbId, embedding] of context.embeddings) {
    if (tmdbId !== heldOut.tmdbId) embeddingsById.set(tmdbId, embedding.embedding);
  }

  const samples = buildTasteSamples(
    context.movies,
    trainRatings,
    context.exposures,
    context.appealSignals.filter((signal) => signal.tmdbId !== heldOut.tmdbId),
    embeddingsById
  );
  const model = fitTasteModel(samples);
  if (!model) return 0;

  const lovedContexts = lovedContextsFor(context.movies, trainRatings, embeddingsById);
  const candidates = candidatesFor(context, heldOut, trainRatedIds);

  const scored = candidates
    .map((movie) => scoreCandidateWithModel(movie, model, context.embeddings.get(movie.tmdbId)?.embedding, new Set(), lovedContexts))
    .sort((a, b) => b.score - a.score);

  return scored.findIndex((candidate) => candidate.movie.tmdbId === heldOut.tmdbId) + 1;
}

function summarize(positiveRanks: number[], negativeRanks: number[]) {
  const top10 = positiveRanks.filter((rank) => rank <= 10).length / Math.max(1, positiveRanks.length);
  const top25 = positiveRanks.filter((rank) => rank <= 25).length / Math.max(1, positiveRanks.length);
  const averagePositiveRank = positiveRanks.reduce((sum, rank) => sum + rank, 0) / Math.max(1, positiveRanks.length);
  const medianPositiveRank = [...positiveRanks].sort((a, b) => a - b)[Math.floor(positiveRanks.length / 2)] ?? 0;
  const dislikedSuppression = negativeRanks.filter((rank) => rank > 25).length / Math.max(1, negativeRanks.length);
  return {
    positiveCases: positiveRanks.length,
    negativeCases: negativeRanks.length,
    likedTop10HitRate: Number(top10.toFixed(3)),
    likedTop25HitRate: Number(top25.toFixed(3)),
    averageLikedRank: Number(averagePositiveRank.toFixed(1)),
    medianLikedRank: medianPositiveRank,
    dislikedSuppressionRate: Number(dislikedSuppression.toFixed(3))
  };
}

const store = getStore();
const [movies, ratings, exposures, appealSignals, ratingReasons, ratingTraitReasons, movieEmbeddings] = await Promise.all([
  store.listMovies(),
  store.listRatings(),
  store.listExposures(),
  store.listAppealSignals(),
  store.listRatingReasons(),
  store.listRatingTraitReasons(),
  store.listMovieEmbeddings()
]);
const embeddings = new Map(movieEmbeddings.map((embedding) => [embedding.tmdbId, embedding]));
const context: EvalContext = { movies, ratings, embeddings, exposures, appealSignals, ratingReasons, ratingTraitReasons };

const heldOutPositives = ratings
  .filter((rating) => (rating.rankScore != null ? rating.rankScore >= 6.7 : ratingWeight(rating.rating) > 0) && embeddings.has(rating.tmdbId))
  .slice(0, MAX_CASES);
const heldOutNegatives = ratings
  .filter((rating) => (rating.rankScore != null ? rating.rankScore < 3.3 : ratingWeight(rating.rating) < 0) && embeddings.has(rating.tmdbId))
  .slice(0, MAX_CASES);

console.log(`Evaluating ${heldOutPositives.length} positive and ${heldOutNegatives.length} negative held-out cases...`);

const engines = [
  { name: "legacy semantic-taxonomy-v2", rank: rankHeldOutLegacy },
  { name: "learned-rank-v1", rank: rankHeldOutLearned }
] as const;

for (const engine of engines) {
  const startedAt = Date.now();
  const positiveRanks = heldOutPositives.map((rating) => engine.rank(context, rating)).filter(Boolean);
  const negativeRanks = heldOutNegatives.map((rating) => engine.rank(context, rating)).filter(Boolean);
  console.log(`\n=== ${engine.name} (${((Date.now() - startedAt) / 1000).toFixed(1)}s) ===`);
  console.log(JSON.stringify(summarize(positiveRanks, negativeRanks), null, 2));
}
