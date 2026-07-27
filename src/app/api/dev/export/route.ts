import { NextResponse } from "next/server";
import { getSessionStore, unauthorized } from "@/lib/auth";
import { devToolsEnabled } from "@/lib/dev";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!devToolsEnabled()) return NextResponse.json({ error: "Disabled" }, { status: 403 });
  const store = await getSessionStore();
  if (!store) return unauthorized();
  const data = await store.exportData();
  return NextResponse.json(data);
}
