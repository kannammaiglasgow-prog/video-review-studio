import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { facebookAuthUrl } from "@/services/providers/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const state = randomBytes(24).toString("hex");
    const response = NextResponse.redirect(facebookAuthUrl(`${url.origin}/api/sivan-arul/facebook/callback`, state));
    response.cookies.set("facebook_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 600, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Facebook OAuth தொடங்க முடியவில்லை" }, { status: 400 });
  }
}
