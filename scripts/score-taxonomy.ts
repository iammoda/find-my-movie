import "./loadEnv";
import { embeddingConfigured } from "../src/lib/embeddings";
import { ensureTaxonomyVectors } from "../src/lib/intelligence";
import { getStore } from "../src/lib/store";
import { TAXONOMY_TRAITS, TAXONOMY_VERSION } from "../src/lib/taxonomy";
import { scoreMovieAgainstTaxonomy } from "../src/lib/taxonomyScoring";
import type { TasteFact } from "../src/lib/types";

if (!embeddingConfigured()) {
  console.error("OPENAI_API_KEY is missing. Add it to .env.local before scoring taxonomy traits.");
  process.exit(1);
}

const store = getStore();
const [movies, movieEmbeddings] = await Promise.all([store.listMovies(), store.listMovieEmbeddings()]);
const embeddingById = new Map(movieEmbeddings.map((embedding) => [embedding.tmdbId, embedding.embedding]));

console.log(`Scoring ${movies.length} movies against ${TAXONOMY_TRAITS.length} taxonomy traits (${TAXONOMY_VERSION}).`);

const traitVectors = await ensureTaxonomyVectors(store);
if (!traitVectors.length) throw new Error("Could not load taxonomy trait embeddings.");

const facts: TasteFact[] = [];
let skipped = 0;

for (const movie of movies) {
  const embedding = embeddingById.get(movie.tmdbId);
  if (!embedding?.length) {
    skipped += 1;
    continue;
  }
  facts.push(...scoreMovieAgainstTaxonomy(movie.tmdbId, embedding, traitVectors));
}

await store.replaceTasteFactsForSource("taxonomy", facts);

console.log(`Taxonomy scoring complete. Stored ${facts.length} facts. Skipped ${skipped} movies without embeddings.`);
const counts = new Map<string, number>();
for (const fact of facts) counts.set(fact.value, (counts.get(fact.value) ?? 0) + 1);
const topCounts = [...counts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([trait, count]) => `${trait}: ${count}`)
  .join(", ");
console.log(`Most common stored traits: ${topCounts || "none"}.`);
