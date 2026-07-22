import { NextResponse } from "next/server";
import fs from "node:fs";
import { getStoryProject, updateStoryProject } from "@/lib/database";
import { uploadToYoutube, youtubeChannelInfo, ENGLISH_CHANNEL_ID, type ChannelType } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const maxDuration = 600;

const validChannels: ChannelType[] = ["news", "devotional", "sanatana", "story", "english", "food"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row?.output_path || !fs.existsSync(row.output_path)) return NextResponse.json({ error: "Video இன்னும் ரெண்டர் ஆகவில்லை" }, { status: 400 });

  const body = await request.json();
  const channel: ChannelType = validChannels.includes(body.channel) ? body.channel : "story";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (row.seo_title || "Story Video");
  const description = typeof body.description === "string" ? body.description.trim() : (row.seo_description || "");
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown): t is string => typeof t === "string") : (row.seo_tags ? JSON.parse(row.seo_tags) : []);
  const privacyStatus = ["public", "unlisted", "private"].includes(body.privacyStatus) ? body.privacyStatus : "private";

  // For the English channel, verify the connected OAuth token actually points at the
  // "English Stories" brand channel (a multi-channel Google account can connect the
  // wrong one) — fail loudly rather than upload to the wrong channel silently.
  if (channel === "english") {
    let info;
    try {
      info = await youtubeChannelInfo("english");
    } catch {
      return NextResponse.json({ error: "English channel இன்னும் connect ஆகவில்லை — /api/sivan-arul/youtube/auth?channel=english சென்று 'English Stories' channel-ஐத் தேர்ந்தெடுத்து Allow செய்யவும்" }, { status: 400 });
    }
    if (info.id !== ENGLISH_CHANNEL_ID) {
      return NextResponse.json({ error: `Connected channel "${info.title}" (${info.id}) ≠ English Stories (${ENGLISH_CHANNEL_ID}). மீண்டும் authorize செய்து 'English Stories'-ஐத் தேர்ந்தெடுக்கவும்: /api/sivan-arul/youtube/auth?channel=english` }, { status: 400 });
    }
  }

  try {
    const result = await uploadToYoutube({
      filePath: row.output_path,
      title,
      description,
      tags,
      privacyStatus,
      language: row.language === "en" ? "en" : "ta",
    }, channel);

    updateStoryProject(projectId, {
      youtube_channel: channel,
      youtube_video_id: result.videoId,
      youtube_url: result.url,
      status: "uploaded",
    });

    return NextResponse.json({ success: true, videoId: result.videoId, url: result.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube upload தோல்வி" }, { status: 500 });
  }
}
