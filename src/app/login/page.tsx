import { Suspense } from "react";
import { accountsEnabled } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!accountsEnabled()) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Accounts are off</h1>
          <p className="auth-subtitle">
            This deployment runs in single-user mode (no Supabase auth configured), so signing in is not needed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
