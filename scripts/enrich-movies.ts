import "./loadEnv";
import { ENRICHMENT_VERSION, enrichMovie, enrichmentConfigured } from "../src/lib/enrichment";
import { ensureMovieIntelligence } from "../src/lib/intelligence";
import { mainstreamScore } from "../src/lib/quality";
import { getStore } from "../src/lib/store";
import { fetchMovieReviews } from "../src/lib/tmdb";
import type { Movie } from "../src/lib/types";

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 300;
const dryRun = process.argv.includes("--dry-run");

if (!enrichmentConfigured()) {
  console.error("OPENAI_API_KEY is missing. Add it to .env.local before enriching.");
  process.exit(1);
}

const store = getStore();
const [movies, ratings, runs, enrichments] = await Promise.all([
  store.listMovies(),
  store.listRatings(),
  store.listRecommendationRuns(),
  store.listMovieEnrichments()
]);

const movieById = new Map(movies.map((movie) => [movie.tmdbId, movie]));
const enrichedIds = new Set(enrichments.filter((item) => item.version === ENRICHMENT_VERSION).map((item) => item.tmdbId));

// Priority: rated movies -> latest run's candidate pool -> highest mainstream score.
const priority: number[] = [];
const seen = new Set<number>();
const push = (tmdbId: number) => {
  if (seen.has(tmdbId) || !movieById.has(tmdbId)) return;
  seen.add(tmdbId);
  priority.push(tmdbId);
};

for (const rating of ratings) push(rating.tmdbId);
for (const run of runs.slice(0, 3)) {
  for (const item of run.items) push(item.tmdbId);
}
for (const movie of [...movies].sort((a, b) => mainstreamScore(b) - mainstreamScore(a))) push(movie.tmdbId);

const queue = priority.filter((tmdbId) => !enrichedIds.has(tmdbId)).slice(0, LIMIT);

console.log(`Enrichment version: ${ENRICHMENT_VERSION}`);
console.log(`Already enriched: ${enrichedIds.size}. Queued this run: ${queue.length} (limit ${LIMIT}).`);

if (dryRun) {
  console.log("Dry run - no enrichment performed.");
  console.log(`First 10 queued: ${queue.slice(0, 10).map((id) => movieById.get(id)?.title).join(", ")}`);
  process.exit(0);
}

let enriched = 0;
let failed = 0;
let totalTraits = 0;
const enrichedMovies: Movie[] = [];

for (const tmdbId of queue) {
  const movie = movieById.get(tmdbId);
  if (!movie) continue;
  try {
    const reviews = await fetchMovieReviews(tmdbId);
    const result = await enrichMovie(movie, reviews);
    if (!result) {
      failed += 1;
      continue;
    }
    await store.replaceTasteFactsForMovie(tmdbId, "llm", result.facts);
    await store.saveMovieEnrichment(result.enrichment);
    enriched += 1;
    totalTraits += result.facts.length;
    enrichedMovies.push({
      ...movie,
      essence: result.enrichment.essence,
      tasteFacts: [...(movie.tasteFacts ?? []).filter((fact) => fact.source !== "llm"), ...result.facts]
    });
    if (enriched % 25 === 0) console.log(`Enriched ${enriched}/${queue.length}...`);
  } catch (error) {
    failed += 1;
    console.warn(`Failed to enrich ${movie.title} (${tmdbId})`, error instanceof Error ? error.message : error);
  }
}

console.log(`Enrichment complete. Enriched: ${enriched}. Failed: ${failed}. Avg traits/movie: ${(totalTraits / Math.max(1, enriched)).toFixed(1)}.`);

// Re-embed enriched movies so their essence + llm facts flow into the semantic layer.
if (enrichedMovies.length) {
  console.log("Re-embedding enriched movies...");
  const result = await ensureMovieIntelligence(store, enrichedMovies);
  console.log(`Re-embedded ${result.embedded}, taxonomy-rescored ${result.taxonomyScored}.`);
}
