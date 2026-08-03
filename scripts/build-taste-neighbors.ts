import "./loadEnv";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { precisionAtK, rankingAuc } from "../src/lib/engineMetrics";
import { getStore } from "../src/lib/store";
import { buildTasteSamples, fitTasteModel, predictTasteScore, predictedRankScore } from "../src/lib/tasteModel";
import type { Rating } from "../src/lib/types";

/**
 * Collaborative filtering over the MovieLens 32M dataset ("taste neighbors").
 *
 * Content analysis predicts this user's dislikes well but cannot separate
 * "solid" from "loved" (movie-identical pairs get opposite verdicts). The one
 * untapped signal is people who rate like them. This script:
 *
 *   1. Streams ratings.csv (pass 1) to find the K nearest neighbor users by
 *      centered-cosine similarity over the co-rated movies (with overlap
 *      shrinkage, so 3-movie coincidences don't beat 80-movie soulmates).
 *   2. Streams again (pass 2) to score every MovieLens movie from those
 *      neighbors' mean-centered ratings.
 *
 * Modes:
 *   backtest (default) - chronological 80/20 split of the user's own ratings;
 *     head-to-head vs the production content model AND vs an item-mean
 *     baseline on the same held-out titles. If CF does not beat both, say so.
 *   score - full-profile scoring; --write upserts into taste_neighbor_scores.
 *
 * Usage:
 *   npx tsx scripts/build-taste-neighbors.ts [--mode backtest|score] [--write] [--profile <id>]
 */

const DATA_DIR = path.join(process.cwd(), ".data", "movielens", "ml-32m");
const K_NEIGHBORS = 512;
const MIN_OVERLAP = 8;
const OVERLAP_SHRINK = 25;
const SUPPORT_SHRINK = 4; // pseudo-weight pulling thin predictions toward the user's mean
const MIN_SUPPORT = 3; // neighbors who rated a movie, below which we refuse to predict
const TRAIN_SHARE = 0.8;

const args = process.argv.slice(2);
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "backtest";
const write = args.includes("--write");
const profileArg = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : null;

if (!existsSync(path.join(DATA_DIR, "ratings.csv"))) {
  console.error(`MovieLens data not found at ${DATA_DIR}. Download ml-32m.zip from https://files.grouplens.org/datasets/movielens/ and unzip it there.`);
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
});

// ---------- Load id mapping (MovieLens movieId <-> TMDB id) ----------

