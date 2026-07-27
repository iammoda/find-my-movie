import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Path prefixes that require a signed-in user when accounts are enabled. */
const PROTECTED_PREFIXES = ["/taste", "/debug"];
/**
 * Exact-match protected pages. /friends must NOT be a prefix rule:
 * /friends/invite/[token] renders signed-out so new users can join.
 */
const PROTECTED_EXACT = ["/friends"];
/** Auth pages a signed-in user gets bounced away from. */
const AUTH_PATHS = ["/login", "/signup"];

function accountsEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function middleware(request: NextRequest) {
  // Local JSON mode (or missing anon key): no accounts, no session handling.
  if (!accountsEnabled()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  // Refresh the session (writes rotated tokens back onto the response cookies).
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const needsAuth =
    PROTECTED_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PROTECTED_EXACT.includes(pathname);
  if (!user && needsAuth) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_PATHS.includes(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Everything except static assets; API routes handle auth themselves but
  // still benefit from session refresh.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
