import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { getStoryProject, type StoryScene } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const projectId = Number(id);
  const row = getStoryProject(projectId);
  if (!row) return NextResponse.json({ error: "Project கிடைக்கவில்லை" }, { status: 404 });

  const scenes: StoryScene[] = row.scenes_json ? JSON.parse(row.scenes_json) : [];
  const mediaDir = path.join(config.mediaRoot, "story", String(projectId));
  const uploadedImages = scenes.map((_, index) => {
    const candidates = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"].map((ext) => path.join(mediaDir, `scene_${index}${ext}`));
    return candidates.some((candidate) => fs.existsSync(candidate));
  });

  return NextResponse.json({
    id: row.id,
    status: row.status,
    storyInput: row.story_input,
    script: row.script,
    durationTarget: row.duration_target,
    voice: row.voice,
    scenes,
    uploadedImages,
    audioDuration: row.audio_duration,
    hasAudio: Boolean(row.audio_path && fs.existsSync(row.audio_path)),
    hasVideo: Boolean(row.output_path && fs.existsSync(row.output_path)),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoTags: row.seo_tags ? JSON.parse(row.seo_tags) : [],
    youtubeChannel: row.youtube_channel,
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    facebookPageId: row.facebook_page_id,
    facebookVideoId: row.facebook_video_id,
    facebookUrl: row.facebook_url,
    errorMessage: row.error_message,
    aspectRatio: row.aspect_ratio,
    bgmEnabled: row.bgm_enabled === 1,
    animateEnabled: row.animate_enabled !== 0,
    language: row.language || "ta",
    mediaSource: row.media_source || "stock",
    ttsMode: row.tts_mode || "paid",
    localize: row.localize === 1,
    thumbnailPrompt: row.thumbnail_prompt || "",
    apiCost: row.api_cost || 0,
    costBreakdown: row.cost_breakdown ? JSON.parse(row.cost_breakdown) : {},
  });
}
