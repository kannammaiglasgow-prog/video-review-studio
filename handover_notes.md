# Project Handover Notes — Video Review Studio (Tamil Devotional & News Automation)

This document provides a comprehensive handover status for the next AI agent in **Codex / Dot Court** to resume development immediately.

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

1.  **செய்தி சேனலை மட்டும் மாற்றவும் (Link News Channel on Main Page)**:
    *   பயனர் முதன்மைப் பக்கத்தில் (Home/Create Page) "Change Channel" கொடுத்து செய்தி சேனலை மட்டும் லாக்-இன் செய்ய வேண்டும். பக்தி சேனல் ஏற்கனவே பக்தி பக்கத்தில் லாக்-இன் செய்யப்பட்டுள்ளது.
2.  **கைமுறை வீடியோ பக்கத்தில் Auto-Approve வசதி (Add Auto-Approve Checkbox in Create UI)**:
    *   கைமுறையாக வீடியோ உருவாக்கும் [create/page.tsx](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/app/create/page.tsx) பக்கத்தில் ஒரு "Auto Approve" செக்பாக்ஸ் சேர்க்க வேண்டும்.
    *   பயனர் இதை டிக் செய்தால், [api/projects/route.ts](file:///C:/Users/kanna/Documents/Codex/2026-07-12/o/work/video-review-studio/src/app/api/projects/route.ts) வழியாக ப்ராஜெக்ட் உருவாக்கப்படும் போது `auto_approve = 1` என டேட்டாபேஸில் பதியப்பட்டு முழு வீடியோவும் தானாகவே அப்லோடு செய்யப்பட வேண்டும்.

---

## 📂 கோப்பு மற்றும் கோப்புறைகளின் விவரங்கள் / Workspace & Folder Structure

*   **முக்கிய அடைவு / Main Project Workspace Root**:
    `C:\Users\kanna\Documents\Codex\2026-07-12\o\work\video-review-studio`
*   **தரவுத்தளம் / SQLite Database**: 
    `data/review-studio.sqlite` (சேனல் அமைப்புகள், வீடியோக்கள் மற்றும் லாக் தகவல்கள் அனைத்தும் இதில் உள்ளன)
*   **தயாரிக்கப்பட்ட வீடியோக்கள் / Generated Media Output**: 
    `media/<project_id>/` (எ.கா. மருந்தீஸ்வரர் வீடியோ `media/324/review-9x16.mp4` கோப்புறையில் உள்ளது)
*   **யூடியூப் அப்லோடு டோக்கன்கள் / OAuth Token Files**:
    *   `data/youtube-oauth.json` (முதன்மை செய்தி சேனல்)
    *   `data/youtube-oauth-devotional.json` (சிவன் அருள் பக்தி சேனல்)
*   **பயனர் பக்கங்கள் / Web App Dashboards**:
    *   முதன்மை பக்கம்: `http://localhost:3000`
    *   பக்தி பக்கம்: `http://localhost:3000/sivan-arul`
