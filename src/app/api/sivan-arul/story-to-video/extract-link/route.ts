import { NextResponse } from "next/server";
import { extractArticleFromUrl } from "@/services/story/link-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return NextResponse.json({ error: "URL கொடுக்கவும்" }, { status: 400 });

    const { title, article } = await extractArticleFromUrl(url);
    const story = title ? `${title}\n\n${article}` : article;
    return NextResponse.json({ success: true, story, title });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Link-ல் இருந்து கதை எடுக்க முடியவில்லை" }, { status: 500 });
  }
}
