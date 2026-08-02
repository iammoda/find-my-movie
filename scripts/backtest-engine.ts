import "./loadEnv";
import { createClient } from "@supabase/supabase-js";
import { genreConcentration, meanProbability, precisionAtK, rankingAuc } from "../src/lib/engineMetrics";
import { assembleSlate, scoreCandidateWithModel, lovedContextsFor } from "../src/lib/recommendations";
import { buildSeenProbability } from "../src/lib/seenModel";
import { getStore } from "../src/lib/store";
import { buildTasteModes, type ModeSample } from "../src/lib/tasteClusters";
import { buildTasteSamples, discoveryWeights, fitTasteModel, predictTasteScore, predictedRankScore } from "../src/lib/tasteModel";
import type { Movie, Rating } from "../src/lib/types";

/**
 * Temporal backtest of the recommendation engine on the real account:
 * train on the chronologically-first 80% of ratings, evaluate on the rest.
 *
 *   Taste AUC      - are later-loved titles ranked above later-disliked?
 *   Precision@10   - loved share of the top-10 held-out predictions
 *   Genre flood    - largest single-genre share of a generated slate
 *   Staleness      - mean P(seen) of the slate (lower = more genuinely new)
 *
 * Usage: npx tsx scripts/backtest-engine.ts [--media tv]
 */

const mediaType = process.argv.includes("--media") && process.argv[process.argv.indexOf("--media") + 1] === "tv" ? "tv" : "movie";
const TRAIN_SHARE = 0.8;
const SLATE_SIZE = 10;
const CANDIDATE_POOL = 500;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
});
const { data: profileRows } = await db.from("ratings").select("profile_id");
const counts = new Map<string, number>();
for (const row of profileRows ?? []) counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
const profileId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
if (!profileId) {
  console.error("No ratings found.");
  process.exit(1);
}

const store = getStore();
const [allRatings, exposures, appealSignals, watchlist, movies] = await Promise.all([
  store.listRatings(profileId),
  store.listExposures(profileId),
  store.listAppealSignals(profileId),
  store.listWatchlist(profileId),
  store.listMovies()
]);
const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));

