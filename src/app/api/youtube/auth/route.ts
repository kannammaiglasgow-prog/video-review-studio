import { NextResponse } from "next/server";
import { youtubeAuthUrl } from "@/services/providers/youtube";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(youtubeAuthUrl(`${origin}/api/youtube/callback`));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth தொடங்க முடியவில்லை" }, { status: 400 });
  }
}
