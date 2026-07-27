# Find My Movie

A movie recommendation app with accounts. The app opens to a Tinder-style movie carousel, stores ratings, and recommends movies based on deeper taste patterns instead of shallow plot or location matches.

## Stack

- Next.js App Router
- Supabase Postgres for the intended database
- Supabase Auth (email + password) for accounts
- Local JSON fallback when Supabase env vars are missing (single-user, no accounts)
- TMDB for movie metadata
- OpenAI `text-embedding-3-small` for future embedding-backed ranking

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

For Supabase local development:

```bash
npx supabase init
npx supabase start
```

Then run the SQL in `supabase/migrations/` (in order) or link the project and apply migrations through the Supabase CLI.

For hosted Supabase setup, see `docs/supabase.md`.

Useful commands:

```bash
npm run supabase:check
npm run seed
curl -s http://localhost:3000/api/health
```

## Required Environment Variables

- `TMDB_ACCESS_TOKEN`: TMDB API bearer token.
- `OPENAI_API_KEY`: used for embedding generation and future reranking.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Supabase key; enables accounts (cookie-based auth sessions).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase key.

If Supabase is not configured, ratings persist in `.data/mvp-store.json` so the app can still be tested locally.

## Accounts

- Accounts are active when all three Supabase env vars are set. Sign up / sign in with email + password at `/signup` and `/login`.
- Signed-out visitors can browse the carousel and search; rating, watchlist, taste profile, and recommendations require signing in.
- The first account created automatically claims all data previously stored under the legacy single-user `default` profile.
- Without Supabase (local JSON mode) or without `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the app runs in the legacy single-user mode with no login.

## Guardrails

- Movie-only.
- Per-account data isolation: every profile-scoped query is bound server-side to the session profile.
- Rated movies are treated as seen/known and are excluded from recommendations.
- Recommendations unlock after 10 ratings and at least 3 positive ratings.
- TMDB data is cached and attribution is shown on `/about`.
- `/debug` exposes the recommendation loop for inspection (signed-in users; dev builds).
