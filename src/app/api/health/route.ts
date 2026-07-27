import { NextResponse } from "next/server";
import { accountsEnabled, getPublicStore } from "@/lib/auth";
import { storeMode, supabaseConfigured } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ratings = await (await getPublicStore()).listRatings();
    return NextResponse.json({
      ok: true,
      storage: storeMode(),
      supabaseConfigured: supabaseConfigured(),
      accountsEnabled: accountsEnabled(),
      ratingsCount: ratings.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        storage: storeMode(),
        supabaseConfigured: supabaseConfigured(),
        accountsEnabled: accountsEnabled(),
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
