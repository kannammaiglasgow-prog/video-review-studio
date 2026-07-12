# Claude Handoff — Video Review Studio

## Product goal

Local-first Tamil AI video review generator for personal use. Inputs may be in any language; UI, review script, and speech output are Tamil.

Workflow:

`YouTube/news/text → extraction → selected segment → review analysis → Tamil script → Local Piper or Gemini TTS → copyright-safe stock media → FFmpeg MP4 → optional YouTube upload`

## Current state

The Gemini workflow has produced playable MP4 files end-to-end on Windows. Local Piper is now the default zero-API-cost TTS choice, and Gemini TTS remains an explicit paid choice in the UI.

Local Piper files are installed and intentionally ignored by Git:

- `.venv-local-tts/Scripts/piper.exe`
- `models/piper/ta_IN-rasa_female-medium.onnx`
- `models/piper/ta_IN-rasa_female-medium.onnx.json`

Local TTS smoke test currently reaches Piper but fails importing `onnxruntime_pybind11_state` with `ImportError: DLL load failed`. This normally requires installing or repairing Microsoft Visual C++ 2015–2022 Redistributable x64. Do not silently use paid Gemini when Local is selected.

## Implemented

- Next.js 16.2.10 App Router, React 19, TypeScript, Tailwind CSS 4
- YouTube standard/Shorts, public news URL, and pasted-text inputs
- YouTube segment selection with `MM:SS` or `HH:MM:SS`
- Tamil stance, tone, persona, voice, duration, and 9:16/16:9 controls
- Output presets from 15 seconds to 10 minutes
- SQLite via Node 24 `node:sqlite`; migration 4 adds `projects.tts_provider`
- Gemini script generation with retry, model fallback, balanced JSON extraction, repair, and schema checks
- Local Piper Tamil female voice and selectable Gemini TTS
- Pexels/Pixabay video and image search with provider/id deduplication
- One unique visual for every six seconds: `ceil(finalDuration / 6)`; no cycling/repetition
- Atomic stock downloads that preserve existing clips on insufficient results
- Clip preview, search, replacement/upload, and rerender
- FFmpeg normalization/render; final duration is `max(requested, audio + 2s)`
- MP4 range streaming, player, audio preview, and download
- Google OAuth YouTube upload with CSRF state validation and streamed uploads
- Thumbnail upload or video-frame extraction with file-signature validation
- Public-only news fetching with DNS/private-IP and redirect protections

## Important files

- `src/app/page.tsx` — Tamil UI and client workflow
- `src/app/api/projects/route.ts` — create/list projects
- `src/app/api/projects/[id]/process/route.ts` — processing entrypoint
- `src/app/api/projects/[id]/clips/*` — clip preview/replacement
- `src/app/api/projects/[id]/thumbnail/route.ts` — thumbnail management
- `src/app/api/projects/[id]/youtube/route.ts` — YouTube upload
- `src/app/api/youtube/*` — OAuth lifecycle
- `src/lib/config.ts` — paths and integrations
- `src/lib/database.ts` — SQLite schema/bootstrap migrations
- `src/lib/validation.ts` — request validation
- `src/services/pipeline.ts` — orchestration and duration logic
- `src/services/providers/gemini.ts` — review and Gemini TTS
- `src/services/providers/piper.ts` — local Piper integration
- `src/services/providers/news.ts` — safe public article fetching
- `src/services/providers/stock-media.ts` — asset search/download
- `src/services/render/ffmpeg.ts` — six-second unique-scene rendering
- `scripts/test-local-tts.mjs` — UTF-8-safe Piper smoke test

## Local environment

Installed during development:

- Node.js 24
- Python 3.11.9 and `piper-tts` virtual environment
- FFmpeg 8.1.2
- yt-dlp 2026.07.04

Never commit `.env.local`, `data/`, `media/`, `models/`, `.venv-local-tts/`, `secrets/`, or local binaries.

Relevant safe environment template entries:

```env
GEMINI_API_KEY=
PEXELS_API_KEY=
PIXABAY_API_KEY=
YOUTUBE_API_KEY=
DATABASE_PATH=./data/review-studio.sqlite
MEDIA_ROOT=./media
FFMPEG_PATH=ffmpeg
YTDLP_PATH=yt-dlp
PIPER_EXECUTABLE_PATH=./.venv-local-tts/Scripts/piper.exe
PIPER_MODEL_PATH=./models/piper/ta_IN-rasa_female-medium.onnx
```

## Immediate next step: fix and verify Local TTS

Run from normal PowerShell:

```powershell
winget install --id Microsoft.VCRedist.2015+.x64 -e
cd C:\Users\kanna\Documents\Codex\2026-07-12\o\work\video-review-studio
npm.cmd run test:local-tts
```

Expected output is `media/piper-test.wav`. Then restart the dev server and generate a fresh 15-second video with **Local Piper — இலவசம்** selected.

## Validation completed before handoff

- `git diff --check` — passed
- `npm.cmd run lint` — 0 errors, 5 existing `<img>` optimization warnings
- `npx.cmd tsc --noEmit` — passed
- `npm.cmd run build` — passed
- One harmless Next/Turbopack output-file-tracing warning remains due to configurable filesystem paths

## Recommended regression checks

1. Local Piper smoke test and 15-second local-TTS video.
2. Gemini TTS selection still works independently.
3. A fresh 60-second output lasts at least 60 seconds.
4. A one-minute output uses at least ten unique six-second assets.
5. YouTube selection such as 07:00–09:00 uses only that transcript segment.
6. Clip replacement/rerender, thumbnail, MP4 download, and YouTube upload.

## Known follow-up work

- Resolve/verify the Windows Visual C++ dependency for local `onnxruntime`.
- Add visible asynchronous processing progress and a projects/history screen.
- Generate and burn real Tamil subtitles; current preview subtitle is illustrative.
- Add optional background music with ducking.
- Chunk long TTS scripts for 5–10 minute outputs.
- Add audio transcription fallback for YouTube videos without captions.
- Move bootstrap migrations to numbered SQL migration files as schema grows.
- Add automated unit and integration tests.

## Safety and copyright

Outputs use Pexels/Pixabay assets. Source YouTube footage is not inserted into renders. Preserve this default unless the user confirms they own the source footage rights.