const chronological = [...allRatings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const cutoffIndex = Math.floor(chronological.length * TRAIN_SHARE);
const train = chronological.slice(0, cutoffIndex);
const test = chronological.slice(cutoffIndex);
const cutoffAt = train[train.length - 1]?.createdAt ?? "";
const trainExposures = exposures.filter((exposure) => exposure.createdAt <= cutoffAt);

console.log(`profile ${profileId.slice(0, 8)} | ${chronological.length} ratings -> train ${train.length} / test ${test.length} | media=${mediaType}`);

// Embeddings for everything we score.
const neededIds = new Set<number>([...allRatings.map((r) => r.tmdbId), ...movies.map((m) => m.tmdbId)]);
const embeddings = new Map<number, number[]>();
const idList = [...neededIds];
for (let index = 0; index < idList.length; index += 800) {
  const chunk = await store.listMovieEmbeddings(idList.slice(index, index + 800));
  for (const row of chunk) if (row.embedding.length) embeddings.set(row.tmdbId, row.embedding);
}

// Fit on train only.
const model = fitTasteModel(buildTasteSamples(movies, train, trainExposures, [], embeddings, []));
if (!model) {
  console.error("Model would not fit on the training window.");
  process.exit(1);
}
console.log(`model: ${model.ratingSampleCount} rating samples, lambda=${model.lambda}, loo-rmse=${(Math.sqrt(model.gcv) * 5).toFixed(2)}pts`);

// --- Taste AUC + Precision@10 on held-out ratings ---
const heldOut = test.flatMap((rating) => {
  const movie = byId.get(rating.tmdbId);
  const embedding = embeddings.get(rating.tmdbId);
  if (!movie || !embedding) return [];
  const score = predictedRankScore(predictTasteScore(model, embedding, movie));
  return [{ rating, score }];
});
const lovedScores = heldOut.filter(({ rating }) => rating.verdict === "loved").map(({ score }) => score);
const dislikedScores = heldOut.filter(({ rating }) => rating.verdict === "disliked").map(({ score }) => score);
const auc = rankingAuc(lovedScores, dislikedScores);
const precision = precisionAtK(
  heldOut.map(({ rating, score }) => ({ score, positive: rating.verdict === "loved" })),
  10
);

// --- Slate metrics: what would the engine have recommended at the cutoff? ---
const trainRatedIds = new Set(train.map((rating) => rating.tmdbId));
const candidates = movies.filter(
  (movie) =>
    (movie.mediaType ?? "movie") === mediaType &&
    !movie.adult &&
    Boolean(movie.posterPath) &&
    Boolean(movie.overview) &&
    movie.voteCount >= (mediaType === "tv" ? 75 : 300) &&
    !trainRatedIds.has(movie.tmdbId)
);

// Taste modes from train-window loves (discovery-weighted), as the engine does.
const modeWeights = discoveryWeights(train, byId);
const lovedForModes: ModeSample[] = train
  .filter((rating) => rating.verdict === "loved")
  .flatMap((rating) => {
    const movie = byId.get(rating.tmdbId);
    const embedding = embeddings.get(rating.tmdbId);
    if (!movie || !embedding) return [];
    return [{ movie, rankScore: rating.rankScore ?? 6.7, embedding, weight: modeWeights.get(rating.tmdbId) ?? 1 }];
  });
const modes = buildTasteModes(lovedForModes);
console.log(`modes: ${modes.map((mode) => `${mode.label} (${(mode.share * 100).toFixed(0)}%)`).join(" | ")}`);

// Retrieval: taste direction + mode centroids.
const queries: number[][] = [];
if (model.embeddingDirection) queries.push(model.embeddingDirection);
for (const mode of modes.slice(0, 5)) queries.push(mode.centroid);
const matched = new Set<number>();
for (const [index, query] of queries.entries()) {
  const matches = await store.matchMovieEmbeddings(query, index === 0 ? 350 : 150, [...trainRatedIds], mediaType);
  for (const match of matches) matched.add(match.tmdbId);
}
const pool = (matched.size ? candidates.filter((movie) => matched.has(movie.tmdbId)) : candidates).slice(0, CANDIDATE_POOL);

const exposedIds = new Set(trainExposures.filter((exposure) => exposure.source !== "not_seen").map((exposure) => exposure.tmdbId));
const lovedContexts = lovedContextsFor(movies, train, embeddings);
const seenProbability = buildSeenProbability(train, trainExposures, appealSignals, byId);
const scored = pool.map((movie) =>
  scoreCandidateWithModel(movie, model, embeddings.get(movie.tmdbId), exposedIds, lovedContexts, null, seenProbability(movie))
);
const candidateEmbeddings = new Map(pool.flatMap((movie) => {
  const embedding = embeddings.get(movie.tmdbId);
  return embedding ? [[movie.tmdbId, embedding] as const] : [];
}));
const slate = assembleSlate(scored, SLATE_SIZE, {
  modes,
  candidateEmbeddings,
  lovedEmbeddings: lovedForModes.map((sample) => sample.embedding)
}).map((candidate) => candidate.movie);

const flood = genreConcentration(slate);
const staleness = meanProbability(slate.map((movie) => seenProbability(movie)));

console.log("\n=== metrics ===");
console.log(`taste AUC (loved vs disliked, n=${lovedScores.length}/${dislikedScores.length}): ${auc?.toFixed(3) ?? "n/a"}`);
console.log(`precision@10 (held-out): ${precision?.toFixed(2) ?? "n/a"}`);
console.log(`slate genre flood (max single-genre share): ${flood.toFixed(2)}`);
console.log(`slate staleness (mean P(seen)): ${staleness?.toFixed(3) ?? "n/a"}`);
console.log(`slate: ${slate.map((movie) => movie.title).join(" | ")}`);
console.log(
  `slate genres: ${JSON.stringify(
    slate
      .flatMap((movie) => movie.genres.map((genre) => genre.name))
      .reduce((acc: Record<string, number>, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {})
  )}`
);

// Watchlist is unused directly but kept for parity with production signals.
void watchlist;
