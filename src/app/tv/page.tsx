import { MovieCarousel } from "@/components/MovieCarousel";
import { accountsEnabled, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find My TV Show"
};

export default async function TvHome() {
  // Anonymous browsing is allowed; rating requires an account (when enabled).
  const canRate = !accountsEnabled() || Boolean(await getSessionUser());
  return (
    <main>
      <MovieCarousel canRate={canRate} mediaType="tv" />
    </main>
  );
}
