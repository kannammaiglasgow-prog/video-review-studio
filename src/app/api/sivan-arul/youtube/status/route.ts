import { NextResponse } from "next/server";
import { disconnectYoutube, isYoutubeConfigured, isYoutubeConnected, youtubeChannelInfo } from "@/services/providers/youtube";

export const runtime = "nodejs";

export async function GET() {
  if (!isYoutubeConfigured()) return NextResponse.json({ configured: false, connected: false });
  if (!isYoutubeConnected("devotional")) return NextResponse.json({ configured: true, connected: false });
  try {
    const channel = await youtubeChannelInfo("devotional");
    return NextResponse.json({ configured: true, connected: true, channel });
  } catch (error) {
    return NextResponse.json({ configured: true, connected: false, error: error instanceof Error ? error.message : undefined });
  }
}

export async function DELETE() {
  await disconnectYoutube("devotional");
  return NextResponse.json({ disconnected: true });
}
