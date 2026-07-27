import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const exposureSchema = z.object({
  tmdbId: z.number().int().positive(),
  source: z.enum(["taste_test", "manual_search", "popular", "top_rated", "genre", "recommendation", "not_seen"]),
  sourceDetail: z.string().nullish()
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const exposures = await store.listExposures();
  return NextResponse.json({ exposures });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = exposureSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid exposure payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const exposure = await store.logExposure(parsed.data.tmdbId, parsed.data.source, parsed.data.sourceDetail ?? null);
  return NextResponse.json({ exposure });
}

const behaviorSchema = z.object({
  exposureId: z.string().min(1),
  dwellMs: z.number().int().nonnegative().nullish(),
  flipped: z.boolean().optional(),
  decisionMs: z.number().int().nonnegative().nullish()
});

export async function PATCH(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = behaviorSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid behavior payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { exposureId, ...behavior } = parsed.data;
  await store.updateExposureBehavior(exposureId, behavior);
  return NextResponse.json({ ok: true });
}

// Only "not_seen" markers are deletable (undo); view logs are immutable history.
export async function DELETE(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const tmdbId = Number(new URL(request.url).searchParams.get("tmdbId"));
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  await store.deleteExposures(tmdbId, "not_seen");
  return NextResponse.json({ ok: true });
}
