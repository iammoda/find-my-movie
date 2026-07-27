import "./loadEnv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!url) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  process.exit(1);
}

if (!accessToken) {
  console.error("SUPABASE_ACCESS_TOKEN is missing.");
  console.error("The service-role key can read/write app data, but it cannot call Supabase's management SQL API.");
  console.error("Either add SUPABASE_ACCESS_TOKEN for this script, or run supabase/migrations/0001_initial.sql in the Supabase SQL editor.");
  process.exit(1);
}

const match = url.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
if (!match) {
  console.error("NEXT_PUBLIC_SUPABASE_URL does not look like a hosted Supabase project URL.");
  process.exit(1);
}

const ref = match[1];
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n\n");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ query: sql })
});

const body = await response.text();

if (!response.ok) {
  console.error("Migration request failed.");
  console.error(`HTTP ${response.status}`);
  console.error(body);
  console.error("If this says unauthorized, confirm SUPABASE_ACCESS_TOKEN is a Supabase personal access token.");
  process.exit(1);
}

console.log("Migration applied.");
