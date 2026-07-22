import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { youtubeAuthUrl } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const channelParam = url.searchParams.get("channel");
    const channel = channelParam === "sanatana" ? "sanatana" : channelParam === "story" ? "story" : channelParam === "english" ? "english" : channelParam === "news" ? "news" : "devotional";
    const state = `${channel}:${randomBytes(24).toString("hex")}`;
    const response = NextResponse.redirect(youtubeAuthUrl(`${origin}/api/sivan-arul/youtube/callback`, state));
    response.cookies.set("youtube_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", maxAge: 600, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth தொடங்க முடியவில்லை" }, { status: 400 });
  }
}
