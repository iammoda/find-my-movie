import Link from "next/link";
import { TMDB_ATTRIBUTION } from "@/lib/constants";

export default function AboutPage() {
  return (
    <main className="narrow-page">
      <section className="plain-section">
        <h1>About</h1>
        <p>
          Find My Movie is a one-user MVP for testing whether ratings can produce better movie recommendations than a plain
          popular or top-rated list.
        </p>
        <p>{TMDB_ATTRIBUTION}</p>
        <p>
          Movie metadata and poster images are provided by{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
            The Movie Database
          </a>
          .
        </p>
        <Link className="text-link" href="/">
          Back to carousel
        </Link>
      </section>
    </main>
  );
}
