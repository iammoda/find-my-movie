import { NextResponse } from "next/server";
import { accountsEnabled } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!accountsEnabled()) return NextResponse.json({ ok: true });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
