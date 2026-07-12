export type ProjectInput = {
  url: string; startTime: string; endTime: string; stance: string; tone: string;
  persona: string; voice: string; format: string; duration: string; customInstruction?: string;
};

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

export function validateProject(value: unknown): ProjectInput {
  if (!value || typeof value !== "object") throw new Error("தவறான request");
  const input = value as Record<string, unknown>;
  const required = ["url", "startTime", "endTime", "stance", "tone", "persona", "voice", "format", "duration"];
  for (const key of required) if (typeof input[key] !== "string" || !input[key]) throw new Error(`${key} தேவை`);
  let url: URL;
  try { url = new URL(String(input.url)); } catch { throw new Error("சரியான YouTube URL கொடுக்கவும்"); }
  if (!youtubeHosts.has(url.hostname)) throw new Error("YouTube URL மட்டும் பயன்படுத்தவும்");
  if (!["9:16", "16:9"].includes(String(input.format))) throw new Error("தவறான video வடிவம்");
  return input as ProjectInput;
}
