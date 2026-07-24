import { NextResponse } from "next/server";
import { getAutoStorySettings, setAutoStorySettings } from "@/lib/database";
import { triggerAutoStoryOnce, triggerAutoStoryBatch, type StoryChannel, type StoryFormat } from "@/services/personal/auto-story";

export const runtime = "nodejs";
export const maxDuration = 600;
export const dynamic = "force-dynamic";

function parseChannel(channel: string): StoryChannel | null {
  return channel === "story" || channel === "english" ? channel : null;
}

export async function GET(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  const ch = parseChannel(channel);
  if (!ch) return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  return NextResponse.json(getAutoStorySettings(ch));
}

export async function POST(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  const ch = parseChannel(channel);
  if (!ch) return NextResponse.json({ error: "Unknown channel" }, { status: 404 });

  try {
    const body = await request.json();

    if (typeof body.enabled === "boolean" || Array.isArray(body.times) || typeof body.voice === "string" || typeof body.shortsEnabled === "boolean" || Array.isArray(body.shortsTimes)) {
      setAutoStorySettings(ch, {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        times: Array.isArray(body.times) ? body.times : undefined,
        voice: typeof body.voice === "string" ? body.voice : undefined,
        shortsEnabled: typeof body.shortsEnabled === "boolean" ? body.shortsEnabled : undefined,
        shortsTimes: Array.isArray(body.shortsTimes) ? body.shortsTimes : undefined,
      });
      return NextResponse.json({ success: true, ...getAutoStorySettings(ch) });
    }

    if (body.trigger === true) {
      const format: StoryFormat = body.format === "short" ? "short" : "long";
      // Awaits only the fast idea-pick+script step, so a missing Reddit app or
      // "no fresh ideas" surfaces here immediately; the render itself continues
      // in the background and shows up via story_projects status polling.
      const result = await triggerAutoStoryOnce(ch, format);
      if ("skipped" in result) return NextResponse.json({ success: false, error: result.skipped });
      return NextResponse.json({ success: true, projectId: result.projectId, message: `Idea Engine தொடங்கியது (Project #${result.projectId}) — Dashboard channel page-ல் status பாருங்கள்` });
    }

    if (body.triggerBatch === true) {
      const format: StoryFormat = body.format === "short" ? "short" : "long";
      const count = Number.isFinite(body.count) && body.count > 0 ? Math.min(Number(body.count), 20) : 10;
      // Fire-and-forget — runs one at a time in the background (see
      // triggerAutoStoryBatch), each drawing a fresh idea so all `count`
      // videos are different themes. Progress shows up via story_projects
      // status polling on the dashboard, same as everything else here.
      triggerAutoStoryBatch(ch, format, count);
      return NextResponse.json({ success: true, message: `${count} ${format === "short" ? "Shorts" : "videos"} queue தொடங்கியது — ஒவ்வொன்றாக generate ஆகும், Dashboard channel page-ல் status பாருங்கள்` });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto-story API error" }, { status: 500 });
  }
}
