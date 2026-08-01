import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { generateRecommendations } from "@/lib/recommendations";
import { publicRecommendationResult } from "@/lib/publicMovie";
import { genreSuggestions, resolveGenre } from "@/lib/genres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();

  const searchParams = new URL(request.url).searchParams;
  const mediaType = searchParams.get("media") === "tv" ? ("tv" as const) : ("movie" as const);
  const genreInput = searchParams.get("genre")?.trim() ?? "";
  let genre: ReturnType<typeof resolveGenre> = null;
  if (genreInput) {
    genre = resolveGenre(genreInput, mediaType);
    if (!genre) {
      return NextResponse.json(
        { error: `Unknown genre "${genreInput}".`, suggestions: genreSuggestions(mediaType) },
        { status: 400 }
      );
    }
  }

  const result = await generateRecommendations(store, undefined, undefined, {
    genreId: genre?.id,
    genreName: genre?.name,
    mediaType
  });
  return NextResponse.json({ ...publicRecommendationResult(result), genre, mediaType });
}
