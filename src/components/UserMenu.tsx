"use client";

import { useState } from "react";

export default function UserMenu({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      // Full navigation so all server-rendered session state resets.
      window.location.assign("/");
    }
  }

  return (
    <div className="user-menu">
      <span className="user-menu-email" title={email ?? undefined}>
        {email ?? "Signed in"}
      </span>
      <button type="button" className="user-menu-signout" onClick={handleSignOut} disabled={busy}>
        Sign out
      </button>
    </div>
  );
}
