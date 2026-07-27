import "./loadEnv";
import { embeddingConfigured } from "../src/lib/embeddings";
import { enrichmentConfigured } from "../src/lib/enrichment";
import { ensureMovieIntelligence } from "../src/lib/intelligence";
import { getStore } from "../src/lib/store";
import { fetchStarterPool } from "../src/lib/tmdb";

/**
 * One idempotent maintenance command:
 *   1. refresh the starter catalog from TMDB (upsert new/changed movies)
 *   2. embed + taxonomy-score any movies missing intelligence
 *   3. (separately) run `npm run enrich` for LLM enrichment of priority movies
 *
 * Safe to re-run anytime. Flags: --skip-catalog, --enrich-limit=N (spawns enrich after).
 */

const skipCatalog = process.argv.includes("--skip-catalog");
const startedAt = Date.now();
const store = getStore();

if (!skipCatalog) {
  console.log("Refreshing catalog from TMDB...");
  const pool = await fetchStarterPool();
  await store.upsertMovies(pool);
  console.log(`Catalog upserted: ${pool.length} movies.`);
} else {
  console.log("Skipping catalog refresh (--skip-catalog).");
}

if (!embeddingConfigured()) {
  console.warn("OPENAI_API_KEY missing - skipping embeddings/taxonomy. Catalog refreshed only.");
  process.exit(0);
}

const movies = await store.listMovies();
console.log(`Ensuring intelligence for ${movies.length} movies (embeds + taxonomy for anything missing)...`);
const result = await ensureMovieIntelligence(store, movies);
console.log(
  `Intelligence: embedded ${result.embedded}, taxonomy-scored ${result.taxonomyScored}, skipped ${result.skipped}, failed ${result.failed}.`
);

console.log(`\nSync finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
if (enrichmentConfigured()) {
  console.log("Next: run `npm run enrich` to LLM-enrich priority movies (rated + recommended first).");
}
