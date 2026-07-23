import fs from "node:fs";
import path from "node:path";
import { database } from "@/lib/database";
import { processProject } from "@/services/pipeline";
import { uploadToYoutube, setYoutubeThumbnail, youtubeChannelInfo } from "@/services/providers/youtube";
import { thumbnailPath } from "@/lib/thumbnails";
import { generateAutoThumbnail } from "@/services/render/thumbnail-generator";

export const REGIONS = [
  { name: "Tamil Nadu", tamilName: "தமிழ்நாடு", query: "Tamil+Nadu+news", hl: "ta", gl: "IN", ceid: "IN:ta" },
  { name: "Sri Lanka", tamilName: "இலங்கை", query: "Sri+Lanka+news", hl: "en-LK", gl: "LK", ceid: "LK:en" },
  { name: "UK", tamilName: "இங்கிலாந்து", query: "UK+news", hl: "en-GB", gl: "GB", ceid: "GB:en" },
  { name: "Germany", tamilName: "ஜெர்மனி", query: "Germany+news", hl: "de", gl: "DE", ceid: "DE:de" },
  { name: "France", tamilName: "பிரான்ஸ்", query: "France+news", hl: "fr", gl: "FR", ceid: "FR:fr" }
];

export type Region = typeof REGIONS[number];

const tamilMonths = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];

function getTamilDate(): string {
  const now = new Date();
  return `${now.getDate()} ${tamilMonths[now.getMonth()]} ${now.getFullYear()}`;
}

function getTimeOfDay(): "காலை" | "மாலை" {
  const hour = new Date().getHours();
  return hour < 14 ? "காலை" : "மாலை";
}

function extractAllItems(xml: string) {
  const items: { link: string; title: string }[] = [];
  const matches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of matches) {
    const itemContent = match[1];
    const linkMatch = itemContent.match(/<link>([^<]+)<\/link>/i);
    const titleMatch = itemContent.match(/<title>([^<]+)<\/title>/i);
    if (linkMatch && titleMatch) {
      items.push({
        link: linkMatch[1].trim(),
        title: titleMatch[1].trim()
      });
    }
  }
  return items;
}

export function isAutoNewsEnabled(): boolean {
  try {
    const db = database();
    const row = db.prepare("SELECT enabled FROM auto_news_settings WHERE id=1").get() as { enabled: number } | undefined;
    return row?.enabled === 1;
  } catch {
    return false;
  }
}

