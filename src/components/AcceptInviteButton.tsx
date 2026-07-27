"use client";

import { useState } from "react";

export function AcceptInviteButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/friends/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Could not accept the invite.");
        return;
      }
      window.location.assign("/friends");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invite-accept">
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="button" className="auth-submit" onClick={() => void accept()} disabled={busy}>
        {busy ? "Accepting…" : "Accept invite"}
      </button>
    </div>
  );
}
