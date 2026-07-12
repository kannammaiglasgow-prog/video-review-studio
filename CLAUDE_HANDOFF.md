# Handoff — Video Review Studio

## Note to the next agent (read first)

1. **The Free tier's zero-Gemini guarantee is the user's #1 concern.** They were charged unexpectedly earlier and are cost-sensitive. Never add a Gemini call to any Free-tier path, never let one slip in via a shared helper, and if you need to make even one Gemini call for *testing*, ask the user first — that's an explicit agreement from this session. The enforcement is server-side in `validation.ts` and tier-gated in `pipeline.ts`/`keywords.ts`; keep it that way.
2. **This machine's Python defaults to cp1252, not UTF-8.** Anything that pipes Tamil/Hindi/Devanagari text into a Python subprocess needs `PYTHONUTF8=1` in the env or it silently corrupts to `?`/surrogates. Same trap applies to your own testing: passing Tamil text inline through Git-Bash `curl -d '...'` corrupts it before it leaves the shell — write the JSON body to a UTF-8 file and use `--data-binary @file` instead. This burned two test runs this session.
3. **Verify claims against the DB, not the API response.** `data/review-studio.sqlite` (`projects` + `render_jobs.payload`) records what actually happened — which tier, which TTS provider, which per-scene search terms. Every fix this session was verified there, and it caught things the happy-path response hid.
4. **The user works with multiple agents (Claude, Codex, Antigravity) on this repo.** Always start by checking `git log`/`git status` fresh — another agent may have moved the code since this doc was written.
5. **User communication:** reply in Tamil (their standing preference), and ask before destructive/paid/irreversible actions. They respond well to being given clear options with a recommendation.

## Product goal

Local-first AI video review generator for personal use. Inputs may be in any language; output script/voice/UI can be **Tamil, English, or Hindi** (user-selectable). A **Free / Premium** tier controls whether Gemini is used at all.

Workflow:

`YouTube/news/text/own-voiceover → extraction → review analysis (or raw, Free tier) → script → Local Piper or Gemini TTS (or user-uploaded audio) → per-scene copyright-safe stock media → FFmpeg MP4 → optional YouTube upload`

## Current state (as of commit `f2164c0`)

Working tree clean. `a79423c` and `5f05c85` are already pushed to `origin/main`; `d05ba23` and `f2164c0` are being pushed together with this handoff update. Local Piper TTS blocker from the previous handoff is **resolved**:

- VC++ 2015–2022 x64 Redistributable installed (was missing, caused the `onnxruntime_pybind11_state` DLL error).
- A second, previously-undiscovered bug also existed: Python defaults to `cp1252` on this Windows machine, so Tamil/Hindi UTF-8 text piped to Piper's stdin got corrupted. Fixed by setting `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8` on the spawned process in `piper.ts` and `scripts/test-local-tts.mjs`.
- Local Piper now has voices for **all three languages**: `ta_IN-rasa_female-medium`, `en_US-lessac-medium`, `hi_IN-rohan-medium` (all from `huggingface.co/rhasspy/piper-voices`, all free, all gitignored under `models/piper/`).

## Implemented this session (on top of the previous MVP)

- **Ready-made voice-over mode** (`sourceType: "voiceover"`): user uploads a finished WAV/MP3/M4A/OGG/FLAC + pastes the exact script. File is validated by signature (not extension) + `ffprobe`, never by trusting the client. Zero Gemini calls possible in this mode.
- **Tri-lingual output** (`output_language`: `ta`/`en`/`hi`) — script generation prompts, TTS reading instructions, and Local Piper model selection are all language-parameterized.
- **Auto duration** — a duration option where the video plays exactly as long as the voice-over (+2s tail), no fixed preset floor.
- **Free / Premium tier** (`tier` column, default `'premium'` at the DB level but the UI defaults new projects to **Free**): Free tier is guaranteed zero-Gemini, enforced **server-side** in `validation.ts` (forces `ttsProvider=local`, `allowGeminiKeywords=false` regardless of client payload) — not just a UI toggle. Verified by deliberately sending a tampered payload and confirming the server overrides it.
- **Per-scene stock clip matching** — this was the biggest correctness fix. Previously clips were assigned *positionally* from one global keyword pool (scene N got whatever the Nth search result happened to be, unrelated to what was being said). Now every scene gets its own targeted search:
  - Premium: the same Gemini call that writes the script also returns a per-scene English keyword breakdown (no extra API cost), aligned to the real scene count afterward via proportional-position mapping (not modulo wraparound, which caused an abrupt "restart" partway through).
  - Free + English: local per-scene word extraction (no Gemini) using each scene's *actual* sentence text.
  - Free + Tamil/Hindi (or manual override, any tier): new `"|"`-separated syntax in the stock-keywords field — `temple crowd | election rally | forest` — assigns each group proportionally across scenes.
  - **Theme consistency**: a global "theme word" extraction (most-repeated content words across the whole script) is blended into every scene's search terms, so an ambiguous word like "babies" in a shark-themed video stays anchored to "sharks" instead of drifting to unrelated results like puppies. Gemini's prompt also explicitly instructs this.
