import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** True when the public env vars needed for cookie-based auth sessions exist. */
export function supabaseAuthConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cookie-bound Supabase client for reading/writing the auth session on the server.
 * Data access stays on the service-role store (src/lib/store.ts); this client is auth-only.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Sessions are refreshed by src/middleware.ts instead.
        }
      }
    }
  });
}
