import Link from "next/link";
import { accountsEnabled, getSessionProfileId } from "@/lib/auth";
import { friendDisplayName } from "@/lib/displayName";
import { getStore } from "@/lib/store";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";

export const dynamic = "force-dynamic";

/**
 * Invite landing page. Renders signed-out (with auth CTAs that return here)
 * so a brand-new user can sign up and then accept.
 */
export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  if (!accountsEnabled()) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Friends are off</h1>
          <p className="auth-subtitle">This deployment runs in single-user mode, so invites cannot be accepted.</p>
        </div>
      </main>
    );
  }

  const store = getStore();
  const invite = await store.getFriendInvite(token);
  const expired = invite ? new Date(invite.expiresAt).getTime() <= Date.now() : false;

  if (!invite || expired) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>{expired ? "Invite expired" : "Invite not found"}</h1>
          <p className="auth-subtitle">
            {expired
              ? "This invite link is older than 7 days. Ask your friend to send a fresh one."
              : "This invite link is invalid or was revoked."}
          </p>
        </div>
      </main>
    );
  }

  const inviter = await store.getProfile(invite.inviterProfileId);
  const inviterName = friendDisplayName(inviter?.displayName, inviter?.email) ?? "A Find My Movie user";
  const sessionProfileId = await getSessionProfileId();
  const nextParam = encodeURIComponent(`/friends/invite/${token}`);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Friend invite</p>
        <h1>{inviterName} wants to compare movie taste</h1>
        <p className="auth-subtitle">
          Accepting shares your loved movies and watchlist with each other. Dislikes and browsing history stay private.
        </p>
        {sessionProfileId === invite.inviterProfileId ? (
          <p className="auth-subtitle">This is your own invite link - share it with a friend.</p>
        ) : sessionProfileId ? (
          <AcceptInviteButton token={token} />
        ) : (
          <div className="invite-auth-actions">
            <Link className="auth-submit invite-auth-link" href={`/login?next=${nextParam}`}>
              Sign in to accept
            </Link>
            <p className="auth-switch">
              New here? <Link href={`/signup?next=${nextParam}`}>Create an account</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