export function setAutoNewsEnabled(enabled: boolean): void {
  const db = database();
  db.prepare("UPDATE auto_news_settings SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(enabled ? 1 : 0);
}

export function isAutoShortsEnabled(): boolean {
  try {
    const db = database();
    const row = db.prepare("SELECT shorts_enabled FROM auto_news_settings WHERE id=1").get() as { shorts_enabled: number } | undefined;
    return row?.shorts_enabled === 1;
  } catch {
    return false;
  }
}

export function setAutoShortsEnabled(enabled: boolean): void {
  const db = database();
  db.prepare("UPDATE auto_news_settings SET shorts_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(enabled ? 1 : 0);
}

export function getAutoNewsVoice(): string {
  try {
    const db = database();
    const row = db.prepare("SELECT selected_voice FROM auto_news_settings WHERE id=1").get() as { selected_voice: string } | undefined;
    return row?.selected_voice || "parler-jaya";
  } catch {
    return "parler-jaya";
  }
}

export function setAutoNewsVoice(voice: string): void {
  const db = database();
  db.prepare("UPDATE auto_news_settings SET selected_voice=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(voice);
}

export type AutoNewsTtsMode = "free" | "paid";

export function getAutoNewsTtsMode(): AutoNewsTtsMode {
  try {
    const db = database();
    const row = db.prepare("SELECT tts_mode FROM auto_news_settings WHERE id=1").get() as { tts_mode: string } | undefined;
    return row?.tts_mode === "paid" ? "paid" : "free";
  } catch {
    return "free";
  }
}

export function setAutoNewsTtsMode(mode: AutoNewsTtsMode): void {
  const db = database();
  db.prepare("UPDATE auto_news_settings SET tts_mode=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(mode);
}

// tts_provider column value for the `projects` INSERT: 'gemini' (paid) or 'local' (free →
// parlerSpeechProvider picks it up for Tamil output, see services/pipeline.ts).
function ttsProviderColumnValue(): "gemini" | "local" {
  return getAutoNewsTtsMode() === "paid" ? "gemini" : "local";
}

// ── Live Progress Logging ────────────────────────────────────────────────────
export type LogStatus = "running" | "done" | "error" | "info";

export function writeLog(sessionId: string, step: string, message: string, status: LogStatus = "running", region?: string, projectId?: number) {
  try {
    const db = database();
    db.prepare(
      "INSERT INTO auto_news_logs (session_id, project_id, region, step, message, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, projectId ?? null, region ?? null, step, message, status);
  } catch { /* never crash the pipeline due to logging */ }
}

export function getRecentLogs(limit = 60) {
  try {
    const db = database();
    return db.prepare(
      "SELECT id, session_id, project_id, region, step, message, status, created_at FROM auto_news_logs ORDER BY id DESC LIMIT ?"
    ).all(limit) as { id: number; session_id: string; project_id: number | null; region: string | null; step: string; message: string; status: string; created_at: string }[];
  } catch { return []; }
}

export function clearOldLogs() {
  try {
    const db = database();
    // Keep only last 200 log entries
    db.prepare("DELETE FROM auto_news_logs WHERE id NOT IN (SELECT id FROM auto_news_logs ORDER BY id DESC LIMIT 200)").run();
  } catch {}
}

// Check if a news story has already been generated in the last 24 hours
export function isNewsAlreadyProcessed(title: string): boolean {
  try {
    const db = database();
    const rows = db.prepare(
      "SELECT transcript FROM projects WHERE created_at >= datetime('now', '-24 hours')"
    ).all() as { transcript: string | null }[];
    
    const cleanedTitle = title.trim().toLowerCase();
    for (const row of rows) {
      if (!row.transcript) continue;
      const cleanedTranscript = row.transcript.trim().toLowerCase();
      if (cleanedTranscript.includes(cleanedTitle) || cleanedTitle.includes(cleanedTranscript)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error("[Auto-News] Duplicate check error:", err);
    return false;
  }
}

// Collect top N news items from all regions (2 per region = 10 total)
async function fetchTopNewsAcrossRegions(perRegion = 2): Promise<{ title: string; region: Region }[]> {
  const results: { title: string; region: Region }[] = [];
  for (const region of REGIONS) {
    try {
      const feedUrl = `https://news.google.com/rss/search?q=${region.query}&hl=${region.hl}&gl=${region.gl}&ceid=${region.ceid}`;
      const res = await fetch(feedUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = extractAllItems(xml).slice(0, perRegion);
      for (const item of items) {
        results.push({ title: item.title, region });
      }
    } catch (err) {
      console.warn(`[Auto-Shorts] RSS fetch failed for ${region.name}:`, err);
    }
  }
  return results;
}

// Generate and upload a single Short for a given news item
async function processOneShort(title: string, region: Region, index: number, sessionId: string): Promise<void> {
  const tamilDate = getTamilDate();
  const timeOfDay = getTimeOfDay();
  const initialTitle = `${region.tamilName} | ${title.slice(0, 60)} | #Shorts`;
  const instruction = `இது ${region.tamilName} பகுதியின் முக்கியச் செய்தி: "${title}". இதை வந்து 20 முதல் 60 விநாடிகள் நீளமுள்ள, ஆர்வமூட்டும் தமிழ் YouTube Shorts ஸ்கிரிப்டாக எழுதவும். குறுகியதாகவும் தெளிவாகவும் இருக்கட்டும்.`;

  writeLog(sessionId, "attempt", `🔄 Short (${index + 1}/10) — "${title.slice(0, 50)}..."`, "running", region.tamilName);

  const voice = getAutoNewsVoice();
  const ttsProvider = ttsProviderColumnValue();
  const db = database();
  const insert = db.prepare(`
    INSERT INTO projects (
      youtube_url, source_type, script_mode, start_time, end_time,
      stance, tone, persona, voice, tts_provider,
      aspect_ratio, duration, transcript, output_language, status, custom_instruction, video_style,
      tier, cta_enabled, cta_position, b_roll_source, split_shorts_enabled, auto_approve
    ) VALUES ('', 'text', 'rewrite', '00:00', '00:00', 'நடுநிலை', 'இயல்பான', 'யூடியூபர்', ?, ?, '9:16', '60 விநாடிகள்', ?, 'ta', 'queued', ?, 'standard', 'premium', 0, 'end', 'stock', 0, 1)
  `);

  const result = insert.run(voice, ttsProvider, title, instruction);
  const projectId = Number(result.lastInsertRowid);
  writeLog(sessionId, "project", `📝 Project #${projectId} உருவாக்கப்பட்டது`, "running", region.tamilName, projectId);

  writeLog(sessionId, "script", `✍️ Gemini AI தமிழ் Shorts ஸ்கிரிப்ட் எழுதுகிறது...`, "running", region.tamilName, projectId);
  const pipelineResult = await processProject(projectId);

  const statusRow = db.prepare("SELECT status FROM projects WHERE id=?").get(projectId) as { status: string } | undefined;
  const currentStatus = statusRow?.status ?? pipelineResult.status;

  if (currentStatus === "tts") writeLog(sessionId, "tts", `🎤 Shorts Voice (Parler-TTS) generate ஆகிறது...`, "running", region.tamilName, projectId);
  if (currentStatus === "stock-media") writeLog(sessionId, "broll", `🎬 Shorts B-Roll கிளிப்கள் தேடுகிறோம்...`, "running", region.tamilName, projectId);
  if (currentStatus === "render") writeLog(sessionId, "render", `🎞️ Shorts Video render ஆகிறது...`, "running", region.tamilName, projectId);

  const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;
  if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
    throw new Error(`Short video file missing for project #${projectId}`);
  }
  writeLog(sessionId, "render", `✅ Shorts Video render முடிந்தது!`, "done", region.tamilName, projectId);

  let tamilTitle = title;
  try {
    const jobRow = db.prepare("SELECT payload FROM render_jobs WHERE project_id = ?").get(projectId) as { payload: string } | undefined;
    if (jobRow?.payload) {
      const payload = JSON.parse(jobRow.payload);
      if (payload.title) {
        tamilTitle = payload.title;
      }
    }
  } catch {}

  const shortsVideoTitle = `${region.tamilName} | ${tamilTitle.slice(0, 60)} | #Shorts`;

  // Generate automated free thumbnail (Pexels bg + Tamil text)
  try {
    writeLog(sessionId, "thumbnail", `🎨 Shorts Thumbnail (Pexels + Tamil Text) generate ஆகிறது...`, "running", region.tamilName, projectId);
    await generateAutoThumbnail({
      projectId,
      keyword: `${region.name} news`,
      title: tamilTitle,
      footerText: `${region.tamilName} செய்திகள்  |  Shorts`,
      aspectRatio: "9:16"
    });
  } catch (thumbErr: any) {
    console.error("Shorts thumbnail generation failed:", thumbErr.message || thumbErr);
  }

  // Verify correct channel is connected (do not upload news to devotional channel)
  const channel = await youtubeChannelInfo().catch(() => null);
  if (channel) {
    const isSivanArul = channel.title.toLowerCase().includes("sivan") || 
                        channel.title.toLowerCase().includes("arul") || 
                        channel.title.includes("சிவன்") || 
                        channel.title.includes("அருள்");
    if (isSivanArul) {
      writeLog(sessionId, "upload", `⚠️ பக்தி சேனல் '${channel.title}' இணைக்கப்பட்டுள்ளது. செய்தி ஷார்ட்ஸ் பதிவேற்றம் தவிர்க்கப்பட்டது.`, "info", region.tamilName, projectId);
      writeLog(sessionId, "complete", `🎉 Shorts completed! (Saved locally only)`, "done", region.tamilName, projectId);
      return;
    }
  }

  writeLog(sessionId, "upload", `📤 Shorts YouTube-ல் upload ஆகிறது...`, "running", region.tamilName, projectId);
  const ytResult = await uploadToYoutube({
    filePath: path.resolve(row.output_path),
    title: shortsVideoTitle.slice(0, 100),
    description: `${shortsVideoTitle}\n\n${row.review_script || ""}\n\n#${region.tamilName.replace(/\s+/g, "")}செய்திகள் #tamilnews #shorts #${timeOfDay}செய்திகள்`,
    tags: ["shorts", "tamilnews", "news", region.name.toLowerCase(), `${timeOfDay}செய்திகள்`],
    privacyStatus: "public"
  });

  writeLog(sessionId, "upload", `✅ Shorts YouTube upload வெற்றி! ID: ${ytResult.videoId}`, "done", region.tamilName, projectId);

  const thumb = thumbnailPath(projectId);
  if (thumb && fs.existsSync(thumb)) {
    try { await setYoutubeThumbnail(ytResult.videoId, thumb); } catch {}
  }
  writeLog(sessionId, "complete", `🎉 Shorts completed! Video ID: ${ytResult.videoId}`, "done", region.tamilName, projectId);
}

export async function runAutoShortsPipeline(hourIndex: number, sessionId?: string): Promise<void> {
  const sid = sessionId ?? `shorts-${Date.now()}`;
  writeLog(sid, "start", `📱 Shorts generation தொடங்குகிறது (Slot ${hourIndex})...`, "running");
  
  writeLog(sid, "rss", `🌐 Top News across all regions எடுக்கிறோம்...`, "running");
  const allNews = await fetchTopNewsAcrossRegions(5); // Fetch top 5 per region (total 25) for fallback
  if (allNews.length === 0) {
    writeLog(sid, "rss", `⚠️ செய்திகள் எதுவும் கிடைக்கவில்லை`, "error");
    return;
  }
  
  // Filter out any news stories already processed in the last 24 hours
  const freshNews = allNews.filter(item => !isNewsAlreadyProcessed(item.title));
  if (freshNews.length === 0) {
    writeLog(sid, "rss", `⚠️ புதிய செய்திகள் எதுவும் கிடைக்கவில்லை (அனைத்தும் ஏற்கனவே பயன்படுத்தப்பட்டுள்ளது)`, "error");
    return;
  }

  writeLog(sid, "rss", `✅ ${freshNews.length} புதிய செய்திகள் உள்ளன.`, "done");

  // Pick the slot item from the filtered fresh news list
  const slotIndex = hourIndex % freshNews.length;
  const item = freshNews[slotIndex];
  try {
    await processOneShort(item.title, item.region, slotIndex, sid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog(sid, "error", `❌ Shorts தோல்வி: ${msg.slice(0, 100)}`, "error", item.region.tamilName);
  }
  clearOldLogs();
}

export async function runAllShortsPipelineManual(sessionId?: string): Promise<void> {
  const sid = sessionId ?? `shorts-all-${Date.now()}`;
  writeLog(sid, "start", `📱 10 Shorts அப்லோடு க்யூ தொடங்குகிறது...`, "running");
  
  writeLog(sid, "rss", `🌐 Top News across all regions எடுக்கிறோம்...`, "running");
  const allNews = await fetchTopNewsAcrossRegions(5); // Fetch top 5 per region (total 25)
  if (allNews.length === 0) {
    writeLog(sid, "rss", `⚠️ செய்திகள் எதுவும் கிடைக்கவில்லை`, "error");
    return;
  }

  // Filter out duplicates and take the top 10 fresh news items
  const freshNews = allNews.filter(item => !isNewsAlreadyProcessed(item.title)).slice(0, 10);
  if (freshNews.length === 0) {
    writeLog(sid, "rss", `⚠️ புதிய செய்திகள் எதுவும் கிடைக்கவில்லை (அனைத்தும் ஏற்கனவே பயன்படுத்தப்பட்டுள்ளது)`, "error");
    return;
  }
  writeLog(sid, "rss", `✅ ${freshNews.length} புதிய செய்திகள் சேகரிக்கப்பட்டன.`, "done");

  for (let i = 0; i < freshNews.length; i++) {
    const item = freshNews[i];
    writeLog(sid, "info", `📱 Short ${i + 1}/${freshNews.length} தொடங்குகிறது: ${item.region.tamilName}...`, "running");
    try {
      await processOneShort(item.title, item.region, i, sid);
      writeLog(sid, "done", `✅ Short ${i + 1}/${freshNews.length} வெற்றி: ${item.region.tamilName}`, "done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeLog(sid, "error", `❌ Short ${i + 1}/${freshNews.length} தோல்வி: ${msg.slice(0, 100)}`, "error", item.region.tamilName);
    }
  }
  writeLog(sid, "complete", `🎉 அனைத்து ${freshNews.length} Shorts அப்லோடு செய்யப்பட்டன!`, "done");
  clearOldLogs();
}

export async function runAutoNewsPipelineForRegion(region: any, sessionId?: string): Promise<void> {
  const sid = sessionId ?? `news-${region.name}-${Date.now()}`;
  const timeOfDay = getTimeOfDay();
  const tamilDate = getTamilDate();

  try {
    writeLog(sid, "start", `🗞️ ${region.tamilName} — ${timeOfDay} செய்திகள் தொகுப்பு தொடங்குகிறது...`, "running", region.tamilName);

    // 1. Fetch Google News RSS for region
    writeLog(sid, "rss", `🌐 Google News-ல் ${region.tamilName} செய்திகள் தேடுகிறோம்...`, "running", region.tamilName);
    const allNews = await fetchTopNewsAcrossRegions(15);
    const regionNews = allNews.filter(item => item.region.name === region.name);

    // Filter to fresh news items (up to 10 items)
    const freshItems = regionNews.filter(item => !isNewsAlreadyProcessed(item.title)).slice(0, 10);

    if (freshItems.length === 0) {
      writeLog(sid, "rss", `⚠️ புதிய செய்திகள் எதுவும் இல்லை`, "done", region.tamilName);
      return;
    }

    writeLog(sid, "rss", `✅ ${freshItems.length} புதிய செய்திகள் சேகரிக்கப்பட்டன.`, "done", region.tamilName);

    // Mark as processed
    for (const item of freshItems) {
      database().prepare("INSERT OR IGNORE INTO processed_news (title) VALUES (?)").run(item.title);
    }

    const combinedNewsText = freshItems.map((item, idx) => `செய்தி ${idx + 1}: ${item.title}`).join("\n\n");
    const videoTitleDefault = `${region.tamilName} செய்திகள் தொகுப்பு | ${tamilDate} | ${timeOfDay} செய்திகள்`;
    const newsInstruction = `இது ${region.tamilName} பகுதியின் இன்றைய (${tamilDate}) ${timeOfDay} முக்கிய ${freshItems.length} செய்திகளின் தொகுப்பு வீடியோ ஸ்கிரிப்ட்.

தயவுசெய்து பின்வரும் செய்திகள் ஒவ்வொன்றையும் மிகவும் விரிவாக விவரித்து, ஒரு முழுமையான, தகவல் நிரம்பிய, ஆர்வத்தைத் தூண்டும் தமிழ் நியூஸ் வீடியோ ஸ்கிரிப்ட் (16:9 Landscape) எழுதவும்:

${combinedNewsText}

முக்கிய வழிகாட்டல்கள்:
1. வழங்கப்பட்டுள்ள செய்திகள் ஒவ்வொன்றும் ஒரு தனிப்பிரிவாக (Section/Scene) வர வேண்டும்.
2. ஒவ்வொரு செய்திப் பிரிவைப்பற்றியும் குறைந்தது 4 முதல் 5 வாக்கியங்கள் (4-5 detailed sentences per news item) கொண்ட விரிவான செய்திக் குறிப்பு எழுத வேண்டும். சுருக்கமாக எழுதக் கூடாது.
3. ஒவ்வொரு செய்திக்கும் இடையே இயல்பான, தடையற்ற செய்தி வாசிப்பு இணைப்பு வாக்கியங்கள் (Smooth news transitions) இருக்க வேண்டும்.
4. செய்தி வாசிப்பாளர் பாணியில் (News Anchor voiceover script) எழுத வேண்டும்.
5. கால அளவு: ஒவ்வொரு செய்தியும் விரிவாக விவரிக்கப்பட்டு, மொத்த வீடியோ குறைந்தது 5 முதல் 7 நிமிடங்கள் வரை ஓட வேண்டும்.`;

    const voice = getAutoNewsVoice();
    const ttsProvider = ttsProviderColumnValue();
    const db = database();
    const insert = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time,
        stance, tone, persona, voice, tts_provider,
        aspect_ratio, duration, transcript, output_language, status, custom_instruction, video_style,
        tier, cta_enabled, cta_position, b_roll_source, split_shorts_enabled, auto_approve
      ) VALUES ('', 'text', 'rewrite', '00:00', '00:00', 'நடுநிலை', 'இயல்பான', 'யூடியூபர்', ?, ?, '16:9', 'ஆட்டோ — voice முடியும் வரை', ?, 'ta', 'queued', ?, 'standard', 'premium', 0, 'end', 'stock', 0, 1)
    `);

    const result = insert.run(voice, ttsProvider, combinedNewsText, newsInstruction);
    const projectId = Number(result.lastInsertRowid);
    writeLog(sid, "project", `📝 Project #${projectId} உருவாக்கப்பட்டது`, "running", region.tamilName, projectId);

    writeLog(sid, "script", `✍️ Gemini AI தமிழ் செய்தித் தொகுப்பை எழுதுகிறது...`, "running", region.tamilName, projectId);
    const pipelineResult = await processProject(projectId);

    // Read current pipeline status from DB for accurate step info
    const statusRow = db.prepare("SELECT status FROM projects WHERE id=?").get(projectId) as { status: string } | undefined;
    const currentStatus = statusRow?.status ?? pipelineResult.status;

    if (currentStatus === "tts") writeLog(sid, "tts", `🎤 Tamil Voice (Parler-TTS) generate ஆகிறது...`, "running", region.tamilName, projectId);
    if (currentStatus === "stock-media") writeLog(sid, "broll", `🎬 B-Roll வீடியோ கிளிப்கள் தேடுகிறோம்...`, "running", region.tamilName, projectId);
    if (currentStatus === "render") writeLog(sid, "render", `🎞️ Video render ஆகிறது...`, "running", region.tamilName, projectId);

    const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;
    if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
      throw new Error(`Video file missing for project #${projectId}`);
    }
    writeLog(sid, "render", `✅ Video render முடிந்தது!`, "done", region.tamilName, projectId);

    // Extract Gemini-generated Tamil news title from render jobs
    let videoTitle = videoTitleDefault;
    try {
      const jobRow = db.prepare("SELECT payload FROM render_jobs WHERE project_id = ?").get(projectId) as { payload: string } | undefined;
      if (jobRow?.payload) {
        const payload = JSON.parse(jobRow.payload);
        if (payload.title) {
          videoTitle = `${payload.title} | ${tamilDate}`;
        }
      }
    } catch {}

    // Generate automated free thumbnail (Pexels bg + Tamil text)
    try {
      writeLog(sid, "thumbnail", `🎨 Video Thumbnail (Pexels + Tamil Text) generate ஆகிறது...`, "running", region.tamilName, projectId);
      await generateAutoThumbnail({
        projectId,
        keyword: `${region.name} news city`,
        title: videoTitle,
        footerText: `${region.tamilName} செய்திகள்  |  ${timeOfDay} செய்திகள்`,
        aspectRatio: "16:9"
      });
    } catch (thumbErr: any) {
      console.error("Long video thumbnail generation failed:", thumbErr.message || thumbErr);
    }

    // Verify correct channel is connected (do not upload news to devotional channel)
    const channel = await youtubeChannelInfo().catch(() => null);
    if (channel) {
      const isSivanArul = channel.title.toLowerCase().includes("sivan") || 
                          channel.title.toLowerCase().includes("arul") || 
                          channel.title.includes("சிவன்") || 
                          channel.title.includes("அருள்");
      if (isSivanArul) {
        writeLog(sid, "upload", `⚠️ பக்தி சேனல் '${channel.title}' இணைக்கப்பட்டுள்ளது. செய்தி நீண்ட வீடியோ பதிவேற்றம் தவிர்க்கப்பட்டது.`, "info", region.tamilName, projectId);
        writeLog(sid, "complete", `🎉 ${region.tamilName} — ${timeOfDay} செய்திகள் — முழுமையாக முடிந்தது! (Saved locally only)`, "done", region.tamilName, projectId);
        return;
      }
    }

    writeLog(sid, "upload", `📤 YouTube-ல் upload ஆகிறது...`, "running", region.tamilName, projectId);
    const ytResult = await uploadToYoutube({
      filePath: path.resolve(row.output_path),
      title: videoTitle.slice(0, 100),
      description: `${videoTitle}\n\n${row.review_script || ""}\n\n#${region.tamilName.replace(/\s+/g, "")}செய்திகள் #tamilnews #news #${timeOfDay}செய்திகள் #செய்திதொகுப்பு`,
      tags: ["news", "tamilnews", region.name.toLowerCase(), `${timeOfDay} செய்திகள்`, "செய்திதொகுப்பு"],
      privacyStatus: "public"
    });

    writeLog(sid, "upload", `✅ YouTube upload வெற்றி! Video ID: ${ytResult.videoId}`, "done", region.tamilName, projectId);

    const thumb = thumbnailPath(projectId);
    if (thumb && fs.existsSync(thumb)) {
      try { await setYoutubeThumbnail(ytResult.videoId, thumb); } catch {}
    }

    writeLog(sid, "complete", `🎉 ${region.tamilName} — ${timeOfDay} செய்திகள் — முழுமையாக முடிந்தது!`, "done", region.tamilName, projectId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog(sid, "error", `❌ செய்தித் தொகுப்பு தயாரிப்பதில் தோல்வி: ${msg.slice(0, 100)}`, "error", region.tamilName);
  }
}

export async function runAllRegionsAutoNews() {
  const sid = `news-all-${Date.now()}`;
  writeLog(sid, "start", `🗓️ ${getTimeOfDay()} செய்திகள் — ${getTamilDate()} — ${REGIONS.length} நாடுகள் தொடங்குகிறது`, "info");
  for (const region of REGIONS) {
    await runAutoNewsPipelineForRegion(region, sid);
  }
  writeLog(sid, "complete", `🎉 அனைத்து நாடுகளும் முடிந்தன!`, "done");
  clearOldLogs();
}

export async function runSelectedRegionsAutoNews(regionNames: string[]) {
  const selected = REGIONS.filter(r => regionNames.includes(r.name));
  if (selected.length === 0) return;
  const sid = `news-manual-${Date.now()}`;
  writeLog(sid, "start", `🚀 Manual Trigger — ${selected.map(r => r.tamilName).join(", ")}`, "info");
  for (const region of selected) {
    await runAutoNewsPipelineForRegion(region, sid);
  }
  writeLog(sid, "complete", `✅ Manual trigger முடிந்தது!`, "done");
  clearOldLogs();
}
