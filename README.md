# Video Review Studio

எந்த மொழியிலான YouTube வீடியோவையும் தமிழ் review video-ஆக மாற்றும் local-first application.

## Workflow

YouTube URL → Transcript → நேரப்பகுதி → Review analysis → தமிழ் script → TTS → Copyright-safe media → FFmpeg render

## தற்போதைய அடித்தளம்

- Next.js 16 App Router + TypeScript + Tailwind CSS
- முழு தமிழ் Review Studio configuration UI
- 9:16 Shorts/Reels மற்றும் 16:9 normal video
- 15 விநாடிகள் முதல் 10 நிமிடங்கள் வரை presets
- நிலைப்பாடு, tone, persona மற்றும் voice தேர்வுகள்
- Node built-in SQLite project database மற்றும் render-job queue
- Gemini/Pexels/Pixabay/Google TTS environment placeholders
- FFmpeg readiness checker

## Local setup

1. `.env.example`-ஐ `.env.local` என copy செய்து API keys சேர்க்கவும்.
2. `npm install`
3. FFmpeg install செய்து `npm run check:ffmpeg` இயக்கவும்.
4. `npm run dev`
5. Browser-ல் `http://localhost:3000` திறக்கவும்.

Generated files `data/` மற்றும் `media/` folders-ல் இருக்கும்; அவை GitHub-க்கு commit ஆகாது.

## API endpoints

- `GET /api/health` — integration readiness
- `POST /api/projects` — project மற்றும் queue job உருவாக்குதல்
- `GET /api/projects` — சமீபத்திய projects

## பாதுகாப்பு

`.env.local`, `secrets/`, SQLite database மற்றும் generated media ஆகியவற்றை GitHub-க்கு upload செய்ய வேண்டாம்.
