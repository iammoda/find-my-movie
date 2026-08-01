/**
 * Backtest the P(seen) model against real Supabase seen/not-seen labels with
 * 5-fold cross-validation. Usage: npx tsx scripts/backtest-seen-model.ts
 * (requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).
 */
import { buildSeenPrior, buildSeenProbability } from "@/lib/seenModel";
import type { AppealSignal, Movie, MovieExposure, Rating } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function fetchAll(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: "0-9999" }
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function toMovie(row: Record<string, unknown>): Movie {
  return {
    tmdbId: row.tmdb_id as number,
    title: (row.title as string) ?? "",
    overview: (row.overview as string) ?? "",
    posterPath: (row.poster_path as string) ?? null,
    releaseDate: (row.release_date as string) ?? null,
    runtime: null,
    voteAverage: (row.vote_average as number) ?? 0,
    voteCount: (row.vote_count as number) ?? 0,
    popularity: (row.popularity as number) ?? 0,
    adult: false,
    genres: (row.genres as Movie["genres"]) ?? [],
    keywords: [],
    countries: [],
    credits: { tmdbId: row.tmdb_id as number, director: null, actors: [] }
  };
}

async function main() {
  const [movieRows, ratingRows, exposureRows] = await Promise.all([
    fetchAll("movies?select=tmdb_id,title,overview,poster_path,release_date,vote_average,vote_count,popularity,genres"),
    fetchAll("ratings?select=tmdb_id,rating,created_at,updated_at"),
    fetchAll("movie_exposures?select=tmdb_id,source,created_at&source=eq.not_seen")
  ]);

  const movies = movieRows.map(toMovie);
  const byId = new Map(movies.map((movie) => [movie.tmdbId, movie]));

  const seenIds = [...new Set(ratingRows.map((row) => row.tmdb_id as number))].filter((id) => byId.has(id));
  const seenSet = new Set(seenIds);
  const unseenIds = [...new Set(exposureRows.map((row) => row.tmdb_id as number))].filter(
    (id) => byId.has(id) && !seenSet.has(id)
  );

  const aucFor = (score: (movie: Movie) => number, testSeen: number[], testUnseen: number[]) => {
    const positives = testSeen.map((id) => score(byId.get(id)!));
    const negatives = testUnseen.map((id) => score(byId.get(id)!));
    let wins = 0;
    for (const p of positives) for (const q of negatives) wins += p > q ? 1 : p === q ? 0.5 : 0;
    return wins / (positives.length * negatives.length);
  };

  const results = new Map<string, number[]>();
  for (let fold = 0; fold < 5; fold += 1) {
    const isTest = (id: number) => id % 5 === fold;
    const trainRatings: Rating[] = seenIds
      .filter((id) => !isTest(id))
      .map((tmdbId) => ({ profileId: "default", tmdbId, rating: "like", createdAt: "", updatedAt: "" }));
    const trainExposures: MovieExposure[] = unseenIds
      .filter((id) => !isTest(id))
      .map((tmdbId) => ({ id: String(tmdbId), profileId: "default", tmdbId, source: "not_seen", sourceDetail: null, createdAt: "" }));
    const testSeen = seenIds.filter(isTest);
    const testUnseen = unseenIds.filter(isTest);

    const logistic = buildSeenProbability(trainRatings, trainExposures, [] as AppealSignal[], byId);
    const voteReach = (movie: Movie) => Math.min(1, Math.log10(1 + Math.max(0, movie.voteCount)) / 5.5);
    const candidates: Array<[string, (movie: Movie) => number]> = [
      ["logistic blend", logistic],
      ["old heuristic ", buildSeenPrior(trainRatings, trainExposures, [] as AppealSignal[], byId)],
      ["votes only    ", (movie) => movie.voteCount],
      ["ens p+0.2v    ", (movie) => logistic(movie) + 0.2 * voteReach(movie)],
      ["ens p+0.5v    ", (movie) => logistic(movie) + 0.5 * voteReach(movie)],
      ["ens p*v       ", (movie) => logistic(movie) * (0.4 + voteReach(movie))]
    ];
    for (const [label, score] of candidates) {
      const list = results.get(label) ?? [];
      list.push(aucFor(score, testSeen, testUnseen));
      results.set(label, list);
    }
  }

  console.log(`labels: ${seenIds.length} seen / ${unseenIds.length} not-seen (5-fold CV)`);
  for (const [label, aucs] of results) {
    const mean = aucs.reduce((sum, value) => sum + value, 0) / aucs.length;
    console.log(`${label}: mean AUC=${mean.toFixed(3)}  folds=[${aucs.map((value) => value.toFixed(3)).join(", ")}]`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
