import type { OutputLanguage } from "@/lib/config";

export type TranscriptSegment = { startMs: number; durationMs: number; text: string };
export type StockAsset = { provider: "local" | "pexels" | "pixabay"; kind?: "video" | "image"; id: string; url: string; previewUrl?: string; width: number; height: number; attribution?: string };

export interface TranscriptProvider {
  fetch(url: string): Promise<{ language: string; segments: TranscriptSegment[] }>;
}

export interface ReviewProvider {
  createTamilScript(prompt: string, sceneCount: number, projectId?: number, image?: { mimeType: string; data: string }): Promise<{ title: string; script: string; searchTerms: string[]; sceneKeywords: string[][] }>;
}

export interface SpeechProvider {
  synthesize(text: string, outputPath: string, voice: string, language?: OutputLanguage, projectId?: number, storyId?: number): Promise<void>;
}

export interface StockMediaProvider {
  search(query: string, orientation: "portrait" | "landscape", limit?: number): Promise<StockAsset[]>;
}
