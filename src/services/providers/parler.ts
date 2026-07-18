import { OutputLanguage } from "@/lib/config";
import { callSidecar } from "../personal/sidecar-manager";
import type { SpeechProvider } from "./types";

export const voicePromptDescriptions: Record<string, string> = {
  // Female Voices
  "parler-jaya": "Jaya speaks in Tamil in a clear and professional news-reading voice. She speaks at a moderate speed with a natural and expressive tone. The recording is very clear and has no background noise.",
  "parler-rasa": "Rasa speaks in Tamil in a natural and friendly female voice. She speaks with moderate speed and standard expression. The recording is clean and clear.",
  "parler-ganga": "Ganga speaks in Tamil in a calm, slightly slow female voice. She speaks with a soft, polite and warm tone. The recording is clear.",
  "parler-lekha": "Lekha speaks in Tamil in a high-pitched, energetic female voice. She speaks with excitement and fast speed. The recording is clear.",
  // Male Voices
  "parler-sundar": "Sundar speaks in Tamil in a clear and professional male news-reading voice. He speaks at a moderate speed with a natural and expressive tone. The recording is very clear and has no background noise.",
  "parler-karthik": "Karthik speaks in Tamil in a natural and friendly male voice. He speaks with moderate speed and standard expression. The recording is clean.",
  "parler-vasanth": "Vasanth speaks in Tamil in a deep, calm male voice. He speaks slowly and clearly with a warm, professional tone. The recording is clear.",
  "parler-arvind": "Arvind speaks in Tamil in a fast-paced, energetic male voice. He speaks with an expressive and active tone. The recording is clear."
};

import { database } from "@/lib/database";

export const parlerSpeechProvider: SpeechProvider = {
  async synthesize(text: string, outputPath: string, voice: string, language?: OutputLanguage, projectId?: number): Promise<void> {
    console.log(`[ParlerSpeechProvider] Requesting TTS generation for text to: ${outputPath} with voice: ${voice}`);
    
    let voiceDescription = "";
    if (language === "ta") {
      // Direct lookup from our new voice mapping
      voiceDescription = voicePromptDescriptions[voice] || voicePromptDescriptions["parler-jaya"];
    }

    let sessionId = `tts-${Date.now()}`;
    if (projectId) {
      try {
        const db = database();
        const row = db.prepare("SELECT session_id FROM auto_news_logs WHERE project_id = ? LIMIT 1").get(projectId) as { session_id: string } | undefined;
        if (row?.session_id) sessionId = row.session_id;
      } catch {}
    }

    // Send the request directly to the local Flask sidecar worker's /generate-tts endpoint
    const response = await callSidecar("generate-tts", {
      text,
      outputPath,
      voiceDescription,
      projectId,
      sessionId
    });

    if (!response || !response.success) {
      throw new Error(`Parler-TTS sidecar call failed: ${response?.error || "Unknown error"}`);
    }

    console.log(`✓ [ParlerSpeechProvider] Generated audio saved successfully at: ${outputPath}`);
  }
};
