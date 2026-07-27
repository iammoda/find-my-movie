import type { Metadata } from "next";
import Link from "next/link";
import { accountsEnabled, getSessionUser } from "@/lib/auth";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find My Movie",
  description: "A movie recommendation carousel that learns your taste."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authEnabled = accountsEnabled();
  const user = authEnabled ? await getSessionUser() : null;

  return (
    <html lang="en">
      <body>
        <header className="app-shell">
          <Link href="/" className="brand" aria-label="Find My Movie home">
            Find My Movie
          </Link>
          <nav className="top-nav" aria-label="Secondary navigation">
            <Link href="/taste">Taste</Link>
            <Link href="/about">About</Link>
            {authEnabled ? (
              user ? (
                <UserMenu email={user.email} />
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
