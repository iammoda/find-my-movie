import { Suspense } from "react";
import { accountsEnabled } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (!accountsEnabled()) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Accounts are off</h1>
          <p className="auth-subtitle">
            This deployment runs in single-user mode (no Supabase auth configured), so accounts are not needed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
