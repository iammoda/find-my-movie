import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const appealSchema = z.object({
  tmdbId: z.number().int().positive(),
  signal: z.enum(["want_to_watch", "not_interested"])
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const appealSignals = await store.listAppealSignals();
  return NextResponse.json({ appealSignals });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = appealSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appeal payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const appealSignal = await store.upsertAppealSignal(parsed.data.tmdbId, parsed.data.signal);
  // "Want to watch" also seeds the watchlist so it can drive the post-watch outcome loop.
  if (parsed.data.signal === "want_to_watch") {
    await store.upsertWatchlistItem(parsed.data.tmdbId, "queued");
  }
  return NextResponse.json({ appealSignal });
}

export async function DELETE(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const tmdbId = Number(new URL(request.url).searchParams.get("tmdbId"));
  if (!Number.isFinite(tmdbId)) return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  await store.deleteAppealSignal(tmdbId);
  return NextResponse.json({ ok: true });
}
