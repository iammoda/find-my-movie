import "./loadEnv";
import { getStore } from "../src/lib/store";
import { fetchTvStarterPool } from "../src/lib/tmdbTv";

/** Seed the TV catalog from the popular head. Usage: npx tsx scripts/seed-tv.ts [target] */
const target = Number(process.argv[2] ?? 3000);
const store = getStore();

console.log(`Fetching up to ${target} TV shows from the TMDB popular head...`);
const pool = await fetchTvStarterPool(target);
await store.upsertMovies(pool);
const tv = await store.listMovies("tv");
console.log(`TV catalog seeded: +${pool.length} upserted, ${tv.length} total TV shows.`);
console.log("Next: run `npm run embed` to embed + taxonomy-score the new shows.");
