import { NextResponse } from "next/server";
import { scheduleMovieIntelligence } from "@/lib/intelligence";
import { publicMovie } from "@/lib/publicMovie";
import { getStore } from "@/lib/store";
import { fetchMovieDetails } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ tmdbId: string }> }) {
  const { tmdbId } = await context.params;
  const id = Number(tmdbId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });

  const store = getStore();
  const cached = await store.getMovie(id);
  if (cached?.credits?.actors?.length && cached.credits.director) {
    return NextResponse.json({ movie: publicMovie(cached), source: "cache" });
  }

  const fresh = await fetchMovieDetails(id);
  if (!fresh) return NextResponse.json({ error: "Movie not found" }, { status: 404 });

  await store.upsertMovies([fresh]);
  scheduleMovieIntelligence(store, [fresh]);
  const movie = (await store.getMovie(id)) ?? fresh;
  return NextResponse.json({ movie: publicMovie(movie), source: "tmdb" });
}
