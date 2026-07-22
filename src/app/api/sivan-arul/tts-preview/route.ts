import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { buildReviewPrompt } from "@/services/pipeline";
import { geminiReviewProvider } from "@/services/providers/gemini";
import { parlerSpeechProvider } from "@/services/providers/parler";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const templeName = typeof body.templeName === "string" ? body.templeName.trim() : "";
    const storyDetails = typeof body.storyDetails === "string" ? body.storyDetails.trim() : "";
    const voice = typeof body.voice === "string" && body.voice ? body.voice : "parler-jaya";

    if (templeName.length < 3) return NextResponse.json({ error: "பெயரைக் குறிப்பிடவும்" }, { status: 400 });
    if (storyDetails.length < 20) return NextResponse.json({ error: "குறைந்தது 20 எழுத்துகள் கொண்ட விவரத்தை எழுதவும்" }, { status: 400 });

    const customInstruction = `கீழே கொடுக்கப்பட்டுள்ள புராணக் கதை/வரலாற்றுத் தகவலை அடிப்படையாகக் கொண்டு, "${templeName}" பற்றிய 45-60 விநாடிகள் ஓடக்கூடிய பக்தி/புராணக் கதை தமிழ் YouTube Shorts ஸ்கிரிப்ட் ஒன்றை எழுதவும்.
வடிவமைப்பு வழிமுறைகள்:
1. முதல் வரியே ஒரு ஆர்வமூட்டும் கேள்வி அல்லது வியப்பூட்டும் தகவலாக இருக்க வேண்டும் (hook).
2. கதையை காலவரிசைப்படி, தெளிவாகவும் பக்தி உணர்வோடும் விவரிக்க வேண்டும்.
3. கடைசியில் "இந்த தெய்வத்தை/கோவிலை பிடிக்கும்னா ஒரு லைக் பண்ணுங்க" போன்ற ஒரு இயல்பான CTA வரியுடன் முடிக்க வேண்டும்.
4. வரலாற்று/புராண உண்மைகளை மாற்றாமல் சொல்லவும்.

புராணக் கதை விவரம்:
${storyDetails}`;

    const review = await geminiReviewProvider.createTamilScript(
      buildReviewPrompt({
        transcript: templeName,
        stance: "spiritual",
        tone: "Calm, peaceful, and confident",
        persona: "Devotional Guide",
        duration: "60 விநாடிகள்",
        customInstruction,
        sourceType: "text",
        outputLanguage: "ta",
        format: "9:16",
        hasImage: false,
      }),
      1
    );

    const dir = path.join(process.cwd(), "public", "tts-preview");
    await fs.mkdir(dir, { recursive: true });
    const filename = `preview-${Date.now()}.wav`;
    const outputPath = path.join(dir, filename);

    await parlerSpeechProvider.synthesize(review.script, outputPath, voice, "ta");

    return NextResponse.json({
      success: true,
      title: review.title,
      script: review.script,
      voice,
      audioUrl: `/tts-preview/${filename}`,
      audioPath: outputPath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS preview error" },
      { status: 500 }
    );
  }
}
