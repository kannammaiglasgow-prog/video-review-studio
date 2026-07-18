import { database } from "@/lib/database";
import { callSidecar } from "./sidecar-manager";

export interface SearchResult {
  sceneId: number;
  fileId: number;
  filePath: string;
  relative_path: string;
  start: number;
  end: number;
  duration: number;
  description: string;
  score: number;
  orientation: "portrait" | "landscape";
  kind: "video" | "image";
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Check if query contains Tamil unicode characters
function isTamilText(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

// Simple translation utility using internal Gemini
async function translateQueryTamilToEnglish(text: string): Promise<string> {
  try {
    const { translateTamilToEnglish } = await import("../providers/gemini");
    return await translateTamilToEnglish(text);
  } catch {
    return text; // fallback to original if offline
  }
}

export async function searchLocalSemantic(query: string, orientation: "portrait" | "landscape" | "all" = "all", limit = 12): Promise<SearchResult[]> {
  try {
    const db = database();
    let searchQuery = query.trim();
    if (!searchQuery) return [];

    // Translate if query is in Tamil
    if (isTamilText(searchQuery)) {
      searchQuery = await translateQueryTamilToEnglish(searchQuery);
      console.log(`Translated Tamil query to: "${searchQuery}"`);
    }

    // 1. Get embedding vector for query from CLIP sidecar
    const res = await callSidecar("embed-text", { text: searchQuery }).catch(() => ({ vector: [] }));
    const queryVector = res.vector;
    if (!queryVector || queryVector.length === 0) {
      // Fallback: simple keyword search if CLIP is offline/fails
      return searchLocalKeywords(query, orientation, limit);
    }

    // 2. Fetch all embeddings from SQLite
    const embeddings = db.prepare("SELECT * FROM local_media_embeddings").all() as any[];
    const results: SearchResult[] = [];

    for (const emb of embeddings) {
      const vectorBuffer = emb.vector;
      const storedVector = new Float32Array(
        vectorBuffer.buffer,
        vectorBuffer.byteOffset,
        vectorBuffer.byteLength / 4
      );

      const score = cosineSimilarity(queryVector, storedVector);
      
      // Load scene and file details
      const scene = db.prepare("SELECT * FROM local_media_scenes WHERE id=?").get(emb.scene_id) as any | undefined;
      if (!scene) continue;

      const file = db.prepare("SELECT * FROM local_media_files WHERE id=?").get(emb.file_id) as any | undefined;
      if (!file) continue;

      // Filter by orientation if requested
      if (orientation !== "all" && file.orientation !== orientation) continue;

      const isImage = file.duration === 0.0;

      results.push({
        sceneId: scene.id,
        fileId: file.id,
        filePath: file.absolute_path,
        relative_path: file.relative_path,
        start: scene.start_time,
        end: scene.end_time,
        duration: scene.duration,
        description: scene.description || file.description || "Local asset",
        score,
        orientation: file.orientation as "portrait" | "landscape",
        kind: isImage ? "image" : "video"
      });
    }

    // Sort by highest cosine similarity score
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    console.error("Semantic search failed, falling back to keywords", err);
    return searchLocalKeywords(query, orientation, limit);
  }
}

export function searchLocalKeywords(query: string, orientation: "portrait" | "landscape" | "all" = "all", limit = 12): SearchResult[] {
  try {
    const db = database();
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return [];

    const orientationFilter = orientation !== "all" ? `AND f.orientation = '${orientation}'` : "";

    const rows = db.prepare(`
      SELECT s.*, f.absolute_path, f.relative_path, f.orientation, f.duration as file_duration, f.description as file_desc
      FROM local_media_scenes s
      JOIN local_media_files f ON s.file_id = f.id
      WHERE f.scan_status = 'completed' ${orientationFilter}
    `).all() as any[];

    const results: SearchResult[] = [];
    const keywords = cleanQuery.split(/\s+/).filter(Boolean);

    for (const row of rows) {
      let tagsList: string[] = [];
      try { tagsList = JSON.parse(row.tags || "[]"); } catch {}

      const description = row.description || row.file_desc || "";
      const textToSearch = `${row.relative_path} ${description} ${row.ocr_text || ""} ${tagsList.join(" ")}`.toLowerCase();

      // Check how many keywords match (scoring)
      let matches = 0;
      for (const kw of keywords) {
        if (textToSearch.includes(kw)) matches++;
      }

      if (matches > 0) {
        const isImage = row.file_duration === 0.0;
        const score = matches / keywords.length;

        results.push({
          sceneId: row.id,
          fileId: row.file_id,
          filePath: row.absolute_path,
          relative_path: row.relative_path,
          start: row.start_time,
          end: row.end_time,
          duration: row.duration,
          description: description || "Local clip",
          score,
          orientation: row.orientation as "portrait" | "landscape",
          kind: isImage ? "image" : "video"
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    console.error("Keyword search query failed", err);
    return [];
  }
}
