import { NextResponse } from "next/server";
import { exchangeYoutubeCode } from "@/services/providers/youtube";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers.get("cookie")?.match(/(?:^|;\s*)youtube_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !expectedState || state !== expectedState) return NextResponse.redirect(`${url.origin}/sivan-arul?yt=error`);
  try {
    await exchangeYoutubeCode(code, `${url.origin}/api/sivan-arul/youtube/callback`, "devotional");
    const response = NextResponse.redirect(`${url.origin}/sivan-arul?yt=connected`);
    response.cookies.delete("youtube_oauth_state");
    return response;
  } catch {
    const response = NextResponse.redirect(`${url.origin}/sivan-arul?yt=error`);
    response.cookies.delete("youtube_oauth_state");
    return response;
  }
}
