import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { publicRecommendationRun } from "@/lib/publicMovie";

export const dynamic = "force-dynamic";

const MAX_HISTORY_RUNS = 10;

/** Past recommendation runs, newest first - the "previous lists" the user generated. */
export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const runs = await store.listRecommendationRuns();
  const movieRuns = runs
    .filter((run) => ((run.metadata as { mediaType?: string } | null)?.mediaType ?? "movie") === "movie")
    .filter((run) => run.items.length > 0)
    .slice(0, MAX_HISTORY_RUNS);

  return NextResponse.json({ runs: movieRuns.map(publicRecommendationRun) });
}
