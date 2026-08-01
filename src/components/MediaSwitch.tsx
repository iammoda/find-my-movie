"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header segmented control switching between the movie and TV decks. */
export function MediaSwitch() {
  const pathname = usePathname();
  const tvActive = pathname === "/tv" || pathname.startsWith("/tv/");

  return (
    <div className="media-switch" role="group" aria-label="Catalog">
      <Link href="/" className={!tvActive ? "is-active" : ""} aria-current={!tvActive ? "page" : undefined}>
        Movies
      </Link>
      <Link href="/tv" className={tvActive ? "is-active" : ""} aria-current={tvActive ? "page" : undefined}>
        TV
      </Link>
    </div>
  );
}
