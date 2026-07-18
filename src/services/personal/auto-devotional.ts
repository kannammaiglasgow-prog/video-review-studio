import fs from "node:fs";
import path from "node:path";
import { database } from "@/lib/database";
import { processProject } from "@/services/pipeline";
import { writeLog } from "./auto-news"; // Reuse the logging function for unified dashboard support
import { uploadToYoutube, setYoutubeThumbnail, youtubeChannelInfo } from "@/services/providers/youtube";
import { generateAutoThumbnail } from "@/services/render/thumbnail-generator";
import { thumbnailPath } from "@/lib/thumbnails";

export const DEITIES = [
  { day: 0, name: "Surya_Kula", tamilName: "சூரிய பகவான்", searchKeywords: "rising sun, temple pond, village deity, village temple", topicPrompt: "சூரிய நமஸ்காரம் செய்வதன் நன்மைகள் மற்றும் குலதெய்வ வழிபாட்டின் முக்கியத்துவம்." },
  { day: 1, name: "Shiva", tamilName: "சிவபெருமான்", searchKeywords: "mount kailash, shiva statue, rudraksha, temple bells", topicPrompt: "சிவ சிந்தனைகள், திருவாசகம் பாடல் விளக்கம், அல்லது பிரதோஷ வழிபாட்டின் பலன்கள்." },
  { day: 2, name: "Murugan_Amman", tamilName: "முருகன் & அம்மன்", searchKeywords: "lord murugan, peacock feather, spear vel, amman deity", topicPrompt: "கந்த சஷ்டி கவசம் மகிமை, பழனி திருத்தல வரலாறு, அல்லது சக்தி அம்மன் பக்தி கதைகள்." },
  { day: 3, name: "Vishnu", tamilName: "மகாவிஷ்ணு", searchKeywords: "lord vishnu, krishna flute, conch shell, tulsi leaves", topicPrompt: "கண்ணன் லீலைகள், மகாவிஷ்ணுவின் பத்து அவதாரங்கள், அல்லது திருப்பதி ஏழுமலையான் மகிமை." },
  { day: 4, name: "Guru_Sai", tamilName: "குரு தட்சிணாமூர்த்தி & சாய் பாபா", searchKeywords: "sai baba, dakshinamurthy, yellow flowers, guru meditation", topicPrompt: "குருவின் முக்கியத்துவம், தட்சிணாமூர்த்தி வழிபாடு, அல்லது சீரடி சாய் பாபாவின் பொன்மொழிகள்." },
  { day: 5, name: "Laxmi_Durga", tamilName: "மகாலட்சுமி & துர்க்கை", searchKeywords: "mahalakshmi, lotus flower, temple oil lamp, gold coins", topicPrompt: "வெள்ளிக்கிழமை மகாலட்சுமி பூஜை முறைகள், லட்சுமி கடாட்சம், அல்லது துர்க்கை அம்மன் மந்திரங்கள்." },
  { day: 6, name: "Hanuman_Sani", tamilName: "அனுமன் & சனீஸ்வரன்", searchKeywords: "lord hanuman, hanuman statue, temple entrance, sacred fire", topicPrompt: "அனுமன் சாலிசா பலன்கள், சனிக்கிழமை அனுமன் வழிபாடு, அல்லது சனி தோஷ பரிகாரங்கள்." }
];

export type Deity = typeof DEITIES[number];

export function getISTDay(): number {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5)); // UTC+5.5 (Indian Standard Time)
  return ist.getDay();
}

export function getTodayDeity(): Deity {
  const day = getISTDay();
  return DEITIES.find(d => d.day === day) || DEITIES[1]; // Fallback to Monday (Shiva)
}

export function isAutoDevotionalEnabled(): boolean {
  try {
    const db = database();
    const row = db.prepare("SELECT enabled FROM auto_devotional_settings WHERE id=1").get() as { enabled: number } | undefined;
    return row?.enabled === 1;
  } catch {
    return false;
  }
}

