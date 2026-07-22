import { NextResponse } from "next/server";
import { disconnectYoutube, isYoutubeConnected, youtubeChannelInfo, ENGLISH_CHANNEL_ID, type ChannelType } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ChannelType[] = ["news", "devotional", "sanatana", "story", "english"];

function parseChannel(requestUrl: string): ChannelType {
  const c = new URL(requestUrl).searchParams.get("channel") || "";
  return (VALID as string[]).includes(c) ? (c as ChannelType) : "story";
}

// GET ?channel=<x> → connection status (+ which channel the token points at)
export async function GET(request: Request) {
  const channel = parseChannel(request.url);
  if (!isYoutubeConnected(channel)) return NextResponse.json({ connected: false });
  try {
    const info = await youtubeChannelInfo(channel);
    const expectedId = channel === "english" ? ENGLISH_CHANNEL_ID : undefined;
    return NextResponse.json({
      connected: true,
      channel: info,
      matchesExpected: expectedId ? info.id === expectedId : true,
      expectedId,
    });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : undefined });
  }
}

// DELETE ?channel=<x> → revoke at Google + remove the local token
export async function DELETE(request: Request) {
  const channel = parseChannel(request.url);
  await disconnectYoutube(channel);
  return NextResponse.json({ disconnected: true });
}
