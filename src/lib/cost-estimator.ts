export type CostEstimateInput = {
  sourceType: "youtube" | "news" | "text" | "voiceover" | "local_folder";
  sourceText?: string;
  duration: string;
  ttsProvider: "local" | "gemini" | "upload";
  tier: "free" | "premium";
  allowGeminiKeywords: boolean;
};

export function estimateProjectCost(input: CostEstimateInput) {
  if (input.tier === "free") {
    return {
      estimatedCost: 0,
      breakdown: { script: 0, metadata: 0, tts: 0, keywords: 0 }
    };
  }

  let durationSeconds = 60;
  if (input.duration === "ஆட்டோ — voice முடியும் வரை" || input.duration.includes("ஆட்டோ")) {
    if (input.sourceText) {
      const words = input.sourceText.split(/\s+/).length;
      durationSeconds = Math.max(15, Math.min(300, Math.round(words / 2)));
    } else {
      durationSeconds = 60;
    }
  } else {
    const labelSeconds: Record<string, number> = {
      "15 விநாடிகள்": 15,
      "30 விநாடிகள்": 30,
      "60 விநாடிகள்": 60,
      "2 நிமிடங்கள்": 120,
      "5 நிமிடங்கள்": 300,
      "8 நிமிடங்கள்": 480,
      "10 நிமிடங்கள்": 600
    };
    durationSeconds = labelSeconds[input.duration] || 60;
  }

  // Clamping duration estimation based on input source text length if text is pasted.
  let estimatedSpeechDuration = durationSeconds;
  if (input.sourceText) {
    const wordCount = input.sourceText.split(/\s+/).filter(Boolean).length;
    const speechSecs = Math.max(10, Math.round(wordCount / 2));
    if (input.sourceType === "text") {
      estimatedSpeechDuration = Math.min(durationSeconds, speechSecs);
    }
  }

  // Gemini model rates (per 1M tokens)
  const inputRate = 0.075 / 1_000_000;
  const outputRate = 0.30 / 1_000_000;

  // 1. Script writing cost (if not voiceover)
  let scriptCost = 0;
  if (input.sourceType !== "voiceover") {
    const inputChars = input.sourceText?.length || 1000;
    const promptTokens = Math.max(800, Math.round(inputChars / 4) + 1200);
    const outputTokens = Math.round(estimatedSpeechDuration * 2.5) + 150;
    scriptCost = (promptTokens * inputRate) + (outputTokens * outputRate);
  }

  // 2. Metadata / Keyword extraction cost
  const scriptChars = (estimatedSpeechDuration * 12);
  const metadataPromptTokens = Math.max(400, Math.round(scriptChars / 4) + 800);
  const metadataOutputTokens = 150;
  const metadataCost = (metadataPromptTokens * inputRate) + (metadataOutputTokens * outputRate);

  // 3. TTS cost
  let ttsCost = 0;
  if (input.ttsProvider === "gemini" && input.sourceType !== "voiceover") {
    // approx 200 audio output tokens per second, charged at $20.00 per 1M tokens ($0.004 per second)
    // plus prompt input tokens
    ttsCost = (estimatedSpeechDuration * 0.004) + (200 * inputRate);
  }

  // 4. Keyword resolution cost
  let keywordsCost = 0;
  if (input.allowGeminiKeywords || input.sourceType === "voiceover") {
    const keywordPromptTokens = Math.max(400, Math.round(scriptChars / 4) + 800);
    const keywordOutputTokens = 150;
    keywordsCost = (keywordPromptTokens * inputRate) + (keywordOutputTokens * outputRate);
  }

  const total = scriptCost + metadataCost + ttsCost + keywordsCost;

  return {
    estimatedCost: parseFloat(total.toFixed(5)),
    breakdown: {
      script: parseFloat(scriptCost.toFixed(5)),
      metadata: parseFloat(metadataCost.toFixed(5)),
      tts: parseFloat(ttsCost.toFixed(5)),
      keywords: parseFloat(keywordsCost.toFixed(5))
    }
  };
}
