import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { accountsEnabled } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const signupSchema = z.object({
  email: z.string().trim().email(),
  // Supabase hashes with bcrypt; 72 bytes is the effective maximum.
  password: z.string().min(8).max(72)
});

export async function POST(request: Request) {
  if (!accountsEnabled()) {
    return NextResponse.json({ error: "Accounts are not enabled on this deployment" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid signup payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data.user) return NextResponse.json({ error: "Signup failed" }, { status: 400 });

  // With email confirmation enabled, signing up an already-registered email
  // returns an obfuscated user with no identities. Never claim data for it.
  const isNewUser = Boolean(data.session) || (data.user.identities?.length ?? 0) > 0;

  // The first real account adopts the legacy single-user ("default") data.
  // The SQL function is a no-op once any other account exists.
  let claimedLegacyData = false;
  if (isNewUser) {
    try {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false }
      });
      const { data: claimed, error: claimError } = await admin.rpc("claim_default_profile", {
        target_profile_id: data.user.id
      });
      if (claimError) throw claimError;
      claimedLegacyData = Boolean(claimed);
    } catch (claimError) {
      console.warn("Legacy profile claim failed", claimError instanceof Error ? claimError.message : claimError);
    }
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email ?? null },
    signedIn: Boolean(data.session),
    requiresEmailConfirmation: !data.session,
    claimedLegacyData
  });
}
