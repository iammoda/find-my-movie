import OpenAI from "openai";
import { FEATURE_TEXT_VERSION, featureTextForMovie } from "@/lib/taste";
import type { Movie } from "@/lib/types";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export { FEATURE_TEXT_VERSION };

let client: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function embeddingConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  if (!texts.length) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: "float"
  });

  return texts.map((_, index) => {
    const item = response.data.find((embedding) => embedding.index === index) ?? response.data[index];
    return item.embedding;
  });
}

export async function embedMovies(movies: Movie[]): Promise<Array<{ tmdbId: number; model: string; featureText: string; embedding: number[] }> | null> {
  if (!movies.length) return [];

  const featureTexts = movies.map(featureTextForMovie);
  const embeddings = await embedTexts(featureTexts);
  if (!embeddings) return null;

  return movies.map((movie, index) => {
    return {
      tmdbId: movie.tmdbId,
      model: EMBEDDING_MODEL,
      featureText: featureTexts[index],
      embedding: embeddings[index]
    };
  });
}

export async function embedMovie(movie: Movie): Promise<{ model: string; featureText: string; embedding: number[] } | null> {
  const results = await embedMovies([movie]);
  const result = results?.[0];
  if (!result) return null;
  return {
    model: result.model,
    featureText: result.featureText,
    embedding: result.embedding
  };
}
