import { accountsEnabled } from "@/lib/auth";
import { FriendsPanel } from "@/components/FriendsPanel";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  if (!accountsEnabled()) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Friends are off</h1>
          <p className="auth-subtitle">
            This deployment runs in single-user mode (no Supabase auth configured), so friends are not available.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="friends-page">
      <FriendsPanel />
    </main>
  );
}