async function loadLinks(): Promise<{ mlToTmdb: Map<number, number>; tmdbToMl: Map<number, number> }> {
  const mlToTmdb = new Map<number, number>();
  const tmdbToMl = new Map<number, number>();
  const rl = readline.createInterface({ input: createReadStream(path.join(DATA_DIR, "links.csv")), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const [ml, , tmdb] = line.split(",");
    const mlId = Number(ml);
    const tmdbId = Number(tmdb);
    if (!Number.isFinite(mlId) || !Number.isFinite(tmdbId) || !tmdb) continue;
    mlToTmdb.set(mlId, tmdbId);
    // First mapping wins on duplicates; ML occasionally maps two entries to one TMDB id.
    if (!tmdbToMl.has(tmdbId)) tmdbToMl.set(tmdbId, mlId);
  }
  return { mlToTmdb, tmdbToMl };
}

// ---------- The user's profile ----------

async function loadProfileRatings(): Promise<{ profileId: string; ratings: Rating[] }> {
  let profileId = profileArg;
  if (!profileId) {
    const { data } = await db.from("ratings").select("profile_id");
    const counts = new Map<string, number>();
    for (const row of data ?? []) counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
    profileId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  if (!profileId) {
    console.error("No ratings found.");
    process.exit(1);
  }
  const store = getStore();
  const ratings = (await store.listRatings(profileId)).filter(
    (rating) => (rating.mediaType ?? "movie") === "movie" && rating.rankScore != null
  );
  return { profileId, ratings };
}

/** rank score 0-10 -> MovieLens 0.5-5 stars. */
function toMlScale(rankScore: number): number {
  return Math.min(5, Math.max(0.5, rankScore / 2));
}

// ---------- Pass 1: neighbor similarities ----------

interface NeighborResult {
  userIds: Int32Array;
  weights: Float64Array;
  userMeans: Float64Array; // indexed by raw MovieLens userId
}

async function findNeighbors(profile: Map<number, number>): Promise<NeighborResult> {
  // Per-user accumulators, indexed by raw userId (ml-32m max userId ~200948).
  const MAX_USER = 200_950;
  const totalSum = new Float64Array(MAX_USER);
  const totalCount = new Int32Array(MAX_USER);
  const coCount = new Int32Array(MAX_USER);
  const sumU = new Float64Array(MAX_USER); // Σ user's rating on co-items
  const sumUU = new Float64Array(MAX_USER); // Σ user's rating² on co-items
  const dotUX = new Float64Array(MAX_USER); // Σ user's rating × our rating
  const sumX = new Float64Array(MAX_USER); // Σ our rating on co-items
  const sumXX = new Float64Array(MAX_USER); // Σ our rating² on co-items

  const rl = readline.createInterface({ input: createReadStream(path.join(DATA_DIR, "ratings.csv")), crlfDelay: Infinity });
  let first = true;
  let rows = 0;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const c1 = line.indexOf(",");
    const c2 = line.indexOf(",", c1 + 1);
    const c3 = line.indexOf(",", c2 + 1);
    const userId = Number(line.slice(0, c1));
    const movieId = Number(line.slice(c1 + 1, c2));
    const rating = Number(line.slice(c2 + 1, c3));
    rows += 1;
    totalSum[userId] += rating;
    totalCount[userId] += 1;
    const ours = profile.get(movieId);
    if (ours !== undefined) {
      coCount[userId] += 1;
      sumU[userId] += rating;
      sumUU[userId] += rating * rating;
      dotUX[userId] += rating * ours;
      sumX[userId] += ours;
      sumXX[userId] += ours * ours;
    }
  }

  // Centered cosine with per-user global means, plus overlap shrinkage.
  const candidates: Array<{ userId: number; weight: number; overlap: number }> = [];
  for (let userId = 1; userId < MAX_USER; userId += 1) {
    const n = coCount[userId];
    if (n < MIN_OVERLAP) continue;
    const meanU = totalSum[userId] / totalCount[userId];
    // Our mean over the FULL profile keeps centering consistent across users.
    const meanX = profileMean;
    const dot = dotUX[userId] - meanU * sumX[userId] - meanX * sumU[userId] + n * meanU * meanX;
    const normU = Math.sqrt(Math.max(1e-9, sumUU[userId] - 2 * meanU * sumU[userId] + n * meanU * meanU));
    const normX = Math.sqrt(Math.max(1e-9, sumXX[userId] - 2 * meanX * sumX[userId] + n * meanX * meanX));
    const cosine = dot / (normU * normX);
    if (!Number.isFinite(cosine) || cosine <= 0) continue;
    const weight = cosine * (n / (n + OVERLAP_SHRINK));
    candidates.push({ userId, weight, overlap: n });
  }
  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates.slice(0, K_NEIGHBORS);

  const userMeans = new Float64Array(MAX_USER);
  for (const { userId } of top) userMeans[userId] = totalSum[userId] / totalCount[userId];

  console.log(
    `pass 1: ${rows.toLocaleString()} ratings scanned | ${candidates.length.toLocaleString()} users above min overlap | top-${top.length} neighbors: ` +
      `best sim ${top[0]?.weight.toFixed(3) ?? "n/a"}, median overlap ${top[Math.floor(top.length / 2)]?.overlap ?? "n/a"}`
  );
  return {
    userIds: Int32Array.from(top.map((t) => t.userId)),
    weights: Float64Array.from(top.map((t) => t.weight)),
    userMeans
  };
}

// ---------- Pass 2: score movies from the neighbors ----------

interface MovieScores {
  /** mlMovieId -> { pred (0-10), support } */
  predictions: Map<number, { pred: number; support: number }>;
  /** mlMovieId -> global mean rating (item-mean baseline, 0-10). */
  itemMeans: Map<number, { mean: number; count: number }>;
}

async function scoreFromNeighbors(neighbors: NeighborResult, wantedMovies: Set<number> | null): Promise<MovieScores> {
  const MAX_MOVIE = 292_760;
  const weightByUser = new Float64Array(200_950);
  for (let index = 0; index < neighbors.userIds.length; index += 1) {
    weightByUser[neighbors.userIds[index]] = neighbors.weights[index];
  }
  const weightedSum = new Float64Array(MAX_MOVIE);
  const weightTotal = new Float64Array(MAX_MOVIE);
  const supportCount = new Int32Array(MAX_MOVIE);
  const globalSum = new Float64Array(MAX_MOVIE);
  const globalCount = new Int32Array(MAX_MOVIE);

  const rl = readline.createInterface({ input: createReadStream(path.join(DATA_DIR, "ratings.csv")), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const c1 = line.indexOf(",");
    const c2 = line.indexOf(",", c1 + 1);
    const c3 = line.indexOf(",", c2 + 1);
    const userId = Number(line.slice(0, c1));
    const movieId = Number(line.slice(c1 + 1, c2));
    const rating = Number(line.slice(c2 + 1, c3));
    globalSum[movieId] += rating;
    globalCount[movieId] += 1;
    const weight = weightByUser[userId];
    if (weight > 0) {
      weightedSum[movieId] += weight * (rating - neighbors.userMeans[userId]);
      weightTotal[movieId] += weight;
      supportCount[movieId] += 1;
    }
  }

  const predictions = new Map<number, { pred: number; support: number }>();
  const itemMeans = new Map<number, { mean: number; count: number }>();
  for (let movieId = 1; movieId < MAX_MOVIE; movieId += 1) {
    if (wantedMovies && !wantedMovies.has(movieId)) continue;
    if (globalCount[movieId] > 0) {
      itemMeans.set(movieId, { mean: (globalSum[movieId] / globalCount[movieId]) * 2, count: globalCount[movieId] });
    }
    if (supportCount[movieId] >= MIN_SUPPORT) {
      // Shrunk deviation from the user's own mean, mapped back to 0-10.
      const deviation = weightedSum[movieId] / (weightTotal[movieId] + SUPPORT_SHRINK * (neighbors.weights[0] ?? 1));
      const predMl = Math.min(5, Math.max(0.5, profileMean + deviation));
      predictions.set(movieId, { pred: predMl * 2, support: supportCount[movieId] });
    }
  }
  return { predictions, itemMeans };
}

// ---------- Main ----------

const { mlToTmdb, tmdbToMl } = await loadLinks();
const { profileId, ratings } = await loadProfileRatings();

const chronological = [...ratings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const train = mode === "backtest" ? chronological.slice(0, Math.floor(chronological.length * TRAIN_SHARE)) : chronological;
const test = mode === "backtest" ? chronological.slice(Math.floor(chronological.length * TRAIN_SHARE)) : [];

// The CF profile: MovieLens movieId -> our rating on ML scale.
const profile = new Map<number, number>();
for (const rating of train) {
  const mlId = tmdbToMl.get(rating.tmdbId);
  if (mlId !== undefined && rating.rankScore != null) profile.set(mlId, toMlScale(rating.rankScore));
}
let profileMean = 0;
for (const value of profile.values()) profileMean += value;
profileMean /= Math.max(1, profile.size);

console.log(
  `profile ${profileId.slice(0, 8)} | ${ratings.length} movie ratings | train ${train.length} -> ${profile.size} mapped to MovieLens (${(
    (profile.size / Math.max(1, train.length)) * 100
  ).toFixed(0)}% coverage) | mean ${ (profileMean * 2).toFixed(2)}/10`
);

const neighbors = await findNeighbors(profile);
if (!neighbors.userIds.length) {
  console.error("No taste neighbors found above the overlap threshold; CF is not viable for this profile.");
  process.exit(1);
}

if (mode === "backtest") {
  const testMl = test.flatMap((rating) => {
    const mlId = tmdbToMl.get(rating.tmdbId);
    return mlId !== undefined && rating.rankScore != null ? [{ rating, mlId }] : [];
  });
  const wanted = new Set(testMl.map((t) => t.mlId));
  const { predictions, itemMeans } = await scoreFromNeighbors(neighbors, wanted);

  // Content model on the SAME split (production code path).
  const store = getStore();
  const [movies, exposures] = await Promise.all([store.listMovies(), store.listExposures(profileId)]);
  const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));
  const cutoffAt = train[train.length - 1]?.createdAt ?? "";
  const embeddings = new Map<number, number[]>();
  const neededIds = ratings.map((rating) => rating.tmdbId);
  for (let index = 0; index < neededIds.length; index += 800) {
    for (const row of await store.listMovieEmbeddings(neededIds.slice(index, index + 800))) {
      if (row.embedding.length) embeddings.set(row.tmdbId, row.embedding);
    }
  }
  const model = fitTasteModel(
    buildTasteSamples(movies, train, exposures.filter((exposure) => exposure.createdAt <= cutoffAt), [], embeddings, [])
  );

  // Head-to-head on the intersection each model can actually predict.
  interface Row {
    title: string;
    actual: number;
    verdict: string | null;
    cf: number | null;
    cfSupport: number;
    content: number | null;
    itemMean: number | null;
  }
  const rows: Row[] = testMl.map(({ rating, mlId }) => {
    const movie = byId.get(rating.tmdbId);
    const embedding = embeddings.get(rating.tmdbId);
    const cf = predictions.get(mlId);
    return {
      title: movie?.title ?? String(rating.tmdbId),
      actual: rating.rankScore!,
      verdict: rating.verdict ?? null,
      cf: cf?.pred ?? null,
      cfSupport: cf?.support ?? 0,
      content: movie && embedding && model ? predictedRankScore(predictTasteScore(model, embedding, movie)) : null,
      itemMean: itemMeans.get(mlId)?.mean ?? null
    };
  });

  const both = rows.filter((row) => row.cf != null && row.content != null && row.itemMean != null);
  const mae = (pick: (row: Row) => number | null) => {
    const errors = both.map((row) => Math.abs((pick(row) ?? 0) - row.actual));
    return errors.reduce((sum, error) => sum + error, 0) / Math.max(1, errors.length);
  };
  const auc = (pick: (row: Row) => number | null) =>
    rankingAuc(
      both.filter((row) => row.verdict === "loved").map((row) => pick(row) ?? 0),
      both.filter((row) => row.verdict === "disliked").map((row) => pick(row) ?? 0)
    );
  const precision = (pick: (row: Row) => number | null) =>
    precisionAtK(both.map((row) => ({ score: pick(row) ?? 0, positive: row.verdict === "loved" })), 10);

  console.log(`\n=== backtest: ${test.length} held-out ratings, ${both.length} predictable by all three models ===`);
  console.log(`${"model".padEnd(22)} ${"MAE".padEnd(8)} ${"AUC(loved/disliked)".padEnd(22)} precision@10`);
  const report = (name: string, pick: (row: Row) => number | null) =>
    console.log(
      `${name.padEnd(22)} ${mae(pick).toFixed(2).padEnd(8)} ${(auc(pick)?.toFixed(3) ?? "n/a").padEnd(22)} ${precision(pick)?.toFixed(2) ?? "n/a"}`
    );
  report("taste neighbors (CF)", (row) => row.cf);
  report("content model", (row) => row.content);
  report("item-mean baseline", (row) => row.itemMean);

  console.log(`\nCF coverage of held-out set: ${rows.filter((row) => row.cf != null).length}/${rows.length}`);
  console.log("\nsample (worst CF misses first):");
  for (const row of [...both].sort((a, b) => Math.abs((b.cf ?? 0) - b.actual) - Math.abs((a.cf ?? 0) - a.actual)).slice(0, 12)) {
    console.log(
      `  actual ${row.actual.toFixed(1).padStart(4)} | cf ${row.cf?.toFixed(1)} (n=${row.cfSupport}) | content ${row.content?.toFixed(1)} | mean ${row.itemMean?.toFixed(1)} | ${row.title}`
    );
  }
} else {
  // Full-profile scoring of every MovieLens movie we can map back to TMDB.
  const { predictions, itemMeans } = await scoreFromNeighbors(neighbors, null);
  const ratedTmdb = new Set(ratings.map((rating) => rating.tmdbId));
  const scored: Array<{ tmdbId: number; score: number; support: number; itemMean: number | null }> = [];
  for (const [mlId, { pred, support }] of predictions) {
    const tmdbId = mlToTmdb.get(mlId);
    if (tmdbId === undefined || ratedTmdb.has(tmdbId)) continue;
    scored.push({ tmdbId, score: pred, support, itemMean: itemMeans.get(mlId)?.mean ?? null });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log(`\nscored ${scored.length.toLocaleString()} unseen movies from ${neighbors.userIds.length} neighbors`);
  console.log("\ntop 40 by taste-neighbor score:");
  for (const row of scored.slice(0, 40)) {
    console.log(`  ${row.score.toFixed(2)} (n=${row.support}, crowd ${row.itemMean?.toFixed(1)}) tmdb:${row.tmdbId}`);
  }

  if (write) {
    const rows = scored
      .filter((row) => row.support >= 10)
      .slice(0, 5000)
      .map((row) => ({
        profile_id: profileId,
        tmdb_id: row.tmdbId,
        score: Number(row.score.toFixed(3)),
        support: row.support,
        updated_at: new Date().toISOString()
      }));
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await db.from("taste_neighbor_scores").upsert(rows.slice(index, index + 500), { onConflict: "profile_id,tmdb_id" });
      if (error) {
        console.error("Write failed:", error.message);
        process.exit(1);
      }
    }
    console.log(`wrote ${rows.length} taste_neighbor_scores rows for profile ${profileId.slice(0, 8)}`);
  }
}
