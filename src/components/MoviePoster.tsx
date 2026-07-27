"use client";

import Image from "next/image";
import { posterUrl } from "@/lib/taste";
import type { Movie } from "@/lib/types";

interface MoviePosterProps {
  movie: Movie;
  priority?: boolean;
}

export function MoviePoster({ movie }: MoviePosterProps) {
  const url = posterUrl(movie.posterPath);
  const year = movie.releaseDate?.slice(0, 4);

  if (!url) {
    return (
      <div className="poster-fallback">
        <span>{year}</span>
        <strong>{movie.title}</strong>
      </div>
    );
  }

  return (
    <Image
      className="poster-image"
      src={url}
      alt={`${movie.title} poster`}
      fill
      sizes="(max-width: 620px) 92vw, 430px"
      priority={false}
      unoptimized
    />
  );
}
