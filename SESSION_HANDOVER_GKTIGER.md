# Session handover — Video Review Studio (GK Tiger + next step)

**Repo:** `C:\Users\kanna\Documents\Codex\2026-07-12\o\work\video-review-studio`
**GitHub:** https://github.com/kannammaiglasgow-prog/video-review-studio
**Last commit:** `3f40971` — "GK Tiger: build the quiz from a pasted link or story"
**Working tree:** clean except untracked `public/audio/bgm-devotional.wav`

## Standing user instructions (carry these forward)

1. **Reply in Tamil, always.**
2. **No public uploads.** Every test and production upload stays **Private** until the user reviews it.
3. **Do not modify unrelated parts of the project.** Do not replace working APIs, upload logic, TTS or other existing features unless a change is genuinely required.
4. Branding must be original — never reproduce another channel's protected graphics or identity.
5. Copyright-safe media only (Pexels/Pixabay stock, synthesized SFX, free AI images).

## What the app is

Next.js (App Router, Turbopack) Tamil/English AI video generator. SQLite via `node:sqlite`
`DatabaseSync` with additive migrations. Gemini `gemini-2.5-flash` for text, Pollinations
(free Flux) and optional Gemini `gemini-2.5-flash-image` ("Nano Banana", $0.039/image, cost-
monitored) for images, edge-tts (free) for voice, FFmpeg for render.

Channels: `story`, `english`, `food`, `sivan-arul` (devotional), `sanatana`, `news`, `gktiger`.

## GK Tiger — COMPLETE

An English general-knowledge quiz Shorts channel built inside the existing pipeline.

- **9:16 1080×1920 @ 30fps**, rendered frame-by-frame from SVG via `sharp` → PNG → FFmpeg.
- **4 questions** per video, 3 options each (A/B/C), each option carries a **photo thumbnail**
  (free stock first, AI illustration as fallback).
- **Timeline:** question card + all three options appear together → each option highlights while
  the VO reads it → **3-second** countdown ring → turquoise correct reveal → QUICK FACT card.
- **CTAs:** "tap like" after Q1, "subscribe" after Q2; outro asks for the score and says
  thanks + share.
- **Sound:** the question-entrance and per-option cues were deliberately removed (they buried
  the narration). Only `tick` and `correct` remain, mapped in `SFX` in `render.ts`.
- **Three question sources**, selectable in the dashboard panel:
  1. `auto` — Gemini drafts, an independent low-temperature verifier (never told the intended
     answer) confirms; uncertain questions are dropped and redrafted.
  2. `manual` — the user pastes hand-written questions; they are structured and fact-checked
     but stay the user's own.
  3. `source` — the user pastes a **URL or a block of text**; a bare URL is fetched via
     `extractArticleFromUrl`, questions are drawn from that material and verified back
     against it by `verifyAgainstSource`.
- **Auto-upload** with a privacy selector, defaulting to **Private**.
- Bottom button reads **"Create New Quiz"**.
- Dedup: `gk_quiz_questions` table, `question TEXT NOT NULL UNIQUE` (migration 33).

### Key files

| File | Purpose |
|---|---|
| `src/services/gktiger/pipeline.ts` | End-to-end run; `QUESTIONS_PER_VIDEO=4`, `COUNTDOWN_SECONDS=3`, `MAX_DURATION_SECONDS=75`; quality gate; auto-upload |
| `src/services/gktiger/questions.ts` | `GK_CATEGORIES`, `draftQuestions`, `verifyQuestions`, `generateVerifiedQuestions`, `parseManualQuestions`, `generateQuestionsFromSource`, `verifyAgainstSource` |
| `src/services/gktiger/render.ts` | Option images, voice-line planning, audio mix, frame render (concurrency 4), `renderQuizVideo` |
| `src/services/gktiger/template/theme.ts` | `CANVAS`, `COLOR`, `LAYOUT`, `fitText()`, easing |
| `src/services/gktiger/template/components.ts` | Every SVG piece: background, header, progress pill, countdown ring, question card, answer option, quick fact, CTA banner, footer, outro |
| `src/services/gktiger/template/timeline.ts` | `PHASE` durations, `buildTimeline`, `stateAt`, `ctaForSlide` |
| `src/app/api/gktiger/generate/route.ts` | POST endpoint (awaited, so verification failures surface) |
| `src/app/dashboard/channels/[channel]/page.tsx` | `GkTigerPanel` — mode selector, auto-upload, privacy |
| `src/app/dashboard/costs/page.tsx` + `src/app/api/cost-monitor/route.ts` | Paid-API spend by step / channel / period |

### Important caveat, already told to the user

Fact "verification" is **model self-checking, not citable-source lookup**. That is exactly why
uploads default to Private and the user reviews before publishing.

## Hard-won gotchas (do not regress these)

- **`amix=duration=first` truncates the video.** The mix gets sized to the first delayed voice
  line and `-shortest` then cuts everything. Correct form:
  `amix=...:duration=longest,apad,atrim=0:${total}`.
- **FFmpeg input indices:** each image input pushes 4 argv entries (`-loop 1 -i path`), so never
  compute the audio map as `inputs.length / 2`. Use an explicit `inputCount`.
- **Stock media must fail per-scene, not all-or-nothing.** `stock-media.ts` returns
  `(string | null)[]`.
- **Gemini returns an empty candidate at temperature 1.0 roughly 1 in 3 calls.** Retry across
  1.0 / 0.9 / 0.8.
- **Pollinations rate-limits hard (429).** `REQUEST_GAP_MS = 5000`, retry sweeps, final-sweep
  cooldown. Prefer stock sources where possible.
- **Never write `\n` through a Python/sed replace script into a JS string literal** — it lands as
  a real newline and breaks the file. Use template literals or the Edit tool.
- **`.env.local` values are quoted.** Standalone `tsx` test scripts must strip the quotes;
  Next.js does it automatically.
- **`sharp` is available transitively** via Next.js and is what rasterizes the SVG template.
- **Anime / Ghibli style prompts** produce far better free-Flux output than photorealism.
- **Google Flow has no public API.** It is browser-only; the Claude Browser pane cannot complete
  Chrome's native Save dialog. Workflow: user downloads in their own Chrome, tells the path.
- Pre-existing lint error in the dashboard page (setState in effect, 3 occurrences) — not ours.

## Verification commands

```
npx.cmd tsc --noEmit
npm.cmd run lint
```

## THE NEXT TASK — not started

The user's last request: **"i want to implement this in my all channel with separate section"**

This is ambiguous and needs one clarifying question **in Tamil** before any code is written,
because the readings lead to materially different work across six channels:

- (a) the GK Tiger **quiz format itself** on every channel (Tamil quiz for sivan-arul, etc.)
- (b) the **three-way question-source input** (auto / manual / paste-a-link) pattern everywhere
- (c) a **dedicated generator panel per channel** on the dashboard, instead of the shared
  Idea Engine panel
- (d) the **auto-upload + privacy controls** on every channel

Given constraint #3 above (do not modify unrelated parts), ask first, then implement.
