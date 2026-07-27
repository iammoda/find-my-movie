import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const hideSchema = z.object({
  tmdbId: z.number().int().positive(),
  reason: z.string().optional()
});

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = hideSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hide payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  await store.hideRecommendation(parsed.data.tmdbId, parsed.data.reason ?? null);
  return NextResponse.json({ ok: true });
}
