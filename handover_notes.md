# Project Handover Notes — Video Review Studio (Tamil Devotional & News Automation)

This document provides a comprehensive handover status for the next AI agent in **Codex / Dot Court** to resume development immediately.

---

## 🤖 Claude Session Update — 2026-07-18 (for the next agent, e.g. Antigravity)

Everything below happened in one Claude Code session after the last Codex handoff. Read this before touching the repo.

**1. Auto-Approve shipped (closes pending task #2 below).** `create/page.tsx` now has a checkbox that skips both script- and scene-approval gates and auto-uploads to YouTube once render completes (privacy defaults to "private"). Backend: `auto_approve` column + migration in `lib/database.ts` (it existed in the live DB already from Codex's other pipelines but had no migration — fixed), `lib/validation.ts`, `api/projects/route.ts`. `pipeline.ts` already supported the flag server-side.

**2. Repo synced to GitHub and pushed** (commit `dce839c`, public repo). 78 files that had been sitting locally-only for weeks — the whole Sivan Arul dashboard, personal media engine, reaction pipeline, transition library — are now committed. Excluded on purpose: `arial.ttf` (proprietary font, licensing risk on a public repo — now gitignored), `scratch/` (~70MB test artifacts), stray root `database.sqlite`/`review-studio.db` (0 bytes, junk), `.codex-dev.*.log`. Included: `public/audio/*.wav` (BGM assets, user confirmed rights).
   - **⚠️ GitHub push-protection caught a live Hugging Face token hardcoded in `src/services/personal/worker.py:130`.** Removed it, moved the value into gitignored `.env.local` as `HF_TOKEN`, added a placeholder to `.env.example`. **The user has NOT confirmed rotating that token yet** — remind them to do it at huggingface.co/settings/tokens if it comes up, since it sat in plaintext source before this session.

**3. New "Clear History" feature.** `api/projects/clear-history/route.ts` (POST) wipes every row in `projects` + `auto_news_logs`, and deletes every subfolder under `media/`. Wired to a 🗑️ button in the Create page's history drawer, behind a native `confirm()`. **This got used between messages in this session** — project count dropped from 328 rows / 86GB to 16, then grew again as the autonomous auto-news pipeline kept running. If you see project IDs jump by dozens with no user action, that's `schedule-auto-news.ts` running on its own schedule, not a bug.

**4. Found (and half-fixed) a real bug in `services/render/thumbnail-generator.ts`.** The Tamil webfont ("Mukta Malar") loads live from Google Fonts inside a Chrome `--headless --virtual-time-budget` window that was only 2000ms — too short for the CSS+font two-hop fetch, so text silently rendered as `?????` tofu boxes instead of Tamil glyphs. Fixed by bumping the budget to 8000ms and pinning an isolated `--user-data-dir` (both already committed). **However**: even after the fix, thumbnails generated *through the running `npm run dev` server* (i.e. via the actual API route, `POST /api/projects/[id]/generate-thumbnail`) still failed in this session, while running the *exact same* Chrome command directly from a plain shell worked every time. Root cause not fully found — smells like the dev server process (especially if started via an automation tool rather than the user's own interactive terminal) runs in a different Windows session/process context that breaks Chrome's font/text-shaping for child processes it spawns, even though basic screenshot/layout still works. **Worth a real look**: try reproducing by hitting `/api/projects/{id}/generate-thumbnail` from a terminal-launched dev server (not agent-launched) and see if it's clean — that would confirm the session-context theory.

**5. YouTube custom thumbnails are blocked on the Sivan Arul channel** — `thumbnails.set` returns `403 forbidden` because the channel isn't phone-verified. This is a YouTube platform requirement, not a code bug (`youtube.ts`'s `setYoutubeThumbnail` already has a Tamil error message anticipating exactly this). **User needs to verify at youtube.com/verify.** Two thumbnails are generated and sitting ready to push the moment that's done:
   - `media/projects/326/thumbnail_1784406699637.jpg` → video `zWeGB0fjBeo` (Mangadu Kamakshi Amman Temple)
   - `media/projects/pF6MHmPjTuU/thumbnail_1784414013753.jpg` → video `pF6MHmPjTuU` (Kannappa Nayanar)
   - To set once verified: refresh the OAuth token from `data/youtube-oauth.json`, then `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=<id>` with the image bytes and `Authorization: Bearer <token>` — see `setYoutubeThumbnail()` in `src/services/providers/youtube.ts` for the exact implementation.

**6. Two Kamakshi Amman Temple (Mangadu) devotional videos were generated as a one-off request**, one with Gemini TTS (project #325, rendered but never uploaded, gone from DB after Clear History but the render may still be at `media/325/` unless that got wiped too) and one with free local Parler-TTS "Ganga" voice (project #326, uploaded private, video `zWeGB0fjBeo`). Both used `tier: "premium"` for script generation even on the "free" one — free tier skips Gemini scripting entirely and just reads `sourceText` verbatim, so the free version reused the already-written Gemini script rather than paying for it twice.

**Still open from before:**
- Task #1 below (news-channel-specific "Change Channel" button on the main Create page) — still not implemented. Root issue: the main page's YouTube status panel and the Sivan Arul devotional page's panel both read the *same* default OAuth token slot conceptually, but in practice the main page is currently showing the **Sivan Arul (devotional) channel** connected, not a news channel — there's no UI path today to target the news-specific OAuth flow from the main page.

---

## 🕉️ அண்மைய மேம்பாடுகள் / Recent Accomplishments

### 1. மல்டி-சேனல் யூடியூப் இணைப்பு (Multi-Channel YouTube Integration)
*   **விளக்கம் / Description**: பயனருக்கு இரு வேறு யூடியூப் சேனல்கள் உள்ளன (செய்தி சேனல் & சிவன் அருள் பக்தி சேனல்). இரண்டையும் தனித்தனியாக இயக்க டோக்கன்களைப் பிரித்துள்ளோம்.
*   **கோப்பு / File**: [youtube.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/services/providers/youtube.ts)
*   **டோக்கன் கோப்புகள் / Token Files**:
    *   **செய்தி / News Channel Token**: `data/youtube-oauth.json`
    *   **பக்தி / Devotional Channel Token**: `data/youtube-oauth-devotional.json`
*   **API Endpoints**: 
    *   `/api/sivan-arul/youtube/status` (GET/DELETE)
    *   `/api/sivan-arul/youtube/auth` (GET - initiates login redirection)
    *   `/api/sivan-arul/youtube/callback` (GET - saves devotional token)

### 2. சிவன் அருள் பக்தி டேஷ்போர்டு (Sivan Arul Devotional Dashboard)
*   **கோப்பு / File**: [page.tsx](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/app/sivan-arul/page.tsx)
*   **விளக்கம் / Description**: குங்குமம் மற்றும் தங்கம் (Saffron/Gold) தீமில் பக்தி ஆட்டோமேஷன் மேலாண்மைப் பக்கம் உருவாக்கப்பட்டுள்ளது.
*   இதில் **பக்தி சேனல் யூடியூப் இணைப்பு அட்டை (YouTube Connection Panel)** உருவாக்கப்பட்டுள்ளது.

### 3. ஜெமினி தமிழ் குரல் (Gemini Native TTS Voiceover)
*   **விளக்கம் / Description**: லோக்கல் ஸ்பீச் எஞ்சின் (Parler-TTS) ரோபோட் போல இருந்ததால், `tts_provider = 'gemini'` ஆக மாற்றப்பட்டுள்ளது. 
*   இது **Gemini-2.5-Flash-Preview-TTS** மூலம் மிக மென்மையான, தத்ரூபமான தமிழ் குரலை உருவாக்குகிறது.

### 4. மருந்தீஸ்வரர் பக்தி வீடியோ (Marundeeswarar Temple Shorts)
*   **கோப்பு / File**: [route.ts (custom-shorts)](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/app/api/sivan-arul/custom-shorts/route.ts)
*   **விளக்கம் / Description**: திருவான்மியூர் மருந்தீஸ்வரர் கோவில் சிறப்புகள் பற்றிய 60 விநாடிகள் ஓடக்கூடிய தமிழ் பக்தி ஷார்ட்ஸ் வீடியோவை உருவாக்கி, பக்தி யூடியூப் சேனலில் அப்லோடு செய்ய இந்த பிரத்யேக API உருவாக்கப்பட்டது.
*   **வெற்றிகரமான சோதனை வீடியோ**: [https://youtu.be/aS_DTJqf4_k](https://youtu.be/aS_DTJqf4_k) (Project #324)

---

## 📂 முக்கிய கோப்புகள் & கட்டமைப்பு (Key Codebase Architecture)

*   **பக்தி தானியங்கி லாஜிக் / Devotional Pipeline**: [auto-devotional.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/services/personal/auto-devotional.ts)
*   **செய்தி தானியங்கி லாஜிக் / News Pipeline**: [auto-news.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/services/personal/auto-news.ts)
*   **வீடியோ ரெண்டரிங் லாஜிக் / Render Pipeline**: [pipeline.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/services/pipeline.ts)
*   **குரல் மேலாண்மை / Speech Provider**: [gemini.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/services/providers/gemini.ts) (Gemini Speech Synthesis)

---

## 🔮 அடுத்த கட்டப் பணிகள் (Pending Tasks for Next Agent)

1.  **செய்தி சேனலை மட்டும் மாற்றவும் (Link News Channel on Main Page)** — **இன்னும் நிலுவையில் / STILL PENDING**:
    *   பயனர் முதன்மைப் பக்கத்தில் (Home/Create Page) "Change Channel" கொடுத்து செய்தி சேனலை மட்டும் லாக்-இன் செய்ய வேண்டும். பக்தி சேனல் ஏற்கனவே பக்தி பக்கத்தில் லாக்-இன் செய்யப்பட்டுள்ளது.
2.  ~~கைமுறை வீடியோ பக்கத்தில் Auto-Approve வசதி~~ — **✅ DONE by Claude, 2026-07-18** (see session update above).
3.  **YouTube Channel Phone Verification** — **NEW, blocking**: Sivan Arul channel needs phone verification at youtube.com/verify before any custom thumbnail can be set via the API. Two generated thumbnails are waiting (see session update above).
4.  **Thumbnail-generator dev-server bug** — **NEW, needs investigation**: see session update point #4 above.

---

## 📂 கோப்பு மற்றும் கோப்புறைகளின் விவரங்கள் / Workspace & Folder Structure

*   **முக்கிய அடைவு / Main Project Workspace Root**:
    `C:\Users\kanna\Documents\Codex\2026-07-12\o\work\video-review-studio`
*   **தரவுத்தளம் / SQLite Database**: 
    `data/review-studio.sqlite` (சேனல் அமைப்புகள், வீடியோக்கள் மற்றும் லாக் தகவல்கள் அனைத்தும் இதில் உள்ளன)
*   **தயாரிக்கப்பட்ட வீடியோக்கள் / Generated Media Output**: 
    `media/<project_id>/` (எ.கா. மருந்தீஸ்வரர் வீடியோ `media/324/review-9x16.mp4` கோப்புறையில் உள்ளது). Note: `generateAutoThumbnail()` writes to a *different* path scheme, `media/projects/<project_id>/thumbnail_<timestamp>.jpg` (extra `projects/` segment) — inconsistent with everything else, worth normalizing at some point.
    ⚠️ Uses real disk space fast (was 86GB before the Clear History wipe in this session) — use the 🗑️ Clear History button in the Create page's history drawer periodically, or watch it if the auto-news scheduler is left running.
*   **யூடியூப் அப்லோடு டோக்கன்கள் / OAuth Token Files**:
    *   `data/youtube-oauth.json` (முதன்மை செய்தி சேனல்)
    *   `data/youtube-oauth-devotional.json` (சிவன் அருள் பக்தி சேனல்)
*   **பயனர் பக்கங்கள் / Web App Dashboards**:
    *   முதன்மை பக்கம்: `http://localhost:3000`
    *   பக்தி பக்கம்: `http://localhost:3000/sivan-arul`
