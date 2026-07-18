import { NextResponse } from "next/server";
import {
  DEITIES,
  isAutoDevotionalEnabled,
  setAutoDevotionalEnabled,
  isAutoDevotionalShortsEnabled,
  setAutoDevotionalShortsEnabled,
  getAutoDevotionalVoice,
  setAutoDevotionalVoice,
  runAutoDevotionalPipelineForDeity,
  getTodayDeity
} from "@/services/personal/auto-devotional";

export const runtime = "nodejs";
export const maxDuration = 600;

// GET: Return settings and deities list
export async function GET() {
  return NextResponse.json({
    enabled: isAutoDevotionalEnabled(),
    shortsEnabled: isAutoDevotionalShortsEnabled(),
    selectedVoice: getAutoDevotionalVoice(),
    deities: DEITIES.map(d => ({ name: d.name, tamilName: d.tamilName, day: d.day }))
  });
}

// POST: Toggle settings or trigger manual run
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Toggle devotional ON/OFF
    if (typeof body.enabled === "boolean") {
      setAutoDevotionalEnabled(body.enabled);
      return NextResponse.json({ success: true, enabled: body.enabled });
    }

    // Toggle shorts ON/OFF
    if (typeof body.shortsEnabled === "boolean") {
      setAutoDevotionalShortsEnabled(body.shortsEnabled);
      return NextResponse.json({ success: true, shortsEnabled: body.shortsEnabled });
    }

    // Change voice
    if (typeof body.selectedVoice === "string") {
      setAutoDevotionalVoice(body.selectedVoice);
      return NextResponse.json({ success: true, selectedVoice: body.selectedVoice });
    }

    // Manual trigger for a specific deity (Long-form or Shorts)
    if (typeof body.deityName === "string") {
      const deity = DEITIES.find(d => d.name === body.deityName);
      if (!deity) {
        return NextResponse.json({ error: "Invalid deity selected" }, { status: 400 });
      }
      
      const isShorts = body.isShorts === true;
      const sessionId = `manual-devo-${Date.now()}`;
      
      runAutoDevotionalPipelineForDeity(deity, isShorts, sessionId).catch(err =>
        console.error("[Auto-Devotional API] Background run failed:", err)
      );

      return NextResponse.json({
        success: true,
        message: `${deity.tamilName} ${isShorts ? 'Shorts' : 'நீண்ட வீடியோ'} generation started`,
        deity: deity.tamilName
      });
    }

    // Manual trigger for today's deity (default fallback)
    if (body.triggerToday === true) {
      const deity = getTodayDeity();
      const isShorts = body.isShorts === true;
      const sessionId = `manual-devo-today-${Date.now()}`;
      
      runAutoDevotionalPipelineForDeity(deity, isShorts, sessionId).catch(err =>
        console.error("[Auto-Devotional API] Background run failed:", err)
      );

      return NextResponse.json({
        success: true,
        message: `Today's deity (${deity.tamilName}) generation started`
      });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sivan Arul API error" },
      { status: 500 }
    );
  }
}
