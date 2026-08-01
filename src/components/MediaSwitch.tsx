"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Brand-level tabs switching between the movie and TV decks. */
export function MediaSwitch() {
  const pathname = usePathname();
  // Only the deck routes highlight a tab; /taste, /friends, /about show neither.
  const movieActive = pathname === "/";
  const tvActive = pathname === "/tv" || pathname.startsWith("/tv/");

  return (
    <nav className="brand-tabs" aria-label="Catalog">
      <Link href="/" className={movieActive ? "is-active" : ""} aria-current={movieActive ? "page" : undefined}>
        Find My Movie
      </Link>
      <Link href="/tv" className={tvActive ? "is-active" : ""} aria-current={tvActive ? "page" : undefined}>
        Find My Show
      </Link>
    </nav>
  );
}
