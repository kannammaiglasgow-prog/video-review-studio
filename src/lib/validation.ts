export type SourceType = "youtube" | "news" | "text";
export type ScriptMode = "rewrite" | "as-is";

export type ProjectInput = {
  url: string; sourceType: SourceType; scriptMode: ScriptMode; sourceText?: string; startTime: string; endTime: string;
  stance: string; tone: string; persona: string; voice: string; format: string; duration: string; customInstruction?: string;
};

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

export function validateProject(value: unknown): ProjectInput {
  if (!value || typeof value !== "object") throw new Error("தவறான request");
  const input = value as Record<string, unknown>;
  const sourceType: SourceType = input.sourceType === "news" ? "news" : input.sourceType === "text" ? "text" : "youtube";
  const scriptMode: ScriptMode = input.scriptMode === "as-is" ? "as-is" : "rewrite";
  const required = ["stance", "tone", "persona", "voice", "format", "duration"];
  if (sourceType !== "text") required.push("url");
  if (sourceType === "youtube") required.push("startTime", "endTime");
  for (const key of required) if (typeof input[key] !== "string" || !input[key]) throw new Error(`${key} தேவை`);

  if (sourceType === "text") {
    const sourceText = typeof input.sourceText === "string" ? input.sourceText.trim() : "";
    if (sourceText.length < 30) throw new Error("குறைந்தது 30 எழுத்துகள் கொண்ட உரையை paste செய்யவும்");
    return { ...(input as Omit<ProjectInput, "sourceType" | "scriptMode" | "url" | "startTime" | "endTime">), sourceType, scriptMode, sourceText, url: "text:pasted", startTime: "00:00", endTime: "00:00" };
  }

  let url: URL;
  try { url = new URL(String(input.url)); } catch { throw new Error(sourceType === "news" ? "சரியான news URL கொடுக்கவும்" : "சரியான YouTube URL கொடுக்கவும்"); }
  if (sourceType === "youtube" && !youtubeHosts.has(url.hostname)) throw new Error("YouTube URL மட்டும் பயன்படுத்தவும்");
  if (sourceType === "news") {
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("http/https URL மட்டும் பயன்படுத்தவும்");
    if (youtubeHosts.has(url.hostname)) throw new Error("News mode-ல் YouTube URL வேண்டாம் — YouTube mode-ஐ பயன்படுத்தவும்");
  }
  if (!["9:16", "16:9"].includes(String(input.format))) throw new Error("தவறான video வடிவம்");
  return { ...(input as Omit<ProjectInput, "sourceType" | "scriptMode">), sourceType, scriptMode, startTime: String(input.startTime || "00:00"), endTime: String(input.endTime || "00:00") };
}
