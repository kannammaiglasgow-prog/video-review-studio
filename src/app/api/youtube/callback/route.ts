import { NextResponse } from "next/server";
import { exchangeYoutubeCode } from "@/services/providers/youtube";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${url.origin}/?yt=error`);
  try {
    await exchangeYoutubeCode(code, `${url.origin}/api/youtube/callback`);
    return NextResponse.redirect(`${url.origin}/?yt=connected`);
  } catch {
    return NextResponse.redirect(`${url.origin}/?yt=error`);
  }
}
