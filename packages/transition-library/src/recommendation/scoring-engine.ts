import { transitionPresets, transitionPresetsMap } from "../registry/transition-registry";
import type { RecommendationResult, TransitionPreset } from "../schemas/transition.schema";

export interface SceneMetadata {
  keywords: string[];
  emotion?: string;
  topic?: string;
  pace?: "slow" | "medium" | "fast";
  cameraMotion?: string;
}

export interface RecommendationOptions {
  currentScene: SceneMetadata;
  nextScene: SceneMetadata;
  videoStyle?: string;
  recentTransitionIds?: string[]; // Repetition control
}

// Map style parameters to preferred categories/presets
const styleCategoryPreferences: Record<string, string[]> = {
  documentary: ["basic", "blur"],
  cinematic: ["cinematic", "light", "blur"],
  news: ["push", "basic", "glitch"],
  social: ["social", "zoom", "action"],
  memories: ["blur", "basic", "light", "cinematic"],
  kids: ["shapes", "rotation", "particles"]
};

export function scoreTransition(
  preset: TransitionPreset,
  options: RecommendationOptions
): { score: number; reason: string } {
  const { currentScene, nextScene, videoStyle = "documentary", recentTransitionIds = [] } = options;

  let keywordScore = 0;
  let emotionScore = 0;
  let sceneTypeScore = 0;
  let paceScore = 0;
  let motionScore = 0;
  let styleScore = 0;
  let diversityScore = 1.0;

  const matchedKeywords: string[] = [];

  // 1. Keywords Match (30%)
  const sceneKeywords = new Set([
    ...(currentScene.keywords || []),
    ...(nextScene.keywords || [])
  ].map(k => k.toLowerCase().trim()));

  if (sceneKeywords.size > 0) {
    const presetKeywords = preset.keywords.map(k => k.toLowerCase());
    let matches = 0;
    for (const kw of presetKeywords) {
      if (sceneKeywords.has(kw)) {
        matches++;
        matchedKeywords.push(kw);
      }
    }
    keywordScore = matches > 0 ? Math.min(1.0, matches / 2) : 0;
  }

  // 2. Emotion Match (20%)
  const emotions = new Set<string>();
  if (currentScene.emotion) emotions.add(currentScene.emotion.toLowerCase());
  if (nextScene.emotion) emotions.add(nextScene.emotion.toLowerCase());
  
  if (emotions.size > 0) {
    const presetEmotions = preset.emotions.map(e => e.toLowerCase());
    const matches = presetEmotions.filter(e => emotions.has(e)).length;
    emotionScore = matches > 0 ? 1.0 : 0.05; // Base minor score if no mismatch
  } else {
    emotionScore = 0.5; // Neutral baseline
  }

  // 3. Scene Type/Topic Match (15%)
  const topics = new Set<string>();
  if (currentScene.topic) topics.add(currentScene.topic.toLowerCase());
  if (nextScene.topic) topics.add(nextScene.topic.toLowerCase());
  
  if (topics.size > 0) {
    const presetSceneTypes = preset.sceneTypes.map(t => t.toLowerCase());
    const matches = presetSceneTypes.filter(t => topics.has(t)).length;
    sceneTypeScore = matches > 0 ? 1.0 : 0.1;
  } else {
    sceneTypeScore = 0.5;
  }

  // 4. Pace Match (15%)
  const pace = nextScene.pace || currentScene.pace || "medium";
  if (preset.supportedPace.includes(pace)) {
    paceScore = 1.0;
  } else {
    paceScore = 0.1; // Penalty for pace mismatch (e.g. glitch on slow documentary)
  }

  // 5. Camera Motion Match (10%)
  const motions = new Set<string>();
  if (currentScene.cameraMotion) motions.add(currentScene.cameraMotion.toLowerCase());
  if (nextScene.cameraMotion) motions.add(nextScene.cameraMotion.toLowerCase());
  
  if (motions.size > 0) {
    const presetKeywords = preset.keywords.map(k => k.toLowerCase());
    const hasMotionMatch = Array.from(motions).some(m => presetKeywords.includes(m) || preset.id.includes(m));
    motionScore = hasMotionMatch ? 1.0 : 0.3;
  } else {
    motionScore = 0.5;
  }

  // 6. Style Preset Match (5%)
  const preferredCategories = styleCategoryPreferences[videoStyle.toLowerCase()] || ["basic"];
  if (preferredCategories.includes(preset.category)) {
    styleScore = 1.0;
  } else {
    styleScore = 0.2;
  }

  // 7. Diversity / Repetition Control (5%)
  if (recentTransitionIds.length > 0) {
    const lastId = recentTransitionIds[recentTransitionIds.length - 1];
    if (preset.id === lastId) {
      diversityScore = 0.0; // STRICT CONSECUTIVE BAN (0 weight)
    } else {
      const occurrences = recentTransitionIds.filter(id => id === preset.id).length;
      if (occurrences >= 2) {
        diversityScore = 0.2; // Cool-down penalty if used 2+ times in recent scenes
      }
    }
  }

  // Calculate Weighted Final Score
  const finalScore =
    (keywordScore * 0.30) +
    (emotionScore * 0.20) +
    (sceneTypeScore * 0.15) +
    (paceScore * 0.15) +
    (motionScore * 0.10) +
    (styleScore * 0.05) +
    (diversityScore * 0.05);

  // Generate a human-readable explanation reason
  let reason = "";
  if (matchedKeywords.length > 0) {
    reason = `Matches keywords: ${matchedKeywords.join(", ")}`;
  } else if (preset.category === preferredCategories[0]) {
    reason = `Fits overall ${videoStyle} video style`;
  } else if (preset.supportedPace.includes(pace)) {
    reason = `Complements the ${pace} visual pacing`;
  } else {
    reason = `Smooth fallback scene transition`;
  }

  return { score: Math.round(finalScore * 100) / 100, reason };
}

export function recommendTransitions(options: RecommendationOptions): RecommendationResult[] {
  const results = transitionPresets.map(preset => {
    const { score, reason } = scoreTransition(preset, options);
    return { transitionId: preset.id, score, reason };
  });

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}
