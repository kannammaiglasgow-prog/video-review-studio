export interface TransitionSoundEffect {
  enabled: boolean;
  asset: string; // E.g. '/audio/whoosh.wav'
  volume: number;
}

export interface TransitionPreset {
  id: string;
  name: string;
  category: "basic" | "slide" | "push" | "zoom" | "blur" | "glitch" | "light" | "shapes" | "wipe" | "rotation" | "cinematic" | "particles" | "distortion" | "social" | "action";
  engine: "fade" | "slide" | "push" | "zoom" | "blur" | "mask" | "wipe" | "rotation" | "overlay" | "particle" | "distortion" | "glitch";
  keywords: string[];
  emotions: string[];
  sceneTypes: string[];
  supportedPace: ("slow" | "medium" | "fast")[];
  defaultDurationFrames: number;
  minimumDurationFrames: number;
  maximumDurationFrames: number;
  defaultIntensity: number;
  supportsDirection: boolean;
  supportsColour: boolean;
  gpuCost: "low" | "medium" | "high";
  audioEffect?: TransitionSoundEffect;
}

export interface SceneTransitionSelection {
  transitionId: string;
  durationFrames: number;
  intensity: number;
  direction?: "left" | "right" | "up" | "down";
  colour?: string;
}

export interface RecommendationResult {
  transitionId: string;
  score: number;
  reason: string;
}
