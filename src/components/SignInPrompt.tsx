"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";

/**
 * Guest gate: shown once when a signed-out visitor lands on the carousel and
 * again whenever they attempt a rating action. Dismissible - browsing stays
 * available; only rating requires an account.
 */
export function SignInPrompt({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div className="reason-modal-scrim" role="presentation" onClick={onDismiss}>
      <section
        className="reason-modal signin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="reason-modal-content">
          <button type="button" className="modal-close" onClick={onDismiss} aria-label="Keep browsing">
            <X size={18} />
          </button>
          <p className="eyebrow">Guest browsing</p>
          <h2 id="signin-modal-title">Sign in to rate movies</h2>
          <p className="reason-modal-copy">Ratings, your watchlist, and your taste profile are saved to your account.</p>
          <div className="reason-modal-actions signin-modal-actions">
            <Link className="secondary-button" href="/signup?next=%2F">
              Create account
            </Link>
            <Link className="signin-modal-primary" href="/login?next=%2F">
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
