import { NextResponse } from "next/server";
import { exchangeFacebookCode } from "@/services/providers/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const rawCookie = request.headers.get("cookie");
  const rawExpectedState = rawCookie?.match(/(?:^|;\s*)facebook_oauth_state=([^;]+)/)?.[1];
  const expectedState = rawExpectedState ? decodeURIComponent(rawExpectedState) : undefined;
  const redirectBase = `${url.origin}/sivan-arul/story-to-video`;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${redirectBase}?fb=error`);
  }
  try {
    await exchangeFacebookCode(code, `${url.origin}/api/sivan-arul/facebook/callback`);
    const response = NextResponse.redirect(`${redirectBase}?fb=connected`);
    response.cookies.delete("facebook_oauth_state");
    return response;
  } catch (error) {
    console.error("[Facebook OAuth callback] token exchange failed:", error);
    const response = NextResponse.redirect(`${redirectBase}?fb=error`);
    response.cookies.delete("facebook_oauth_state");
    return response;
  }
}
