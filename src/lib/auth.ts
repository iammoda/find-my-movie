import { NextResponse } from "next/server";
import { ANONYMOUS_PROFILE_ID, DEFAULT_PROFILE_ID } from "@/lib/constants";
import { scopedStore } from "@/lib/scopedStore";
import { getStore, supabaseConfigured, type MovieStore } from "@/lib/store";
import { createSupabaseServerClient, supabaseAuthConfigured } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

let warnedMissingAnonKey = false;

/**
 * Accounts are active only when the Supabase store *and* the public anon key
 * are configured. Local JSON mode (or a missing anon key) falls back to the
 * legacy single-user behavior under the "default" profile.
 */
export function accountsEnabled() {
  if (!supabaseConfigured()) return false;
  if (!supabaseAuthConfigured()) {
    if (!warnedMissingAnonKey) {
      warnedMissingAnonKey = true;
      console.warn(
        "[auth] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set; accounts are disabled and the app runs single-user under the 'default' profile."
      );
    }
    return false;
  }
  return true;
}

/** The signed-in user, or null. Always null-with-fallback in single-user mode. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!accountsEnabled()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Profile id for the current request.
 * - Accounts disabled: the legacy "default" profile.
 * - Accounts enabled: the auth user id, or null when signed out.
 */
export async function getSessionProfileId(): Promise<string | null> {
  if (!accountsEnabled()) return DEFAULT_PROFILE_ID;
  const user = await getSessionUser();
  return user?.id ?? null;
}

/** Store bound to the signed-in profile, or null when authentication is required. */
export async function getSessionStore(): Promise<MovieStore | null> {
  const profileId = await getSessionProfileId();
  if (!profileId) return null;
  return scopedStore(getStore(), profileId);
}

/**
 * Store for public (anonymous-friendly) routes: bound to the session profile
 * when signed in, otherwise to the empty "anon" sentinel so personalization
 * reads come back empty instead of leaking another profile's data.
 */
export async function getPublicStore(): Promise<MovieStore> {
  const profileId = await getSessionProfileId();
  return scopedStore(getStore(), profileId ?? ANONYMOUS_PROFILE_ID);
}

/** Standard 401 for API routes that require a signed-in user. */
export function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
