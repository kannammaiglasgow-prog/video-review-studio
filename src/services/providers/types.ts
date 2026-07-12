export type TranscriptSegment = { startMs: number; durationMs: number; text: string };
export type StockAsset = { provider: "pexels" | "pixabay"; kind?: "video" | "image"; id: string; url: string; previewUrl?: string; width: number; height: number; attribution?: string };

export interface TranscriptProvider {
  fetch(url: string): Promise<{ language: string; segments: TranscriptSegment[] }>;
}

export interface ReviewProvider {
  createTamilScript(prompt: string): Promise<{ title: string; script: string; searchTerms: string[] }>;
}

export interface SpeechProvider {
  synthesize(text: string, outputPath: string, voice: string): Promise<void>;
}

export interface StockMediaProvider {
  search(query: string, orientation: "portrait" | "landscape"): Promise<StockAsset[]>;
}
