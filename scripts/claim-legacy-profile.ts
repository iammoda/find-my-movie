import "./loadEnv";
import { createClient } from "@supabase/supabase-js";
import { ANONYMOUS_PROFILE_ID, DEFAULT_PROFILE_ID } from "../src/lib/constants";

/**
 * One-off maintenance: move all legacy single-user data from the 'default'
 * profile onto a real account, safely.
 *
 *   npx tsx scripts/claim-legacy-profile.ts --email you@example.com [--dry-run]
 *
 * - Deletes the junk 'anon' profile row (only if it owns zero data rows).
 * - Where the target account already rated/flagged the same movie, the
 *   account's row wins and the legacy duplicate is deleted.
 * - Reassigns everything else from 'default' to the target profile.
 * - Idempotent: re-running after success is a no-op.
 */

const PROFILE_TABLES = [
  "ratings",
  "rating_reasons",
  "rating_trait_reasons",
  "comparisons",
  "appeal_signals",
  "movie_exposures",
  "recommendation_runs",
  "recommendation_items",
  "hidden_recommendations",
  "watchlist_items"
] as const;

/** Tables with primary key (profile_id, tmdb_id): reassignment can collide. */
const TMDB_KEYED_TABLES = ["ratings", "appeal_signals", "watchlist_items", "hidden_recommendations"] as const;

const dryRun = process.argv.includes("--dry-run");
const emailFlag = process.argv.indexOf("--email");
const profileFlag = process.argv.indexOf("--profile");
const email = emailFlag !== -1 ? process.argv[emailFlag + 1] : null;
const explicitProfile = profileFlag !== -1 ? process.argv[profileFlag + 1] : null;

if (!email && !explicitProfile) {
  console.error("Usage: npx tsx scripts/claim-legacy-profile.ts --email <account email> [--dry-run]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function countRows(table: string, profileId: string): Promise<number> {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("profile_id", profileId);
  if (error) throw new Error(`${table} count for ${profileId}: ${error.message}`);
  return count ?? 0;
}

async function resolveTargetProfileId(): Promise<string> {
  if (explicitProfile) return explicitProfile;
  const { data, error } = await db.from("profiles").select("id, email").eq("email", email!);
  if (error) throw new Error(`profiles lookup: ${error.message}`);
  if (!data?.length) throw new Error(`No profile found with email ${email}. Has the account signed up (and migration 0006/0007 been applied)?`);
  if (data.length > 1) throw new Error(`Multiple profiles share email ${email}; pass --profile <id> instead.`);
  return data[0].id as string;
}

(async () => {
  const target = await resolveTargetProfileId();
  console.log(`Target profile: ${target}${email ? ` (${email})` : ""}${dryRun ? "  [DRY RUN]" : ""}`);

  // --- 1. Junk anonymous profile row: delete only when provably empty
  // (FKs cascade on delete, so a non-empty check is mandatory).
  const { data: anonProfile } = await db.from("profiles").select("id").eq("id", ANONYMOUS_PROFILE_ID).maybeSingle();
  if (anonProfile) {
    let anonRows = 0;
    for (const table of PROFILE_TABLES) anonRows += await countRows(table, ANONYMOUS_PROFILE_ID);
    if (anonRows > 0) {
      console.warn(`'${ANONYMOUS_PROFILE_ID}' profile owns ${anonRows} data rows; NOT deleting it. Investigate manually.`);
    } else if (dryRun) {
      console.log(`Would delete empty '${ANONYMOUS_PROFILE_ID}' profile row.`);
    } else {
      const { error } = await db.from("profiles").delete().eq("id", ANONYMOUS_PROFILE_ID);
      if (error) throw new Error(`deleting '${ANONYMOUS_PROFILE_ID}' profile: ${error.message}`);
      console.log(`Deleted empty '${ANONYMOUS_PROFILE_ID}' profile row.`);
    }
  }

  // --- 2. Composite-PK collisions: the account's own rows win.
  for (const table of TMDB_KEYED_TABLES) {
    const { data: targetRows, error } = await db.from(table).select("tmdb_id").eq("profile_id", target);
    if (error) throw new Error(`${table} target rows: ${error.message}`);
    const targetIds = (targetRows ?? []).map((row) => row.tmdb_id as number);
    if (!targetIds.length) continue;
    const { data: clashes, error: clashError } = await db
      .from(table)
      .select("tmdb_id")
      .eq("profile_id", DEFAULT_PROFILE_ID)
      .in("tmdb_id", targetIds);
    if (clashError) throw new Error(`${table} clashes: ${clashError.message}`);
    const clashIds = (clashes ?? []).map((row) => row.tmdb_id as number);
    if (!clashIds.length) continue;
    console.log(`${table}: ${clashIds.length} legacy duplicates lose to the account's rows (${clashIds.join(", ")})`);
    if (!dryRun) {
      const { error: deleteError } = await db.from(table).delete().eq("profile_id", DEFAULT_PROFILE_ID).in("tmdb_id", clashIds);
      if (deleteError) throw new Error(`${table} duplicate delete: ${deleteError.message}`);
    }
  }

  // --- 2b. rating_trait_reasons unique(profile_id, tmdb_id, sentiment, trait_id) guard.
  const { data: targetTraits, error: traitError } = await db
    .from("rating_trait_reasons")
    .select("tmdb_id, sentiment, trait_id")
    .eq("profile_id", target);
  if (traitError) throw new Error(`rating_trait_reasons target rows: ${traitError.message}`);
  for (const trait of targetTraits ?? []) {
    if (dryRun) continue;
    const { error: deleteError } = await db
      .from("rating_trait_reasons")
      .delete()
      .eq("profile_id", DEFAULT_PROFILE_ID)
      .eq("tmdb_id", trait.tmdb_id)
      .eq("sentiment", trait.sentiment)
      .eq("trait_id", trait.trait_id);
    if (deleteError) throw new Error(`rating_trait_reasons duplicate delete: ${deleteError.message}`);
  }

  // --- 3. Reassign the rest.
  console.log("--- Reassigning 'default' rows to the target profile:");
  for (const table of PROFILE_TABLES) {
    const before = await countRows(table, DEFAULT_PROFILE_ID);
    if (!before) continue;
    if (dryRun) {
      console.log(`  ${table}: would move ${before} rows`);
      continue;
    }
    const { error } = await db.from(table).update({ profile_id: target }).eq("profile_id", DEFAULT_PROFILE_ID);
    if (error) throw new Error(`${table} reassign: ${error.message}`);
    console.log(`  ${table}: moved ${before} rows`);
  }

  // --- 4. Summary.
  console.log("--- Final counts for target profile:");
  for (const table of PROFILE_TABLES) {
    const count = await countRows(table, target);
    if (count) console.log(`  ${table}: ${count}`);
  }
  const remaining = await countRows("ratings", DEFAULT_PROFILE_ID);
  console.log(`Ratings left under 'default': ${remaining}`);
  console.log(dryRun ? "Dry run complete - nothing was changed." : "Claim complete.");
})().catch((error) => {
  console.error("Claim failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
