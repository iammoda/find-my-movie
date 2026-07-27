import "./loadEnv";
import { getStore } from "../src/lib/store";
import { fetchStarterPool } from "../src/lib/tmdb";

const store = getStore();
const movies = await fetchStarterPool();
await store.upsertMovies(movies);

console.log(`Seeded ${movies.length} movies.`);
