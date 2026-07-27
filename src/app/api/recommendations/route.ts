import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { generateRecommendations } from "@/lib/recommendations";
import { publicRecommendationResult } from "@/lib/publicMovie";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const result = await generateRecommendations(store);
  return NextResponse.json(publicRecommendationResult(result));
}
