# Video Review Studio

YouTube வீடியோ, news article அல்லது உங்கள் சொந்த உரையை தமிழ் review/news video-ஆக மாற்றும் local-first application.

## Workflow

YouTube/news/text source → Content extraction → Review analysis → தமிழ் script → TTS → Copyright-safe media → Clip review → FFmpeg render → Optional YouTube upload

## தற்போதைய அடித்தளம்

- Next.js 16 App Router + TypeScript + Tailwind CSS
- முழு தமிழ் Review Studio configuration UI
- 9:16 Shorts/Reels மற்றும் 16:9 normal video
- 15 விநாடிகள் முதல் 10 நிமிடங்கள் வரை presets
- நிலைப்பாடு, tone, persona மற்றும் voice தேர்வுகள்
- YouTube நேரப்பகுதி தேர்வு; news URL மற்றும் pasted-text modes
- Generated clips preview/replace மற்றும் rerender
- ஒவ்வொரு visual scene-மும் அதிகபட்சம் 6 விநாடிகள்; `ceil(duration / 6)` தனித்தனி clips கட்டாயம், repeat இல்லை
- Gemini retry, JSON repair மற்றும் model fallback
- Pexels/Pixabay video/image search
- Generated MP4 preview மற்றும் download
- Google OAuth மூலம் optional private/unlisted/public YouTube upload
- Upload அல்லது video frame மூலம் optional YouTube thumbnail
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
- `GET /api/projects/:id/clips` — render clips
- `POST /api/projects/:id/rerender` — மாற்றிய clips-உடன் rerender
- `GET/POST/DELETE /api/projects/:id/thumbnail` — thumbnail management
- `/api/youtube/*` — OAuth status, callback மற்றும் upload support

## பாதுகாப்பு

`.env.local`, `secrets/`, OAuth token, SQLite database மற்றும் generated media ஆகியவற்றை GitHub-க்கு upload செய்ய வேண்டாம். News URL fetch public HTTP/HTTPS destinations-க்கு மட்டும் கட்டுப்படுத்தப்பட்டுள்ளது.
