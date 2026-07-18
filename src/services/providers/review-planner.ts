import { youtubeTranscriptProvider } from "./transcript";
import { generateReactionPlan, type ReactionMoment } from "./gemini";
import { downloadYoutubeVideo } from "./downloader";
import { probeVideoMetadata } from "../render/ffprobe";
import type { OutputLanguage } from "@/lib/config";
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "@/lib/config";

export interface ReactionPlan {
  title: string;
  videoPath: string;
  thumbnailPrompt: string;
  highlights: ReactionMoment[];
}

export async function createReactionPlan(
  url: string,
  projectId: number,
  outputLanguage: OutputLanguage = "ta",
  tone = "fun",
  persona = "normal"
): Promise<ReactionPlan> {
  // 1. Download YouTube Video using yt-dlp first
  const projectDir = path.join(config.mediaRoot, "projects", String(projectId));
  await fs.mkdir(projectDir, { recursive: true });
  const videoPath = path.join(projectDir, "source.mp4").replaceAll("\\", "/");

  console.log(`[Reaction Planner] Downloading YouTube video to ${videoPath}...`);
  await downloadYoutubeVideo(url, videoPath);
  console.log(`[Reaction Planner] Download completed.`);

  const meta = await probeVideoMetadata(videoPath);
  const totalDurationMs = meta.duration * 1000;

  let transcriptText = "";
  try {
    console.log(`[Reaction Planner] Fetching YouTube transcript for ${url}...`);
    const transcript = await youtubeTranscriptProvider.fetch(url);
    transcriptText = transcript.segments.map(s => s.text).join(" ");
  } catch (err) {
    console.warn(`[Reaction Planner] YouTube transcript fetch failed:`, err);
  }

  // If no transcript found on YouTube, transcribe locally using Whisper AI!
  if (!transcriptText.trim()) {
    try {
      console.log(`[Reaction Planner] Transcribing downloaded video locally using Whisper AI...`);
      const { requestLocalHost, startSidecar } = await import("../personal/sidecar-manager");
      await startSidecar();
      const whisperResult = await requestLocalHost("POST", "/transcribe-audio", { videoPath });
      if (whisperResult?.transcript) {
        transcriptText = whisperResult.transcript;
        console.log(`[Reaction Planner] Local Whisper transcription complete:`, transcriptText.slice(0, 100) + "...");
      }
    } catch (whisperErr) {
      console.error(`[Reaction Planner] Local Whisper transcription failed:`, whisperErr);
    }
  }

  if (transcriptText.trim().length > 20) {
    // We have a valid transcript! Use Gemini to select highlights.
    const plan = await generateReactionPlan(transcriptText, outputLanguage, tone, persona, projectId);
    return {
      title: plan.title,
      videoPath,
      thumbnailPrompt: plan.thumbnailPrompt,
      highlights: plan.highlights.map(h => {
        const s = Math.max(0, Math.min(h.startMs, totalDurationMs));
        const e = Math.max(0, Math.min(h.endMs, totalDurationMs));
        const start = Math.min(s, e);
        let end = Math.max(s, e);
        if (end - start < 1000) {
          end = Math.min(totalDurationMs, start + 3000);
        }
        return { startMs: start, endMs: end, sourceSpeech: h.sourceSpeech, commentary: h.commentary };
      })
    };
  } else {
    // Fallback: Segment video uniformly into 3 parts of 10 seconds each
    console.log(`[Reaction Planner] Generating uniform segments fallback...`);
    const numHighlights = 3;
    const durationPerHighlight = 10000; // 10 seconds
    const interval = Math.floor(totalDurationMs / (numHighlights + 1));

    const highlights: ReactionMoment[] = [];
    const languagePhrases: Record<OutputLanguage, string[]> = {
      ta: [
        "இந்த காட்சி மிகவும் அற்புதமாக உள்ளது, பாருங்கள்!",
        "விளக்க முடியாத அளவுக்கு இந்த காட்சி ஆச்சரியமளிக்கிறது.",
        "அடடா! இதை நான் எதிர்பார்க்கவே இல்லை."
      ],
      en: [
        "Wow! This moment is absolutely incredible, take a look!",
        "I did not expect this to happen, truly amazing.",
        "Look at that detail, absolutely brilliant!"
      ],
      hi: [
        "वाह! यह दृश्य वाकई अद्भुत है, देखिए!",
        "मुझे इसकी उम्मीद नहीं थी, सच में कमाल है।",
        "इस विवरण को देखें, बिल्कुल शानदार!"
      ]
    };

    const phrases = languagePhrases[outputLanguage] || languagePhrases.ta;

    for (let i = 0; i < numHighlights; i++) {
      const startMs = Math.max(0, (i + 1) * interval - 5000);
      const endMs = Math.min(totalDurationMs, startMs + durationPerHighlight);
      highlights.push({
        startMs,
        endMs,
        commentary: phrases[i % phrases.length]
      });
    }

    return {
      title: "Reaction Video",
      videoPath,
      thumbnailPrompt: "High contrast YouTube thumbnail, eye-catching visual, realistic style, highly engaging",
      highlights
    };
  }
}
