"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Only allow same-origin path redirects (no protocol-relative or absolute URLs). */
function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "login") {
        const supabase = createSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        // Full navigation so the server-rendered header picks up the session.
        window.location.assign(nextPath);
        return;
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; signedIn?: boolean; requiresEmailConfirmation?: boolean }
        | null;
      if (!response.ok || !payload) {
        setError(payload?.error ?? "Signup failed. Please try again.");
        return;
      }
      if (payload.requiresEmailConfirmation) {
        setNotice("Check your email for a confirmation link, then sign in.");
        return;
      }
      window.location.assign(nextPath);
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  const nextQuery = nextPath === "/" ? "" : `?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="auth-card">
      <h1>{isLogin ? "Sign in" : "Create account"}</h1>
      <p className="auth-subtitle">
        {isLogin
          ? "Sign in to rate movies and build your taste profile."
          : "Your ratings, watchlist, and recommendations live on your account."}
      </p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "Working…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="auth-switch">
        {isLogin ? (
          <>
            No account yet? <Link href={`/signup${nextQuery}`}>Create one</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href={`/login${nextQuery}`}>Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
