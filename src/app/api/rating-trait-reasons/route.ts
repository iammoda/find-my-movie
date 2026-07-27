import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { TAXONOMY_TRAITS_BY_ID } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const traitReasonSchema = z.object({
  tmdbId: z.number().int().positive(),
  sentiment: z.enum(["positive", "negative"]),
  traitIds: z.array(z.string().trim().min(1)).max(3)
});

export async function GET() {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const ratingTraitReasons = await store.listRatingTraitReasons();
  return NextResponse.json({ ratingTraitReasons });
}

export async function POST(request: Request) {
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const json = await request.json().catch(() => null);
  const parsed = traitReasonSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rating trait reason payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueTraitIds = Array.from(new Set(parsed.data.traitIds));
  const invalidTraitIds = uniqueTraitIds.filter((traitId) => !TAXONOMY_TRAITS_BY_ID.has(traitId));
  if (invalidTraitIds.length) {
    return NextResponse.json({ error: "Invalid taxonomy trait ids", invalidTraitIds }, { status: 400 });
  }

  const ratingTraitReasons = await store.saveRatingTraitReasons(parsed.data.tmdbId, uniqueTraitIds, parsed.data.sentiment);
  return NextResponse.json({ ratingTraitReasons });
}
