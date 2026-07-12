# Claude Handoff — Video Review Studio

## Product goal

Local-first Tamil AI video review generator for personal use.

Workflow:

`YouTube URL → transcript → selected time segment → review analysis → Tamil voice-over script → Gemini TTS → copyright-safe stock footage → FFmpeg MP4`

Input videos may be in any language. Output UI, script, speech, and review are Tamil.

## Current status

The MVP works end-to-end on Windows when started from the user's normal PowerShell. Successful projects have produced playable MP4 files with Gemini speech and six stock clips.

Implemented:

- Next.js 16.2.10 App Router, React 19, TypeScript, Tailwind CSS 4
- Tamil single-page Review Studio UI
- YouTube standard and Shorts URLs
- Source segment selection using `MM:SS` or `HH:MM:SS`
- Review stance, tone, persona, and voice controls
- 9:16 (1080×1920) and 16:9 (1920×1080)
- Output presets: 15s, 30s, 60s, 2m, 5m, 8m, 10m
- SQLite using Node 24 built-in `node:sqlite`
- Persistent projects and render jobs
- `youtube-transcript`, with yt-dlp JSON3 subtitle fallback
- Gemini 3.5 Flash script generation with 2.5 Flash fallback
- Gemini 3.1 Flash TTS with 2.5 Flash TTS fallback
- Automatic retry/backoff for Gemini 429/5xx/high-demand responses
- Pexels primary stock video search; Pixabay fallback
- Stock media download and FFmpeg normalization/concat/render
- MP4 range-streaming API, browser player, and download button
- Latest completed project restored after page refresh

## Recent duration fix

Previously, a requested 60-second output could end at 36 seconds because rendering followed actual TTS length. The code now:

- gives Gemini explicit Tamil word-count targets based on requested duration;
- passes an exact `targetDuration` to FFmpeg;
- pads short audio while preserving the selected final duration.

Validate this with a fresh 60-second generation.

## Important files

- `src/app/page.tsx` — Tamil Review Studio UI and client workflow
- `src/app/api/projects/route.ts` — create/list projects
- `src/app/api/projects/[id]/process/route.ts` — process a project
- `src/app/api/projects/[id]/video/route.ts` — MP4 streaming/download
- `src/lib/database.ts` — SQLite schema and migration bootstrap
- `src/lib/config.ts` — local paths and integration configuration
- `src/services/pipeline.ts` — orchestration and duration mapping
- `src/services/providers/transcript.ts` — transcript + yt-dlp fallback
- `src/services/providers/gemini.ts` — review/TTS/retry/fallback
- `src/services/providers/stock-media.ts` — Pexels/Pixabay/download
- `src/services/render/ffmpeg.ts` — exact-duration FFmpeg rendering
- `.env.example` — safe environment variable template

## Local data and secrets

Never commit:

- `.env.local`
- `data/`
- `media/`
- `secrets/`
- local FFmpeg/yt-dlp binaries

Required environment variables:

```env
GEMINI_API_KEY=
PEXELS_API_KEY=
PIXABAY_API_KEY=
YOUTUBE_API_KEY=
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
DATABASE_PATH=./data/review-studio.sqlite
MEDIA_ROOT=./media
FFMPEG_PATH=ffmpeg
YTDLP_PATH=yt-dlp
```

YouTube API and Google Cloud TTS are currently optional. Gemini TTS is primary.

## Windows runtime

Installed versions during development:

- Node.js 24
- FFmpeg 8.1.2
- yt-dlp 2026.07.04

Run from the user's normal PowerShell, not a restricted agent sandbox, so yt-dlp and FFmpeg can spawn:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Validation

Run:

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

Then verify:

1. Standard and Shorts YouTube URLs.
2. A selected source segment such as 07:00–09:00.
3. Exact 15s, 30s, 60s, and 2m outputs.
4. Both 9:16 and 16:9.
5. Gemini high-demand fallback.
6. Player range requests and MP4 download.

## Known follow-up work

- Add visible processing stages/progress instead of one long blocking request.
- Add a projects/history screen with retry and delete controls.
- Generate and burn Tamil subtitles; current preview text is illustrative only.
- Add optional background music with ducking.
- Split long TTS scripts into chunks for 5–10 minute outputs.
- Add audio-transcription fallback when a YouTube video has no captions.
- Replace the current bootstrap migration with numbered SQL migration files as schema grows.
- Resolve the harmless Next.js output-file-tracing warning caused by configurable filesystem paths.
- Add automated unit/integration tests.

## Safety and copyright

The current render uses Pexels/Pixabay stock media. Source YouTube clips are not inserted into the output. Preserve this default unless the user explicitly confirms rights to source footage.
