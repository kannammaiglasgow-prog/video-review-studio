import { NextResponse } from "next/server";
import { exchangeYoutubeCode } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const rawCookie = request.headers.get("cookie");
  const rawExpectedState = rawCookie?.match(/(?:^|;\s*)youtube_oauth_state=([^;]+)/)?.[1];
  const expectedState = rawExpectedState ? decodeURIComponent(rawExpectedState) : undefined;
  console.error("[YouTube OAuth callback] DEBUG", { code: code ? "present" : "missing", state, expectedState, rawCookie });
  if (!code || !state || !expectedState || state !== expectedState) return NextResponse.redirect(`${url.origin}/sivan-arul?yt=error`);
  const channelType = state.startsWith("sanatana:") ? "sanatana"
    : state.startsWith("story:") ? "story"
    : state.startsWith("english:") ? "english"
    : state.startsWith("news:") ? "news"
    : "devotional";
  const redirectBase = channelType === "sanatana" ? `${url.origin}/?channel=sanatana`
    : channelType === "story" ? `${url.origin}/?channel=story`
    : channelType === "english" ? `${url.origin}/sivan-arul/story-to-video?channel=english`
    : `${url.origin}/sivan-arul`;
  try {
    await exchangeYoutubeCode(code, `${url.origin}/api/sivan-arul/youtube/callback`, channelType);
    const response = NextResponse.redirect(`${redirectBase}${redirectBase.includes("?") ? "&" : "?"}yt=connected`);
    response.cookies.delete("youtube_oauth_state");
    return response;
  } catch (error) {
    console.error("[YouTube OAuth callback] token exchange failed:", error);
    const response = NextResponse.redirect(`${redirectBase}${redirectBase.includes("?") ? "&" : "?"}yt=error`);
    response.cookies.delete("youtube_oauth_state");
    return response;
  }
}
