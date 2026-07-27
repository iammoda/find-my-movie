import "./loadEnv";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PROFILE_ID } from "../src/lib/constants";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Supabase env vars are missing.");
  console.error("Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false }
});

async function assertTable(table: string) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

try {
  await Promise.all([
    assertTable("profiles"),
    assertTable("movies"),
    assertTable("movie_credits"),
    assertTable("movie_taste_facts"),
    assertTable("movie_embeddings"),
    assertTable("movie_exposures"),
    assertTable("ratings"),
    assertTable("rating_reasons"),
    assertTable("rating_trait_reasons"),
    assertTable("recommendation_runs"),
    assertTable("recommendation_items"),
    assertTable("hidden_recommendations"),
    assertTable("comparisons"),
    assertTable("appeal_signals"),
    assertTable("watchlist_items"),
    assertTable("taxonomy_embeddings"),
    assertTable("movie_enrichments")
  ]);

  const { error } = await supabase.from("profiles").upsert({ id: DEFAULT_PROFILE_ID }, { onConflict: "id" });
  if (error) throw error;

  // Accounts migration (0006): profiles.email column + claim function.
  const { error: emailError } = await supabase.from("profiles").select("email").limit(1);
  if (emailError) throw new Error(`profiles.email: ${emailError.message} (apply 0006_accounts.sql)`);
  const { error: claimError } = await supabase.rpc("claim_default_profile", { target_profile_id: DEFAULT_PROFILE_ID });
  if (claimError) throw new Error(`claim_default_profile: ${claimError.message} (apply 0006_accounts.sql)`);

  const sampleEmbedding = new Array(1536).fill(0);
  sampleEmbedding[0] = 1;
  const { error: rpcError } = await supabase.rpc("match_movie_embeddings", {
    query_embedding: sampleEmbedding,
    match_count: 1,
    exclude_tmdb_ids: []
  });
  if (rpcError) throw new Error(`match_movie_embeddings: ${rpcError.message}`);

  console.log("Supabase connection OK.");
  console.log(`Verified schema tables, vector RPC, accounts objects, and ensured profile "${DEFAULT_PROFILE_ID}" exists.`);
} catch (error) {
  console.error("Supabase check failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error("Apply the SQL files in supabase/migrations in order, then rerun npm run supabase:check.");
  process.exit(1);
}
