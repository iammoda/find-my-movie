import "./loadEnv";
import { seedFromLegacyRating } from "../src/lib/ranking";
import { getStore, storeMode } from "../src/lib/store";
import type { RatingRankUpdate } from "../src/lib/store";
import { DEFAULT_PROFILE_ID } from "../src/lib/constants";

// Usage: npm run migrate:ratings [-- --dry-run] [-- --force] [-- --profile <profileId>]
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const profileFlag = process.argv.indexOf("--profile");
const profileId = profileFlag !== -1 ? process.argv[profileFlag + 1] : DEFAULT_PROFILE_ID;
if (!profileId) {
  console.error("Missing value for --profile.");
  process.exit(1);
}

const store = getStore();
const ratings = await store.listRatings(profileId);

const updates: RatingRankUpdate[] = [];
const skipped: number[] = [];
const counts: Record<string, number> = {};

for (const rating of ratings) {
  if (!force && rating.verdict != null && rating.rankScore != null) {
    skipped.push(rating.tmdbId);
    continue;
  }
  const seed = seedFromLegacyRating(rating.rating);
  if (!seed) continue;
  updates.push({ tmdbId: rating.tmdbId, verdict: seed.verdict, rankScore: seed.rankScore });
  const key = `${rating.rating} -> ${seed.verdict}/${seed.rankScore}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

console.log(`Store mode: ${storeMode()}`);
console.log(`Profile: ${profileId}`);
console.log(`Total ratings: ${ratings.length}`);
console.log(`Already migrated (skipped): ${skipped.length}${force ? " (use of --force ignores none)" : ""}`);
console.log(`To migrate: ${updates.length}`);
for (const [key, count] of Object.entries(counts).sort()) {
  console.log(`  ${key}: ${count}`);
}

if (dryRun) {
  console.log("Dry run - no changes written.");
  process.exit(0);
}

if (!updates.length) {
  console.log("Nothing to migrate.");
  process.exit(0);
}

await store.updateRatingRanks(updates, profileId);
console.log(`Migrated ${updates.length} ratings to verdict/rank_score.`);