- **Sentence-boundary-aware scene timing** — replaced the fixed 3-second cadence with `buildScenePlan()`: splits the script into real sentences, estimates each one's duration proportional to word count against the actual measured audio length. Short sentences merge into a shared scene (2s floor); long sentences auto-split into multiple ~3s scenes instead of one static clip. Cuts now land on sentence boundaries.
- **Pre-existing duration bug fixed**: `wavDuration()` hardcoded a 24kHz sample-rate assumption to estimate audio length from file size — wrong for Local Piper's actual 22050Hz output (~8% underestimate) and completely broken for compressed formats (MP3/M4A, relevant to the new voiceover-upload mode). Replaced everywhere with real `ffprobe`-based duration (`src/services/render/ffprobe.ts`).

## Important files (new/changed this session)

- `src/services/pipeline.ts` — orchestration; now builds a scene plan and resolves per-scene keywords before rendering
- `src/services/providers/sentences.ts` — **new**: sentence splitting + variable scene-duration planning
- `src/services/providers/keywords.ts` — **new**: per-scene keyword resolution (custom groups / Gemini / local-English / generic), theme-word extraction, local title derivation
- `src/services/providers/stock-media.ts` — `downloadScenedStockMedia()` replaces the old flat `searchStockMedia`+`downloadStockMedia` pairing; per-scene targeted search with global uniqueness
- `src/services/render/ffmpeg.ts` — `renderVideo()` now takes `{ path, seconds }[]` scenes with individual durations instead of a fixed `CLIP_DURATION_SECONDS` cadence (constant still exists, now just the "ideal" chunk size used by sentence splitting/Gemini's upfront estimate)
- `src/services/render/ffprobe.ts` — **new**: real audio duration via `ffprobe`, replacing the old byte-size estimate
- `src/lib/audio.ts` — **new**: audio file-signature detection (WAV/MP3/M4A/OGG/FLAC)
- `src/lib/validation.ts` — `Tier`, `OutputLanguage` types; Free-tier enforcement lives here
- `src/lib/config.ts` — `ffprobePath`, per-language Piper model paths (`config.piper.models.{ta,en,hi}`)
- `src/lib/database.ts` — migrations 5 (`add_voiceover_mode`: `stock_keywords`, `allow_gemini_keywords`) and 6 (`add_tier`: `tier`)
- `src/services/providers/gemini.ts` — `createTamilScript`/`createVideoMetadata` now take a `sceneCount` and return `sceneKeywords: string[][]`; language-parameterized TTS instructions
- `src/app/api/projects/route.ts` — accepts `multipart/form-data` for voiceover uploads (signature+size+ffprobe validated before any DB row is created)
- `src/app/page.tsx` — Free/Premium toggle (defaults Free), output-language selector, voiceover-mode UI, Auto duration option, `"|"` scene-group hint text

## Local environment

Same as before, plus:

- English + Hindi Piper voices in `models/piper/` (gitignored, ~63MB + ~63MB, sourced from `huggingface.co/rhasspy/piper-voices`)
- VC++ 2015–2022 x64 Redistributable installed via winget

Relevant `.env.local` additions (see `.env.example`):

```env
FFPROBE_PATH=ffprobe
PIPER_MODEL_PATH_TA=./models/piper/ta_IN-rasa_female-medium.onnx
PIPER_MODEL_PATH_EN=./models/piper/en_US-lessac-medium.onnx
PIPER_MODEL_PATH_HI=./models/piper/hi_IN-rohan-medium.onnx
```

(`PIPER_MODEL_PATH` without a suffix still works as a fallback for `PIPER_MODEL_PATH_TA`, for backward compatibility.)

## Validation completed this session

- `npm.cmd run lint` — 0 errors, same 5 pre-existing `<img>` optimization warnings
- `npx.cmd tsc --noEmit` — passed after every change
- `npm.cmd run build` — passed, same harmless Turbopack output-file-tracing warning as before
- `git diff --check` — passed (only line-ending autocrlf warnings, no real whitespace errors)
- Extensive real end-to-end tests via curl against the running dev server (not just unit-level): 15s/60s voiceover uploads, invalid-file rejection, Gemini-keyword opt-in vs. off, English/Hindi Local Piper generation, Free vs Premium (including a deliberate tamper test), Auto duration, per-scene keyword matching (verified actual search terms per scene against script content), theme-consistency (shark/puppy scenario), sentence-merge/split behavior

## Recommended regression checks for the next session

1. A YouTube/news/text project on **Free** tier — confirm `tier='free'`, `tts_provider='local'` in the DB, and that the render_jobs payload's `sceneSearchTerms` don't look like polished Gemini output (should be plain local extraction or generic fallback).
2. A **Premium** project — confirm Gemini genuinely rewrote the script (compare `transcript` vs `review_script` in DB) and that `sceneSearchTerms` are topic-specific per scene.
3. Voiceover upload with a real WAV/MP3 — confirm signature validation rejects a renamed non-audio file, and that duration comes from real audio, not a preset.
4. A script with clearly mixed sentence lengths — confirm scene count in `render_jobs.payload.sceneSearchTerms` reflects merge/split behavior, not a flat `ceil(duration/3)`.
5. English + Hindi Local Piper TTS still both work (`config.piper.models.en` / `.hi` files must exist on disk — they're gitignored, so a fresh clone needs them re-downloaded from `huggingface.co/rhasspy/piper-voices`).

## Known follow-up work (in priority order, agreed with the user after reviewing an external "AI video engine" spec)

1. ~~Sentence-level timestamps~~ — **done this session** (reading-pace estimated, not forced-alignment/ASR — still approximate, not frame-accurate).
2. **Camera motion on real video clips** — currently Ken Burns zoom only applies to static *images* (`ffmpeg.ts`'s `isImage` branch); video clips just get a hard crop/scale with zero movement. Next up.
3. **Real transitions** — currently pure hard cuts via `-f concat -c copy`. Needs `ffmpeg`'s `xfade` filter chained between scenes; will require re-encoding (can no longer `-c copy` the concat step), so render time will increase.
4. **Real subtitle burn-in** — current preview subtitle is illustrative only, not generated/synced. Word-level highlighting would need per-word timestamps (harder than the sentence-level estimate already built).
5. **Clip ranking** — currently first-available match wins; Pexels/Pixabay already return width/height/duration that could be scored (orientation fit, resolution, etc.) without new dependencies.
6. **Background music with ducking**.
7. Explicitly **not** pursuing (discussed and deprioritized): additional stock providers beyond Pexels/Pixabay (Mixkit/Videvo/Coverr have no clean public API, scraping is fragile/ToS-risky), true semantic/embedding-based video search (needs new ML infra, evaluate later if keyword matching proves insufficient), and per-sentence NLP entity/emotion extraction (Tamil/Hindi NLP tooling is thin; the existing user-selected "tone" field already serves as the emotion signal).
8. Older pending items, still open: visible async processing progress + projects/history screen, TTS chunking for 5–10 min outputs, audio-transcription fallback for uncaptioned YouTube videos, numbered SQL migration files, automated tests.

## Safety and copyright

Unchanged: outputs use Pexels/Pixabay assets only; source YouTube footage is never inserted into renders. Preserve this default unless the user confirms they own the source footage rights. The voiceover-upload mode is the one exception where the user supplies their own audio — the *visuals* are still always stock/copyright-safe.
