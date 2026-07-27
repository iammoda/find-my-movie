import "./loadEnv";
import { embeddingConfigured } from "../src/lib/embeddings";
import { ensureMovieIntelligence } from "../src/lib/intelligence";
import { getStore } from "../src/lib/store";

if (!embeddingConfigured()) {
  console.error("OPENAI_API_KEY is missing. Add it to .env.local before running embeddings.");
  process.exit(1);
}

const store = getStore();
const movies = await store.listMovies();

console.log(`Ensuring embeddings + taxonomy facts for up to ${movies.length} movies...`);
const result = await ensureMovieIntelligence(store, movies);

console.log(
  `Intelligence complete. Embedded: ${result.embedded}. Taxonomy-scored: ${result.taxonomyScored}. Skipped: ${result.skipped}. Failed: ${result.failed}.`
);
