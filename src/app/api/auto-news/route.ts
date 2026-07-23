import { NextResponse } from "next/server";
import { REGIONS, isAutoNewsEnabled, setAutoNewsEnabled, runSelectedRegionsAutoNews, isAutoShortsEnabled, setAutoShortsEnabled, runAutoShortsPipeline, getAutoNewsVoice, setAutoNewsVoice, runAllShortsPipelineManual, getAutoNewsTtsMode, setAutoNewsTtsMode } from "@/services/personal/auto-news";

export const runtime = "nodejs";
export const maxDuration = 600;

// GET: Return settings and regions list
export async function GET() {
  return NextResponse.json({
    enabled: isAutoNewsEnabled(),
    shortsEnabled: isAutoShortsEnabled(),
    selectedVoice: getAutoNewsVoice(),
    ttsMode: getAutoNewsTtsMode(),
    regions: REGIONS.map(r => ({ name: r.name, tamilName: r.tamilName }))
  });
}

// POST: Toggle ON/OFF, change voice or trigger manual run
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Toggle news ON/OFF
    if (typeof body.enabled === "boolean") {
      setAutoNewsEnabled(body.enabled);
      return NextResponse.json({ success: true, enabled: body.enabled });
    }

    // Toggle shorts ON/OFF
    if (typeof body.shortsEnabled === "boolean") {
      setAutoShortsEnabled(body.shortsEnabled);
      return NextResponse.json({ success: true, shortsEnabled: body.shortsEnabled });
    }

    // Change selected voice
    if (typeof body.selectedVoice === "string") {
      setAutoNewsVoice(body.selectedVoice);
      return NextResponse.json({ success: true, selectedVoice: body.selectedVoice });
    }

    // Change TTS mode (free = Parler-TTS, paid = Gemini TTS)
    if (body.ttsMode === "free" || body.ttsMode === "paid") {
      setAutoNewsTtsMode(body.ttsMode);
      return NextResponse.json({ success: true, ttsMode: body.ttsMode });
    }

    // Manual trigger for selected news regions
    if (Array.isArray(body.regions) && body.regions.length > 0) {
      const regionNames = body.regions.filter((r: unknown) => typeof r === "string");
      if (regionNames.length === 0) {
        return NextResponse.json({ error: "No valid regions selected" }, { status: 400 });
      }
      runSelectedRegionsAutoNews(regionNames).catch(err =>
        console.error("[Auto-News API] Background run failed:", err)
      );
      return NextResponse.json({
        success: true,
        message: `${regionNames.length} region(s) queued for processing`,
        regions: regionNames
      });
    }

    // Manual trigger for all 10 shorts in the queue
    if (body.triggerShorts === true) {
      runAllShortsPipelineManual().catch(err =>
        console.error("[Auto-Shorts API] Background run failed:", err)
      );
      return NextResponse.json({ success: true, message: "10 Shorts generation queue started" });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-news API error" },
      { status: 500 }
    );
  }
}
