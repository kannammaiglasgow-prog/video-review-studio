import { runFfmpeg, dimensions } from "./ffmpeg";
import { piperSpeechProvider } from "../providers/piper";
import { parlerSpeechProvider } from "../providers/parler";
import { probeVideoMetadata } from "./ffprobe";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { config } from "@/lib/config";
import { database } from "@/lib/database";


export interface ReactionSegment {
  startMs: number;
  endMs: number;
  commentary: string;
}

export interface CompositorSpec {
  projectId: number;
  sourceVideoPath: string;
  highlights: ReactionSegment[];
  layout: "sequential" | "split-screen" | "pause-and-explain" | "pip" | "news-overlay" | "split-thumbnail-news";
  outputLanguage: "ta" | "en" | "hi";
  voice: string;
  aspectRatio: "9:16" | "16:9";
  outputPath: string;
  theme?: "standard" | "avatar" | "motivational";
}

function wrapText(text: string, maxChars = 32): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      lines.push(current.trim());
      current = w;
    } else {
      current += (current ? " " : "") + w;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.join("\n");
}

import { searchStockMedia } from "../providers/stock-media";

async function downloadBrollIfNeeded(aspectRatio: "9:16" | "16:9"): Promise<string> {
  const assetsDir = path.join(config.mediaRoot, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const orientation = aspectRatio === "9:16" ? "portrait" : "landscape";
  const localPath = path.join(assetsDir, `broll-ocean-${orientation}.mp4`).replaceAll("\\", "/");
  
  if (existsSync(localPath)) {
    return localPath;
  }
  
  console.log(`[Broll Downloader] Resolving ocean waves B-roll (${orientation})...`);
  
  try {
    let url = "https://assets.mixkit.co/videos/preview/mixkit-waves-crashing-on-rocks-from-above-41983-large.mp4";
    
    if (config.api.pexels || config.api.pixabay) {
      try {
        const results = await searchStockMedia(["ocean waves shoreline", "relaxing nature shoreline"], orientation, 2);
        if (results && results.length) {
          url = results[0].url;
        }
      } catch (searchErr) {
        console.warn("[Broll Downloader] Dynamic search failed, using fallback URL:", searchErr);
      }
    }
    
    console.log(`[Broll Downloader] Downloading video: ${url} -> ${localPath}`);
    
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    if (url.includes("pexels.com") && config.api.pexels) {
      headers["Authorization"] = config.api.pexels;
    }
    
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const fileStream = createWriteStream(localPath);
    await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
    console.log(`[Broll Downloader] Download complete: ${localPath}`);
  } catch (err) {
    console.error(`[Broll Downloader] Failed to download B-roll:`, err);
    return "";
  }
  return localPath;
}

async function downloadMusicIfNeeded(): Promise<string> {
  const assetsDir = path.join(config.mediaRoot, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const localPath = path.join(assetsDir, "music-ambient.mp3").replaceAll("\\", "/");
  
  if (existsSync(localPath)) {
    return localPath;
  }
  
  const url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3";
  console.log(`[Music Downloader] Downloading ambient background music: ${url} -> ${localPath}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const fileStream = createWriteStream(localPath);
    await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
    console.log(`[Music Downloader] Download complete: ${localPath}`);
  } catch (err) {
    console.error(`[Music Downloader] Failed to download music:`, err);
    return "";
  }
  return localPath;
}

async function downloadPresenterIfNeeded(gender: "male" | "female"): Promise<string> {
  const assetsDir = path.join(config.mediaRoot, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const localPath = path.join(assetsDir, `presenter-${gender}.mp4`).replaceAll("\\", "/");
  
  if (existsSync(localPath)) {
    return localPath;
  }
  
  const urls = {
    female: "https://videos.pexels.com/video-files/3130182/3130182-uhd_3840_2160_30fps.mp4",
    male: "https://videos.pexels.com/video-files/3129671/3129671-uhd_3840_2160_30fps.mp4"
  };
  
  const url = urls[gender];
  console.log(`[Presenter Downloader] Downloading free presenter loop for ${gender}: ${url} -> ${localPath}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const fileStream = createWriteStream(localPath);
    await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
    console.log(`[Presenter Downloader] Download complete: ${localPath}`);
  } catch (err) {
    console.error(`[Presenter Downloader] Failed to download presenter video:`, err);
    return "";
  }
  
  return localPath;
}

export async function compositeReactionVideo(spec: CompositorSpec): Promise<void> {
  const { width, height } = dimensions(spec.aspectRatio);
  const workDir = path.join(path.dirname(spec.outputPath), "reaction-work");
  await fs.mkdir(workDir, { recursive: true });

  const db = database();
  const projectRow = db.prepare("SELECT thumbnail_path, split_shorts_enabled FROM projects WHERE id=?").get(spec.projectId) as { thumbnail_path: string | null; split_shorts_enabled: number } | undefined;
  const projectThumbnail = projectRow?.thumbnail_path || null;
  const splitShortsEnabled = projectRow?.split_shorts_enabled === 1;


  const rawFontPath = existsSync("C:/Windows/Fonts/Nirmala.ttc")
    ? "C:/Windows/Fonts/Nirmala.ttc"
    : existsSync("C:/Windows/Fonts/Nirmala.ttf")
    ? "C:/Windows/Fonts/Nirmala.ttf"
    : existsSync("C:/Windows/Fonts/arial.ttf")
    ? "C:/Windows/Fonts/arial.ttf"
    : "Arial";

  const fontPath = rawFontPath !== "Arial"
    ? path.relative(process.cwd(), rawFontPath).replaceAll("\\", "/")
    : "Arial";

  const activeTheme = spec.theme || "standard";
  let presenterVideo = "";
  let brollVideo = "";
  let musicPath = "";

  if (activeTheme === "avatar") {
    const isFemale = spec.voice.includes("பெண்") || spec.voice.includes("female") || spec.voice.includes("lessac") || spec.voice.includes("rasa");
    const gender = isFemale ? "female" : "male";
    presenterVideo = await downloadPresenterIfNeeded(gender);
  } else if (activeTheme === "motivational") {
    brollVideo = await downloadBrollIfNeeded(spec.aspectRatio);
    musicPath = await downloadMusicIfNeeded();
  }

  let sourceDurationMs = 0;
  try {
    const meta = await probeVideoMetadata(spec.sourceVideoPath);
    sourceDurationMs = (meta.duration || 0) * 1000;
    console.log(`[Reaction Compositor] Probed source video duration: ${sourceDurationMs}ms`);
  } catch (err) {
    console.error("[Reaction Compositor] Failed to probe video metadata:", err);
  }

  const segmentsList: string[] = [];

  // 1. Process each highlight moment
  for (let index = 0; index < spec.highlights.length; index += 1) {
    const moment = spec.highlights[index];
    const segmentDir = path.join(workDir, `segment-${index}`);
    await fs.mkdir(segmentDir, { recursive: true });

    let startVal = Math.min(moment.startMs, moment.endMs);
    let endVal = Math.max(moment.startMs, moment.endMs);

    if (sourceDurationMs > 0) {
      endVal = Math.min(endVal, sourceDurationMs);
      startVal = Math.min(startVal, sourceDurationMs);
    }

    if (endVal - startVal < 1000) {
      if (sourceDurationMs > 0) {
        startVal = Math.max(0, endVal - 3000);
        if (endVal - startVal < 1000) {
          endVal = Math.min(sourceDurationMs, startVal + 3000);
        }
      } else {
        endVal = startVal + 3000;
      }
    }
    const startSec = (startVal / 1000).toFixed(3);
    const endSec = (endVal / 1000).toFixed(3);
    const clipDuration = Math.max(0.5, (endVal - startVal) / 1000);

    // a. Slice Highlight Video segment from YouTube source (with re-encoding for scaling/alignment)
    const rawClip = path.join(segmentDir, "raw-clip.mp4").replaceAll("\\", "/");
    await runFfmpeg([
      "-ss", startSec,
      "-to", endSec,
      "-i", spec.sourceVideoPath.replaceAll("\\", "/"),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      rawClip
    ]);

    // b. Generate Commentary Audio via Parler TTS with Piper fallback for Tamil
    const commentaryAudio = path.join(segmentDir, "commentary.wav").replaceAll("\\", "/");
    let ttsProvider = piperSpeechProvider;
    if (spec.outputLanguage === "ta") {
      ttsProvider = parlerSpeechProvider;
    }
    try {
      await ttsProvider.synthesize(
        moment.commentary,
        commentaryAudio,
        spec.voice,
        spec.outputLanguage,
        spec.projectId
      );
    } catch (ttsErr) {
      if (ttsProvider === parlerSpeechProvider) {
        console.warn("⚠️ Parler-TTS synthesis failed. Falling back to Piper Speech Provider:", ttsErr);
        await piperSpeechProvider.synthesize(
          moment.commentary,
          commentaryAudio,
          spec.voice,
          spec.outputLanguage,
          spec.projectId
        );
      } else {
        throw ttsErr;
      }
    }

    // Find audio duration
    let audioDuration = 5.0;
    try {
      const { probeAudioDuration } = await import("./ffprobe");
      audioDuration = await probeAudioDuration(commentaryAudio);
    } catch {
      audioDuration = 5.0;
    }

    // Write wrapped commentary text to a file to prevent FFmpeg command escaping issues
    const txtFile = path.join(segmentDir, "text.txt").replaceAll("\\", "/");
    await fs.writeFile(txtFile, wrapText(moment.commentary), "utf8");

    // Make paths relative to current directory to avoid colon characters breaking Windows FFmpeg filters
    const relTxtFile = path.relative(process.cwd(), txtFile).replaceAll("\\", "/");

    // c. Composite based on Layout Format spec
    const segmentOutput = path.join(workDir, `segment-comp-${index}.mp4`).replaceAll("\\", "/");

    if (spec.layout === "sequential") {
      // Form A: Original segment followed by full commentary slide
      const slideVideo = path.join(segmentDir, "slide.mp4").replaceAll("\\", "/");

      if (activeTheme === "motivational" && brollVideo) {
        // Grab a freeze frame of rawClip
        const lastFrame = path.join(segmentDir, "last-frame.png").replaceAll("\\", "/");
        await runFfmpeg([
          "-i", rawClip,
          "-vframes", "1",
          lastFrame
        ]);

        // Stacking top last frame, bottom B-roll, with yellow outline subtitles
        await runFfmpeg([
          "-loop", "1", "-i", lastFrame,
          "-stream_loop", "-1", "-i", brollVideo,
          "-i", commentaryAudio,
          "-filter_complex", `[0:v]scale=${width}:${height/2}:force_original_aspect_ratio=increase,crop=${width}:${height/2}[top]; [1:v]scale=${width}:${height/2}:force_original_aspect_ratio=increase,crop=${width}:${height/2}[bottom]; [top][bottom]vstack=inputs=2[stacked]; [stacked]drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=36:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h/2-text_h/2+50[out_v]`,
          "-map", "[out_v]",
          "-map", "2:a",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-c:a", "aac",
          "-ar", "44100",
          "-ac", "2",
          "-t", audioDuration.toFixed(3),
          slideVideo
        ]);
      } else {
        const videoInput = presenterVideo
          ? ["-stream_loop", "-1", "-i", presenterVideo]
          : ["-f", "lavfi", "-i", `color=c=0x0F172A:s=${width}x${height}:d=${audioDuration}:r=30`];

        // Render Commentary slide with voice-over and text captions overlayed
        await runFfmpeg([
          ...videoInput,
          "-i", commentaryAudio,
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=32:fontcolor=white:box=1:boxcolor=0x000000@0.6:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2`,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-c:a", "aac",
          "-ar", "44100",
          "-ac", "2",
          "-t", audioDuration.toFixed(3),
          slideVideo
        ]);
      }

      // Concatenate original clip followed by commentary slide
      const concatFile = path.join(segmentDir, "concat.txt").replaceAll("\\", "/");
      await fs.writeFile(concatFile, `file '${rawClip}'\nfile '${slideVideo}'`, "utf8");

      await runFfmpeg([
        "-f", "concat",
        "-safe", "0",
        "-i", concatFile,
        "-c", "copy",
        segmentOutput
      ]);
    } 
    else if (spec.layout === "split-screen") {
      // Form B: Original video on top, Commentary slide on bottom
      const slideVideo = path.join(segmentDir, "slide.mp4").replaceAll("\\", "/");

      const splitVideoInput = activeTheme === "motivational" && brollVideo
        ? ["-stream_loop", "-1", "-i", brollVideo]
        : presenterVideo
        ? ["-stream_loop", "-1", "-i", presenterVideo]
        : ["-f", "lavfi", "-i", `color=c=0x1E293B:s=${width}x${height / 2}:d=${clipDuration}:r=30`];

      const splitSubtitlesFilter = activeTheme === "motivational"
        ? `scale=${width}:${height / 2}:force_original_aspect_ratio=increase,crop=${width}:${height / 2},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=28:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h/2-text_h/2)`
        : `scale=${width}:${height / 2}:force_original_aspect_ratio=increase,crop=${width}:${height / 2},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=28:fontcolor=white:box=1:boxcolor=0x000000@0.6:boxborderw=5:x=(w-text_w)/2:y=(h-text_h)/2`;

      // Generate animated slide card for bottom screen
      await runFfmpeg([
        ...splitVideoInput,
        "-i", commentaryAudio,
        "-vf", splitSubtitlesFilter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-t", clipDuration.toFixed(3),
        slideVideo
      ]);

      // Stack original on top, commentary slide on bottom
      await runFfmpeg([
        "-i", rawClip,
        "-i", slideVideo,
        "-filter_complex", `[0:v]scale=${width}:${height / 2}[top]; [1:v]scale=${width}:${height / 2}[bottom]; [top][bottom]vstack=inputs=2[out_v]; [0:a][1:a]amix=inputs=2[out_a]`,
        "-map", "[out_v]",
        "-map", "[out_a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-shortest",
        segmentOutput
      ]);
    }
    else if (spec.layout === "pause-and-explain") {
      // Form C: Play original, freeze last frame, play commentary audio, then continue
      const lastFrame = path.join(segmentDir, "last-frame.png").replaceAll("\\", "/");
      
      // Grab freeze frame from sliced clip
      await runFfmpeg([
        "-i", rawClip,
        "-vframes", "1",
        lastFrame
      ]);

      const freezeVideo = path.join(segmentDir, "freeze.mp4").replaceAll("\\", "/");

      const freezeSubtitlesFilter = activeTheme === "motivational"
        ? `scale=${width}:${height},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=36:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`
        : `scale=${width}:${height},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=32:fontcolor=white:box=1:boxcolor=0x000000@0.6:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2`;

      // Render freeze frame video with commentary captions and voice-over
      await runFfmpeg([
        "-loop", "1",
        "-i", lastFrame,
        "-i", commentaryAudio,
        "-vf", freezeSubtitlesFilter,
        "-t", audioDuration.toFixed(3),
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        freezeVideo
      ]);

      // Concatenate active play video followed by explanation freeze frame video
      const concatFile = path.join(segmentDir, "concat.txt").replaceAll("\\", "/");
      await fs.writeFile(concatFile, `file '${rawClip}'\nfile '${freezeVideo}'`, "utf8");

      await runFfmpeg([
        "-f", "concat",
        "-safe", "0",
        "-i", concatFile,
        "-c", "copy",
        segmentOutput
      ]);
    }
    else if (spec.layout === "pip") {
      // Form D: Original video full screen, scaled commentary slide in bottom-right
      const slideVideo = path.join(segmentDir, "slide-small.mp4").replaceAll("\\", "/");
      const pipW = Math.round(width * 0.3);
      const pipH = Math.round(height * 0.3);

      const pipVideoInput = activeTheme === "motivational" && brollVideo
        ? ["-stream_loop", "-1", "-i", brollVideo]
        : presenterVideo
        ? ["-stream_loop", "-1", "-i", presenterVideo]
        : ["-f", "lavfi", "-i", `color=c=0x3F3F46:s=${pipW}x${pipH}:d=${clipDuration}:r=30`];

      const pipSubtitlesFilter = activeTheme === "motivational"
        ? `scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=16:fontcolor=yellow:borderw=2:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`
        : `scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH},drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=16:fontcolor=white:box=1:boxcolor=0x000000@0.6:boxborderw=3:x=(w-text_w)/2:y=(h-text_h)/2`;

      await runFfmpeg([
        ...pipVideoInput,
        "-i", commentaryAudio,
        "-vf", pipSubtitlesFilter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-t", clipDuration.toFixed(3),
        slideVideo
      ]);

      // Overlay small slide onto original full screen video
      await runFfmpeg([
        "-i", rawClip,
        "-i", slideVideo,
        "-filter_complex", `[0:v][1:v]overlay=x=main_w-overlay_w-30:y=main_h-overlay_h-30[out_v]; [0:a][1:a]amix=inputs=2[out_a]`,
        "-map", "[out_v]",
        "-map", "[out_a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-shortest",
        segmentOutput
      ]);
    }
    else if (spec.layout === "split-thumbnail-news" || splitShortsEnabled) {
      // Form F: Split Thumbnail layout (Thumbnail on top half, active video clip in middle, red footer banner)
      const lastFrame = path.join(segmentDir, "last-frame.png").replaceAll("\\", "/");
      let topImageInput = "";
      if (projectThumbnail && existsSync(projectThumbnail)) {
        topImageInput = projectThumbnail.replaceAll("\\", "/");
      } else {
        // Grab first frame as fallback
        await runFfmpeg([
          "-ss", "00:00:00",
          "-i", rawClip,
          "-vframes", "1",
          "-y",
          lastFrame
        ]).catch(() => {});
        topImageInput = existsSync(lastFrame) ? lastFrame : spec.sourceVideoPath.replaceAll("\\", "/");
      }

      // Height of top half: 45% of total height (e.g. 864 of 1920)
      // Height of middle video: 45% of total height (e.g. 864 of 1920)
      // Height of bottom footer: 10% of total height (e.g. 192 of 1920)
      const halfH = Math.round(height * 0.45);
      const footerH = Math.round(height * 0.10);

      // We stack top (thumbnail) and middle (video clip), pad the canvas to the full aspect ratio, then add a red drawbox and drawtext for social banner.
      // Also we overlay yellow outline subtitles on the middle portion (y = halfH + (halfH - text_h)/2).
      await runFfmpeg([
        "-i", rawClip,
        "-loop", "1", "-i", topImageInput,
        "-i", commentaryAudio,
        "-filter_complex", 
        `[0:v]scale=${width}:${halfH}:force_original_aspect_ratio=increase,crop=${width}:${halfH}[mid]; ` +
        `[1:v]scale=${width}:${halfH}:force_original_aspect_ratio=increase,crop=${width}:${halfH}[top]; ` +
        `[top][mid]vstack=inputs=2[stacked]; ` +
        `[stacked]pad=${width}:${height}:0:0:black[padded]; ` +
        `[padded]drawbox=y=${halfH * 2}:w=${width}:h=${footerH}:color=0xC21807@1:t=fill[footer]; ` +
        `[footer]drawtext=fontfile='${fontPath}':text='LIKE   •   COMMENT   •   SUBSCRIBE':fontsize=42:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${halfH * 2}+(${footerH}-text_h)/2[base]; ` +
        `[base]drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=36:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${halfH}+(${halfH}-text_h)/2[out_v]; ` +
        `[0:a][2:a]amix=inputs=2[out_a]`,
        "-map", "[out_v]",
        "-map", "[out_a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-t", clipDuration.toFixed(3),
        segmentOutput
      ]);
    }
    else {
      // Form E: News / Overlay layout (Original clip with banner captions overlayed)
      const overlayFilter = activeTheme === "motivational"
        ? `[0:v]drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=28:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-text_h-80[out_v]; [0:a][1:a]amix=inputs=2[out_a]`
        : `[0:v]drawtext=fontfile='${fontPath}':textfile='${relTxtFile}':fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-text_h-80[out_v]; [0:a][1:a]amix=inputs=2[out_a]`;

      await runFfmpeg([
        "-i", rawClip,
        "-i", commentaryAudio,
        "-filter_complex", overlayFilter,
        "-map", "[out_v]",
        "-map", "[out_a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-shortest",
        segmentOutput
      ]);
    }

    segmentsList.push(segmentOutput);
  }

  // 2. Concatenate all compiled highlights into a single final reaction video
  const finalConcatFile = path.join(workDir, "final-concat.txt").replaceAll("\\", "/");
  await fs.writeFile(
    finalConcatFile,
    segmentsList.map(file => `file '${file}'`).join("\n"),
    "utf8"
  );

  const tempConcatVideo = (activeTheme === "motivational" && musicPath)
    ? path.join(workDir, "temp-concat-unmixed.mp4").replaceAll("\\", "/")
    : spec.outputPath.replaceAll("\\", "/");

  console.log(`[Reaction Compositor] Rendering final reaction video to: ${tempConcatVideo}`);
  await runFfmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", finalConcatFile,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-r", "30",
    "-pix_fmt", "yuv420p",
    tempConcatVideo
  ]);

  if (activeTheme === "motivational" && musicPath) {
    console.log(`[Reaction Compositor] Mixing ambient background music track: ${musicPath} -> ${spec.outputPath}`);
    await runFfmpeg([
      "-i", tempConcatVideo,
      "-stream_loop", "-1", "-i", musicPath,
      "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[out_a]`,
      "-map", "0:v",
      "-map", "[out_a]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      spec.outputPath.replaceAll("\\", "/")
    ]);
  }
  console.log(`[Reaction Compositor] Render completed successfully.`);

  // Clean up workDir
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {}
}
