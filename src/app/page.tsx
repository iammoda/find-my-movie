import { MovieCarousel } from "@/components/MovieCarousel";
import { accountsEnabled, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Anonymous browsing is allowed; rating requires an account (when enabled).
  const canRate = !accountsEnabled() || Boolean(await getSessionUser());
  return (
    <main>
      <MovieCarousel canRate={canRate} />
    </main>
  );
}
