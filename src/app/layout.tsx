import type { Metadata } from "next";
import Link from "next/link";
import { accountsEnabled, getSessionUser } from "@/lib/auth";
import { friendDisplayName } from "@/lib/displayName";
import { getStore } from "@/lib/store";
import { MediaSwitch } from "@/components/MediaSwitch";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find My Movie",
  description: "A movie recommendation carousel that learns your taste."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authEnabled = accountsEnabled();
  const user = authEnabled ? await getSessionUser() : null;

  // Header label: display name -> email prefix -> raw email.
  let userLabel: string | null = null;
  if (user) {
    let profile = null;
    try {
      profile = await getStore().getProfile(user.id);
    } catch {
      // Profile lookup is cosmetic; fall back to the email.
    }
    userLabel = friendDisplayName(profile?.displayName, user.email) ?? user.email;
  }

  return (
    <html lang="en">
      <body>
        <header className="app-shell">
          <MediaSwitch />
          <nav className="top-nav" aria-label="Secondary navigation">
            <Link href="/taste">Taste</Link>
            {authEnabled ? <Link href="/friends">Friends</Link> : null}
            <Link href="/about">About</Link>
            {authEnabled ? (
              user ? (
                <UserMenu label={userLabel} />
              ) : (
                <Link href="/login" className="top-nav-signin">
                  Sign in
                </Link>
              )
            ) : null}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
