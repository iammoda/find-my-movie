# Supabase Setup

The app is already wired to use Supabase automatically when these variables exist in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TMDB_ACCESS_TOKEN=optional-for-live-tmdb
OPENAI_API_KEY=optional-for-embeddings
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` enables accounts (cookie-based Supabase Auth sessions). If it is missing, the app still uses Supabase for storage but falls back to the legacy single-user `default` profile with no login.

## Apply The Schema

1. Open your Supabase project dashboard.
2. Go to SQL Editor.
3. Run the SQL files in `supabase/migrations/` in order (`0001` through `0006`).
4. Run:

```bash
npm run supabase:check
```

The check verifies every expected table and inserts the legacy profile, `default`.

If you prefer trying the automated path first:

```bash
SUPABASE_ACCESS_TOKEN=your-supabase-personal-access-token
npm run supabase:migrate
npm run supabase:check
```

If the automated migration is unauthorized, use the SQL Editor path above. The `SUPABASE_SERVICE_ROLE_KEY` is not enough for the Supabase management SQL API.

## Configure Auth (Accounts)

Migration `0006_accounts.sql` adds the auth trigger (auto-creates a profile row per user) and the first-signup claim function.

In the Supabase dashboard:

1. Go to Authentication → Providers and make sure **Email** is enabled.
2. Recommended for self-hosted use: Authentication → Providers → Email → turn **Confirm email** off, so signup signs you in immediately. If you leave confirmation on, users must click the emailed link before signing in.
3. If you keep email confirmation on, set Authentication → URL Configuration → Site URL to your app URL (e.g. `http://localhost:3000`).

Behavior notes:

- The **first account** to sign up automatically claims all data stored under the legacy `default` profile (ratings, watchlist, comparisons, exposures, recommendations).
- Later accounts start empty. Data is isolated per account server-side.

## Seed Movies

```bash
npm run seed
```

If `TMDB_ACCESS_TOKEN` is set, the seed job pulls a starter pool from TMDB popular, top-rated, and genre feeds. Without TMDB, it seeds the built-in fallback movie pool.

## Verify The Running App

```bash
curl -s http://localhost:3000/api/health
```

Expected when Supabase is active:

```json
{
  "ok": true,
  "storage": "supabase",
  "supabaseConfigured": true,
  "accountsEnabled": true
}
```

If `storage` is `local-json`, the app is still using `.data/mvp-store.json` because Supabase env vars are not visible to the Next.js process. If `accountsEnabled` is `false` while `storage` is `supabase`, add `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
