import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleMovieIntelligence } from "@/lib/intelligence";
import { publicMovie } from "@/lib/publicMovie";
import { getStore } from "@/lib/store";
import { searchMovies } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80)
});

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = getStore();
  const movies = await searchMovies(parsed.data.q);
  await store.upsertMovies(movies);
  scheduleMovieIntelligence(store, movies);
  const enriched = await Promise.all(movies.map(async (movie) => (await store.getMovie(movie.tmdbId)) ?? movie));

  return NextResponse.json({ movies: enriched.map(publicMovie) });
}
