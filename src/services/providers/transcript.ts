import { fetchTranscript } from "youtube-transcript";
import type { TranscriptProvider } from "./types";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

async function runYtDlp(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });
    let error = "";
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.slice(-1200) || `yt-dlp exit ${code}`)));
  });
}

async function fetchWithYtDlp(url: string) {
  const directory = path.join(config.mediaRoot, "transcript-cache", Date.now().toString());
  await fs.mkdir(directory, { recursive: true });
  const output = path.join(directory, "source.%(ext)s");
  await runYtDlp(["--skip-download", "--write-subs", "--write-auto-subs", "--sub-format", "json3", "--sub-langs", "all,-live_chat", "--output", output, url]);
  const subtitle = (await fs.readdir(directory)).find((file) => file.endsWith(".json3"));
  if (!subtitle) throw new Error("இந்த வீடியோவில் captions/transcript இல்லை");
  const data = JSON.parse(await fs.readFile(path.join(directory, subtitle), "utf8"));
  const segments = (data.events || []).flatMap((event: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }) => {
    const text = (event.segs || []).map((segment) => segment.utf8 || "").join("").replaceAll("\n", " ").trim();
    return text ? [{ startMs: event.tStartMs || 0, durationMs: event.dDurationMs || 0, text }] : [];
  });
  if (!segments.length) throw new Error("Caption file காலியாக உள்ளது");
  return { language: subtitle.split(".").at(-2) || "auto", segments };
}

export const youtubeTranscriptProvider: TranscriptProvider = {
  async fetch(url) {
    const parsed = new URL(url);
    const videoId = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : parsed.searchParams.get("v") || url;
    try {
      const result = await fetchTranscript(videoId);
      if (!result.length) throw new Error("Transcript காலியாக உள்ளது");
      return { language: result[0].lang || "auto", segments: result.map((item) => ({ startMs: item.offset, durationMs: item.duration, text: item.text })) };
    } catch {
      return fetchWithYtDlp(url);
    }
  },
};

export function selectTranscriptSegment(segments: Awaited<ReturnType<TranscriptProvider["fetch"]>>["segments"], startMs: number, endMs: number) {
  return segments.filter((item) => item.startMs < endMs && item.startMs + item.durationMs > startMs).map((item) => item.text).join(" ");
}
