import { NextResponse } from "next/server";
import { isFacebookConnected, listFacebookPages, disconnectFacebook } from "@/services/providers/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFacebookConnected()) return NextResponse.json({ connected: false, pages: [] });
  try {
    const pages = await listFacebookPages();
    return NextResponse.json({ connected: true, pages: pages.map((p) => ({ id: p.id, name: p.name })) });
  } catch (error) {
    return NextResponse.json({ connected: false, pages: [], error: error instanceof Error ? error.message : undefined });
  }
}

export async function DELETE() {
  await disconnectFacebook();
  return NextResponse.json({ disconnected: true });
}
