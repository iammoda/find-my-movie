import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { publicMovie } from "@/lib/publicMovie";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  tmdbId: z.number().int().positive(),
  status: z.enum(["queued", "watched", "abandoned"])
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const items = await store.listWatchlist();
  const movies = await Promise.all(
    items.map(async (item) => {
      const movie = await store.getMovie(item.tmdbId);
      return { ...item, movie: movie ? publicMovie(movie) : null };
    })
  );
  return NextResponse.json({ watchlist: movies.filter((item) => item.movie) });
}

export async function PATCH(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid watchlist payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const item = await store.upsertWatchlistItem(parsed.data.tmdbId, parsed.data.status);
  return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const tmdbId = Number(new URL(request.url).searchParams.get("tmdbId"));
  if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  await store.removeWatchlistItem(tmdbId);
  return NextResponse.json({ ok: true });
}