export function setAutoDevotionalEnabled(enabled: boolean): void {
  const db = database();
  db.prepare("UPDATE auto_devotional_settings SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(enabled ? 1 : 0);
}

export function isAutoDevotionalShortsEnabled(): boolean {
  try {
    const db = database();
    const row = db.prepare("SELECT shorts_enabled FROM auto_devotional_settings WHERE id=1").get() as { shorts_enabled: number } | undefined;
    return row?.shorts_enabled === 1;
  } catch {
    return false;
  }
}

export function setAutoDevotionalShortsEnabled(enabled: boolean): void {
  const db = database();
  db.prepare("UPDATE auto_devotional_settings SET shorts_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(enabled ? 1 : 0);
}

export function getAutoDevotionalVoice(): string {
  try {
    const db = database();
    const row = db.prepare("SELECT selected_voice FROM auto_devotional_settings WHERE id=1").get() as { selected_voice: string } | undefined;
    return row?.selected_voice || "parler-jaya";
  } catch {
    return "parler-jaya";
  }
}

export function setAutoDevotionalVoice(voice: string): void {
  const db = database();
  db.prepare("UPDATE auto_devotional_settings SET selected_voice=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(voice);
}

export async function runAutoDevotionalPipelineForDeity(deity: Deity, isShorts: boolean, sessionId: string) {
  const db = database();
  const voice = getAutoDevotionalVoice();
  const format = isShorts ? "9:16" : "16:9";
  const duration = isShorts ? "60 விநாடிகள்" : "5 நிமிடங்கள்";
  const label = isShorts ? "Shorts" : "நீண்ட வீடியோ";
  const logPrefix = `🕉️ சிவன் அருள் (${label}) — ${deity.tamilName}`;

  writeLog(sessionId, "start", `${logPrefix} பக்தி வீடியோ தயாரிப்பு தொடங்குகிறது...`, "running", deity.tamilName);

  // Define devotional content prompts
  let prompt = "";
  let customInstruction = "தமிழில் வாசிப்பதற்கு மிகவும் அமைதியாகவும், பக்தி உணர்வுடனும் இருக்க வேண்டும். எண்களோ அல்லது ஆங்கில எழுத்துக்களோ இருக்கக் கூடாது. சொற்கள் அனைத்தும் தமிழில் மட்டுமே எழுதப்பட வேண்டும்.";

  if (isShorts) {
    prompt = `இன்று ${deity.tamilName} வழிபாட்டிற்கு உகந்த நாள். இதையொட்டி, 1 நிமிடத்திற்குள் (30-60 வினாடி) பேசக்கூடிய எளிய பக்தி ஷார்ட்ஸ் (Shorts) ஸ்கிரிப்ட் எழுதவும். 
தலைப்பு: ${deity.topicPrompt} 
வழிமுறை: இதில் எந்தவொரு வாழ்த்துக்களோ, அறிமுக உரையோ இருக்கக் கூடாது (உடனே நேரடித் தகவலோடு தொடங்க வேண்டும்). ஒரு எளிய மந்திரம் அல்லது ஆன்மீக தத்துவத்தை விளக்குங்கள்.`;
  } else {
    prompt = `இன்று ${deity.tamilName} வழிபாட்டிற்கு உகந்த நாள். இதையொட்டி, 5 நிமிட கால அளவிலான வாசிப்பிற்குப் பொருத்தமான ஒரு விரிவான பக்தி வீடியோ ஸ்கிரிப்ட் எழுதவும்.
தலைப்பு: ${deity.topicPrompt}
வழிமுறை: சிவபெருமானின் மகிமை, கதைகள் அல்லது வழிபாட்டு முறைகளை விளக்கி, நேயர்களுக்குப் பக்தி உணர்வை ஊட்டும் வகையில் அமைய வேண்டும்.`;
  }

  try {
    const result = db.prepare(`
      INSERT INTO projects (
        youtube_url, source_type, script_mode, start_time, end_time,
        stance, tone, persona, voice, tts_provider, aspect_ratio, duration,
        custom_instruction, output_language, stock_keywords, allow_gemini_keywords,
        tier, video_style, status, cta_enabled, cta_position, split_shorts_enabled, auto_approve, transcript
      ) VALUES (
        '', 'local_folder', 'rewrite', '00:00', '00:00',
        'spiritual', 'Calm, peaceful, and confident', 'Devotional Guide', ?, 'gemini', ?, ?,
        ?, 'ta', ?, 1,
        'premium', 'devotional', 'queued', 0, 'end', 0, 1, ?
      )
    `).run(voice, format, duration, customInstruction, deity.searchKeywords, prompt);

    const projectId = Number(result.lastInsertRowid);
    writeLog(sessionId, "project", `📝 Project #${projectId} உருவாக்கப்பட்டது`, "running", deity.tamilName, projectId);

    writeLog(sessionId, "script", `✍️ Gemini AI தமிழ் பக்தி ஸ்கிரிப்ட் எழுதுகிறது...`, "running", deity.tamilName, projectId);
    
    // Process project asynchronously in background
    (async () => {
      const pipelineResult = await processProject(projectId);
      const row = db.prepare("SELECT output_path, review_script FROM projects WHERE id=?").get(projectId) as { output_path: string | null; review_script: string | null } | undefined;
      
      if (!row?.output_path || !fs.existsSync(path.resolve(row.output_path))) {
        throw new Error(`Video file missing for project #${projectId}`);
      }

      // Generate automated devotional thumbnail
      try {
        writeLog(sessionId, "thumbnail", `🎨 Video Thumbnail generate ஆகிறது...`, "running", deity.tamilName, projectId);
        await generateAutoThumbnail({
          projectId,
          keyword: deity.searchKeywords.split(",")[0],
          title: deity.tamilName + " வழிபாடு",
          footerText: `சிவன் அருள்  |  பக்தி கதைகள்`,
          aspectRatio: format
        });
      } catch (thumbErr: any) {
        console.error("Devotional thumbnail generation failed:", thumbErr.message || thumbErr);
      }

      // Verify correct Sivan Arul channel is connected
      const channel = await youtubeChannelInfo("devotional").catch(() => null);
      if (!channel) {
        writeLog(sessionId, "upload", `⚠️ YouTube இணைக்கப்படவில்லை. வீடியோ உள்ளூரில் மட்டும் சேமிக்கப்பட்டது.`, "info", deity.tamilName, projectId);
        writeLog(sessionId, "complete", `🎉 Video completed locally!`, "done", deity.tamilName, projectId);
        return;
      }

      const isSivanArul = channel.title.toLowerCase().includes("sivan") || 
                          channel.title.toLowerCase().includes("arul") || 
                          channel.title.includes("சிவன்") || 
                          channel.title.includes("அருள்");
      if (!isSivanArul) {
        writeLog(sessionId, "upload", `⚠️ இணைக்கப்பட்டுள்ள சேனல் '${channel.title}' சிவன் அருள் இல்லை. தானியங்கி பதிவேற்றம் தவிர்க்கப்பட்டது.`, "info", deity.tamilName, projectId);
        writeLog(sessionId, "complete", `🎉 Video completed locally!`, "done", deity.tamilName, projectId);
        return;
      }

      writeLog(sessionId, "upload", `📤 YouTube-ல் upload செய்யப்படுகிறது...`, "running", deity.tamilName, projectId);
      const ytResult = await uploadToYoutube({
        filePath: path.resolve(row.output_path),
        title: (isShorts ? `${deity.tamilName} பக்தி #shorts` : `${deity.tamilName} வழிபாட்டு சிறப்புகள் & ஆன்மீக கதைகள்`).slice(0, 100),
        description: `${deity.tamilName} வழிபாடு முறைகள் மற்றும் கதைகள்.\n\n${row.review_script || ""}\n\n#sivanarul #devotional #tamilgod`,
        tags: ["devotional", "sivanarul", "tamilgod", deity.name.toLowerCase()],
        privacyStatus: "public"
      }, "devotional");

      writeLog(sessionId, "upload", `✅ YouTube upload வெற்றி! ID: ${ytResult.videoId}`, "done", deity.tamilName, projectId);

      const thumb = thumbnailPath(projectId);
      if (thumb && fs.existsSync(thumb)) {
        try { await setYoutubeThumbnail(ytResult.videoId, thumb, "devotional"); } catch {}
      }

      writeLog(sessionId, "complete", `🎉 பக்தி வீடியோ முழுமையாக முடிந்தது! Video ID: ${ytResult.videoId}`, "done", deity.tamilName, projectId);
    })().catch(err => {
      console.error(`[Auto-Devotional] Project #${projectId} processing failed:`, err);
      writeLog(sessionId, "render", `❌ Project #${projectId} தோல்வி: ${err.message || err}`, "error", deity.tamilName, projectId);
    });

  } catch (err: any) {
    console.error("[Auto-Devotional] Pipeline trigger failed:", err);
    writeLog(sessionId, "start", `❌ பக்தி வீடியோ க்யூ செய்வதில் தோல்வி: ${err.message || err}`, "error", deity.tamilName);
  }
}

export async function runAllDeitiesAutoDevotional(isShorts = false) {
  const sessionId = `devo-${Date.now()}`;
  const deity = getTodayDeity();
  await runAutoDevotionalPipelineForDeity(deity, isShorts, sessionId);
}
