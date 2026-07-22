import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config, type VideoStyleConfig } from "@/lib/config";
import { probeAudioDuration } from "./ffprobe";

import { transitionPresetsMap } from "../../../packages/transition-library/src";

export type SceneClip = {
  path: string;
  seconds: number;
  transition?: {
    id: string;
    durationFrames: number;
    intensity: number;
    direction?: "left" | "right" | "up" | "down";
    colour?: string;
  };
};

export type RenderSpec = {
  aspectRatio: "9:16" | "16:9";
  audioPath: string;
  scenes: SceneClip[];
  subtitlePath?: string;
  outputPath: string;
  targetDuration: number;
  styleConfig?: VideoStyleConfig;
  ctaEnabled?: boolean;
  ctaPosition?: string;
  splitShortsEnabled?: boolean;
  bgmEnabled?: boolean;
  animate?: boolean; // Ken Burns camera motion on stills (default true)
};

// sentence-timing இல்லாத இடங்களில் (Gemini prompt-க்கு upfront estimate) இன்னும் பயன்படும் "ideal" scene length
export const CLIP_DURATION_SECONDS = 3;

export function requiredClipCount(duration: number) {
  return Math.max(1, Math.ceil(duration / CLIP_DURATION_SECONDS));
}

export function dimensions(aspectRatio: RenderSpec["aspectRatio"]) {
  return aspectRatio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

export async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(config.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let error = "";
    process.stderr.on("data", (chunk) => { error += String(chunk); });
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}: ${error.slice(-1600)}`)));
  });
}

function createMockWavBuffer(durationSeconds = 1.0, frequency = 440) {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);
  
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Design smooth frequency sweep tones instead of harsh square wave beeps
  let f0 = frequency;
  let f1 = frequency;
  if (frequency === 300 || frequency === 400) { // whoosh
    f0 = frequency + 150;
    f1 = 80;
  } else if (frequency === 350) { // swipe
    f0 = 500;
    f1 = 100;
  } else if (frequency === 600) { // flash
    f0 = 200;
    f1 = 800;
  } else if (frequency === 800) { // sparkle
    f0 = 800;
    f1 = 1200;
  } else if (frequency === 500) { // page-flip
    f0 = 300;
    f1 = 150;
  } else if (frequency === 100) { // impact
    f0 = 120;
    f1 = 30;
  }

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    
    // Envelope for soft fade-in/fade-out
    let env = 1.0;
    const pFadeIn = 0.15;
    const pFadeOut = 0.20;
    if (t < durationSeconds * pFadeIn) {
      env = t / (durationSeconds * pFadeIn);
    } else if (t > durationSeconds * (1 - pFadeOut)) {
      env = (durationSeconds - t) / (durationSeconds * pFadeOut);
    }
    
    const phase = 2 * Math.PI * (f0 * t + 0.5 * (f1 - f0) * t * t / durationSeconds);
    const amplitude = 30 * env;
    const sampleValue = 128 + Math.round(amplitude * Math.sin(phase));
    buffer.writeUInt8(sampleValue, 44 + i);
  }
  
  return buffer;
}

export async function ensureAudioAssetsExist() {
  const audioDir = path.resolve(process.cwd(), "public/audio");
  await fsp.mkdir(audioDir, { recursive: true });
  
  const assets = [
    { name: "whoosh.wav", freq: 300 },
    { name: "whoosh-fast.wav", freq: 400 },
    { name: "swipe.wav", freq: 350 },
    { name: "flash.wav", freq: 600 },
    { name: "glitch.wav", freq: 150 },
    { name: "sparkle.wav", freq: 800 },
    { name: "page-flip.wav", freq: 500 },
    { name: "impact.wav", freq: 100 }
  ];
  
  for (const asset of assets) {
    const filePath = path.join(audioDir, asset.name);
    try {
      await fsp.access(filePath);
    } catch {
      const buffer = createMockWavBuffer(0.8, asset.freq);
      await fsp.writeFile(filePath, buffer);
    }
  }
}

export function createMockDevotionalBgm(durationSeconds = 600) {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);
  
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Melodic notes sequence (Pentatonic scale: meditative / deity feel)
  const notes = [261.63, 293.66, 329.63, 392.00, 440.00];
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    
    // Change note every 5 seconds
    const noteIndex = Math.floor(t / 5) % notes.length;
    const freq = notes[noteIndex];
    
    // Slowly fade the note in and out (each 5s note)
    const tNote = t % 5;
    let noteEnv = 1.0;
    if (tNote < 1.2) {
      noteEnv = tNote / 1.2;
    } else if (tNote > 3.8) {
      noteEnv = (5.0 - tNote) / 1.2;
    }
    
    // Overall track fade in and fade out
    let trackEnv = 1.0;
    if (t < 6.0) {
      trackEnv = t / 6.0;
    } else if (t > durationSeconds - 6.0) {
      trackEnv = (durationSeconds - t) / 6.0;
    }
    
    const wave = 0.5 * Math.sin(2 * Math.PI * freq * t) +
                 0.35 * Math.sin(2 * Math.PI * (freq / 2) * t) +
                 0.15 * Math.sin(2 * Math.PI * (freq * 2) * t);
                 
    const amplitude = 18 * noteEnv * trackEnv; // Keep it low volume
    const sampleValue = 128 + Math.round(amplitude * wave);
    buffer.writeUInt8(sampleValue, 44 + i);
  }
  
  return buffer;
}

export async function ensureBgmAssetExists() {
  const audioDir = path.resolve(process.cwd(), "public/audio");
  await fsp.mkdir(audioDir, { recursive: true });
  const bgmPath = path.join(audioDir, "bgm-devotional.wav");
  try {
    await fsp.access(bgmPath);
  } catch {
    const buffer = createMockDevotionalBgm(600); // 10 minutes devotional bgm
    await fsp.writeFile(bgmPath, buffer);
  }
}

export async function optimizeAudioTrack(inputPath: string, outputPath: string, isShortForm: boolean) {
  // Only trim the leading silence, completely avoiding stop_periods which truncate speech at natural pauses.
  const filters = [
    "silenceremove=start_threshold=-50dB:start_periods=1:start_silence=0"
  ];
  if (isShortForm) {
    filters.push("atempo=1.03");
  }
  
  await runFfmpeg([
    "-i", inputPath,
    "-af", filters.join(","),
    outputPath
  ]);
}

function concatPath(filePath: string) {
  return filePath.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

function getCameraMotionFilter(motion: string, width: number, height: number): string {
  const name = motion.toLowerCase().replace(/[^a-z]/g, "");
  let cropExpr = "";
  if (name === "zoomin" || name === "pushin" || name === "pov") {
    cropExpr = `w='iw*(0.95-0.035*(n/30))':h='ih*(0.95-0.035*(n/30))':x='(iw-ow)/2':y='(ih-oh)/2'`;
  } else if (name === "zoomout" || name === "pullout") {
    cropExpr = `w='iw*(0.82+0.035*(n/30))':h='ih*(0.82+0.035*(n/30))':x='(iw-ow)/2':y='(ih-oh)/2'`;
  } else if (name === "panleft") {
    cropExpr = `w='iw*0.9':h='ih*0.9':x='(iw-ow)*(1-0.12*(n/30))':y='(ih-oh)/2'`;
  } else if (name === "panright" || name === "drone") {
    cropExpr = `w='iw*0.9':h='ih*0.9':x='(iw-ow)*(0.12*(n/30))':y='(ih-oh)/2'`;
  } else if (name === "tiltup") {
    cropExpr = `w='iw*0.9':h='ih*0.9':x='(iw-ow)/2':y='(ih-oh)*(1-0.12*(n/30))'`;
  } else if (name === "tiltdown") {
    cropExpr = `w='iw*0.9':h='ih*0.9':x='(iw-ow)/2':y='(ih-oh)*(0.12*(n/30))'`;
  } else if (name === "orbit") {
    cropExpr = `w='iw*(0.93-0.018*(n/30))':h='ih*(0.93-0.018*(n/30))':x='(iw-ow)*(0.08*(n/30))':y='(ih-oh)/2'`;
  } else if (name === "handheld") {
    cropExpr = `w='iw*0.94':h='ih*0.94':x='(iw-ow)/2+(iw-ow)*0.03*sin(6*(n/30))':y='(ih-oh)/2+(ih-oh)*0.03*cos(4*(n/30))'`;
  } else if (name === "macro") {
    cropExpr = `w='iw*(0.72-0.025*(n/30))':h='ih*(0.72-0.025*(n/30))':x='(iw-ow)/2':y='(ih-oh)/2'`;
  } else {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }
  return `scale=${Math.round(width * 1.35 / 2) * 2}:${Math.round(height * 1.35 / 2) * 2}:force_original_aspect_ratio=increase,crop=${cropExpr},scale=${width}:${height}`;
}

function getTransitionFilter(transition: any, duration: number): string {
  if (!transition) return "";
  const id = typeof transition === "string" ? transition : transition.id;
  const intensity = typeof transition === "object" ? transition.intensity ?? 0.5 : 0.5;
  const direction = typeof transition === "object" ? transition.direction ?? "left" : "left";
  const name = id.toLowerCase().replace(/[^a-z]/g, "");

  const fadeDuration = 0.25;

  // 1. Basic / Fades
  if (name === "fade" || name === "crossdissolve" || name === "opacityblend" || name === "lumafade") {
    return `,fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${(duration - fadeDuration).toFixed(3)}:d=${fadeDuration}`;
  }
  if (name === "diptoblack") {
    return `,fade=t=in:st=0:d=0.3:color=black,fade=t=out:st=${(duration - 0.3).toFixed(3)}:d=0.3:color=black`;
  }
  if (name === "diptowhite" || name === "sunlightfade") {
    return `,fade=t=in:st=0:d=0.3:color=white,fade=t=out:st=${(duration - 0.3).toFixed(3)}:d=0.3:color=white`;
  }

  // 2. Slide / Push / Swipe
  if (name.includes("slide") || name.includes("push") || name.includes("swipe")) {
    const d = 0.35 * intensity;
    const dir = name.includes("right") || direction === "right" ? "right" :
                name.includes("up") || direction === "up" ? "up" :
                name.includes("down") || direction === "down" ? "down" : "left";

    if (dir === "left") {
      return `,crop=w=iw-40:h=ih-40:x='if(lt(t\\,${d})\\,20+20*(1-t/${d})\\,if(gt(t\\,${duration - d})\\,20+20*(t-${duration - d})/${d}\\,20))':y=20`;
    } else if (dir === "right") {
      return `,crop=w=iw-40:h=ih-40:x='if(lt(t\\,${d})\\,20-20*(1-t/${d})\\,if(gt(t\\,${duration - d})\\,20-20*(t-${duration - d})/${d}\\,20))':y=20`;
    } else if (dir === "up") {
      return `,crop=w=iw-40:h=ih-40:x=20:y='if(lt(t\\,${d})\\,20+20*(1-t/${d})\\,if(gt(t\\,${duration - d})\\,20+20*(t-${duration - d})/${d}\\,20))'`;
    } else {
      return `,crop=w=iw-40:h=ih-40:x=20:y='if(lt(t\\,${d})\\,20-20*(1-t/${d})\\,if(gt(t\\,${duration - d})\\,20-20*(t-${duration - d})/${d}\\,20))'`;
    }
  }

  // 3. Zoom / Scale
  if (name.includes("zoom") || name === "epicreveal" || name === "punchzoom") {
    const d = 0.35 * intensity;
    if (name.includes("out")) {
      return `,crop=w='iw*(0.88+0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':h='ih*(0.88+0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
    } else {
      return `,crop=w='iw*(1.0-0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':h='ih*(1.0-0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
    }
  }

  // 4. Glitch / RGB Split / Cyber
  if (name.includes("glitch") || name.includes("rgb") || name.includes("signal") || name.includes("static")) {
    const d = 0.25 * intensity;
    return `,crop=w=iw-40:h=ih-40:x='20+if(lt(t\\,${d})\\,15*sin(150*t)\\,if(gt(t\\,${duration - d})\\,15*sin(150*t)\\,0))':y='20+if(lt(t\\,${d})\\,15*cos(120*t)\\,if(gt(t\\,${duration - d})\\,15*cos(120*t)\\,0))'`;
  }

  // 5. Light / Flare / Flash / Glow
  if (name.includes("flash") || name.includes("flare") || name.includes("light") || name.includes("glow")) {
    const d = 0.2 * intensity;
    const colorFilter = name.includes("golden") ? ",hue=h=30:s=1.5" : "";
    return `,eq=brightness='if(lt(t\\,${d})\\,0.7*(1-t/${d})\\,if(gt(t\\,${duration - d})\\,0.7*(t-${duration - d})/${d}\\,0))':eval=1${colorFilter}`;
  }

  // 6. Action / Camera Shake
  if (name === "camerashake" || name.includes("impact") || name.includes("explosion") || name.includes("whip")) {
    const d = 0.3 * intensity;
    return `,crop=w=iw-30:h=ih-30:x='15+if(lt(t\\,${d})\\,12*sin(80*t)\\,0)':y='15+if(lt(t\\,${d})\\,12*cos(60*t)\\,0)'`;
  }

  // 7. General Mask / Wipe fallback
  if (name.includes("wipe") || name.includes("mask") || name.includes("shapes") || name.includes("reveal")) {
    return `,fade=t=in:st=0:d=0.2,fade=t=out:st=${(duration - 0.2).toFixed(3)}:d=0.2`;
  }

  return "";
}

export async function renderVideo(spec: RenderSpec) {
  if (!spec.scenes.length) throw new Error("Render செய்ய stock footage தேவை");
  
  // Ensure we have Whoosh / Swipe sound effects
  await ensureAudioAssetsExist();

  const localFont = path.join(process.cwd(), "arial.ttf");
  try {
    await fsp.access(localFont).catch(async () => {
      await fsp.copyFile("C:/Windows/Fonts/arial.ttf", localFont);
    });
  } catch { /* ignore */ }
  const directory = path.dirname(spec.outputPath);
  const workDir = path.join(directory, "render-work");
  await fsp.mkdir(workDir, { recursive: true });
  const { width, height } = dimensions(spec.aspectRatio);
  const audioDuration = await probeAudioDuration(spec.audioPath);
  const duration = spec.targetDuration;
  // scenes-ன் sentence-estimated durations, drift தவிர்க்க duration-க்கு சரியாக பொருந்தும்படி rescale செய்யப்படும்
  const rawTotal = spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0) || duration;
  const scale = duration / rawTotal;
  const normalized: string[] = [];

  const allowedMotions = spec.animate === false
    ? ["Static"]
    : (spec.styleConfig?.renderConfig?.cameraMotions || ["Zoom In", "Zoom Out", "Pan Left", "Pan Right"]);

  // 1. Compile each scene video clip
  for (let index = 0; index < spec.scenes.length; index += 1) {
    const clipPath = spec.scenes[index].path;
    const sceneDuration = Math.max(0.3, spec.scenes[index].seconds * scale);
    const output = path.join(workDir, `scene-${index}.mp4`);
    const isImage = /\.(jpe?g|png|webp)$/i.test(clipPath);

    const motion = allowedMotions[index % allowedMotions.length] || "Static";
    const transition = spec.scenes[index].transition || "none";

    const motionFilter = getCameraMotionFilter(motion, width, height);
    const transitionFilter = getTransitionFilter(transition, sceneDuration);
    const filterGraph = `${motionFilter}${transitionFilter},format=yuv420p`;

    if (isImage) {
      await runFfmpeg(["-loop", "1", "-i", clipPath, "-t", sceneDuration.toFixed(3), "-r", "30", "-vf", filterGraph, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", output]);
    } else {
      await runFfmpeg(["-stream_loop", "-1", "-i", clipPath, "-t", sceneDuration.toFixed(3), "-r", "30", "-vf", filterGraph, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", output]);
    }
    normalized.push(output);
  }

  const concatFile = path.join(workDir, "concat.txt");
  await fsp.writeFile(concatFile, normalized.map((file) => `file '${concatPath(file)}'`).join("\n"), "utf8");
  const videoOnly = path.join(workDir, "video.mp4");
  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-r", "30", "-pix_fmt", "yuv420p", videoOnly]);

  // 2. Gather all transition audio effects with their timestamps
  const audioOverlays: { path: string; delayMs: number; volume: number }[] = [];
  let currentTimestamp = 0;
  for (let i = 0; i < spec.scenes.length - 1; i++) {
    const sceneDuration = Math.max(0.3, spec.scenes[i].seconds * scale);
    currentTimestamp += sceneDuration;
    
    const transition = spec.scenes[i].transition;
    if (transition && transition.id !== "hard_cut") {
      const preset = transitionPresetsMap.get(transition.id);
      if (preset && preset.audioEffect?.enabled) {
        const audioPath = path.resolve(process.cwd(), "public", preset.audioEffect.asset.replace(/^\//, ""));
        audioOverlays.push({
          path: audioPath,
          delayMs: Math.round(currentTimestamp * 1000),
          volume: preset.audioEffect.volume
        });
      }
    }
  }

  // 3. Compile audio mixing arguments
  const audioArgs: string[] = [];
  let filterComplex = "";
  const bgmInputIndex = 2 + audioOverlays.length;
  
  if (audioOverlays.length > 0) {
    for (const overlay of audioOverlays) {
      audioArgs.push("-i", overlay.path);
    }
    
    const mixInputs: string[] = [spec.bgmEnabled ? "[mixed_base]" : "[main_audio]"];
    let filterString = "";
    if (spec.bgmEnabled) {
      filterString += `[1:a]apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}[vo_padded];[${bgmInputIndex}:a]volume=0.15[bgm_soft];[vo_padded][bgm_soft]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed_base];`;
    } else {
      filterString += `[1:a]apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}[main_audio];`;
    }
    
    for (let idx = 0; idx < audioOverlays.length; idx++) {
      const delay = audioOverlays[idx].delayMs;
      const vol = audioOverlays[idx].volume;
      const inLabel = `${idx + 2}:a`;
      const outLabel = `a_overlay_${idx}`;
      filterString += `[${inLabel}]adelay=${delay}|${delay},volume=${vol}[${outLabel}];`;
      mixInputs.push(`[${outLabel}]`);
    }
    
    filterString += `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[aout]`;
    filterComplex = filterString;
  } else if (spec.bgmEnabled) {
    filterComplex = `[1:a]apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}[vo_padded];[${bgmInputIndex}:a]volume=0.15[bgm_soft];[vo_padded][bgm_soft]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;
  }

  let splitShortsFilter = "";
  let splitShortsInputs: string[] = [];

  if (spec.splitShortsEnabled) {
    const pathParts = spec.outputPath.replaceAll("\\", "/").split("/");
    const projectIdStr = pathParts[pathParts.length - 2];
    const projectId = Number(projectIdStr);

    let thumbnailPath = null;
    if (projectId && !isNaN(projectId)) {
      const { database } = require("@/lib/database");
      const db = database();
      try {
        const row = db.prepare("SELECT thumbnail_path FROM projects WHERE id = ?").get(projectId);
        thumbnailPath = row?.thumbnail_path || null;
      } catch (e) {
        console.error("Database query failed:", e);
      }
    }

    const firstFrame = path.join(workDir, "first-frame.png").replaceAll("\\", "/");
    let topImageInput = "";
    const { existsSync } = require("node:fs");
    if (thumbnailPath && existsSync(thumbnailPath)) {
      topImageInput = thumbnailPath.replaceAll("\\", "/");
    } else {
      await runFfmpeg([
        "-ss", "00:00:00",
        "-i", videoOnly,
        "-vframes", "1",
        "-y",
        firstFrame
      ]).catch(() => {});
      topImageInput = existsSync(firstFrame) ? firstFrame : videoOnly;
    }

    splitShortsInputs = ["-loop", "1", "-i", topImageInput];
  }

  const bgmFilePath = path.resolve(process.cwd(), "public/audio/bgm-devotional.wav");
  if (spec.bgmEnabled) {
    await ensureBgmAssetExists();
  }

  const args = ["-i", videoOnly];
  if (audioOverlays.length > 0) {
    args.push("-i", spec.audioPath, ...audioArgs);
  } else {
    args.push("-i", spec.audioPath);
  }
  if (spec.bgmEnabled) {
    args.push("-stream_loop", "-1", "-i", bgmFilePath);
  }
  
  if (spec.splitShortsEnabled) {
    args.push(...splitShortsInputs);
  }
  
  args.push("-t", duration.toFixed(3));

  let finalFilterComplex = "";
  let mapVideo = "0:v:0";
  let mapAudio = "1:a:0";
  let useAudioFilter = true;

  if (audioOverlays.length > 0 || spec.bgmEnabled) {
    finalFilterComplex = filterComplex;
    mapAudio = "[aout]";
    useAudioFilter = false;
  }

  if (spec.splitShortsEnabled) {
    const topImageInputIndex = 2 + audioOverlays.length + (spec.bgmEnabled ? 1 : 0);
    const halfH = Math.round(height * 0.45);
    const footerH = Math.round(height * 0.10);
    
    let videoChain = "";
    if (spec.subtitlePath) {
      const escapedSub = spec.subtitlePath.replaceAll("\\", "/").replace(":", "\\:");
      videoChain = `[0:v]scale=${width}:${halfH}:force_original_aspect_ratio=increase,crop=${width}:${halfH}[mid_crop]; ` +
                   `[mid_crop]subtitles=${escapedSub}[mid_subs]; `;
    } else {
      videoChain = `[0:v]scale=${width}:${halfH}:force_original_aspect_ratio=increase,crop=${width}:${halfH}[mid_subs]; `;
    }

    videoChain += `[${topImageInputIndex}:v]scale=${width}:${halfH}:force_original_aspect_ratio=increase,crop=${width}:${halfH}[top]; ` +
                  `[top][mid_subs]vstack=inputs=2[stacked]; ` +
                  `[stacked]pad=${width}:${height}:0:0:black[padded]; ` +
                  `[padded]drawbox=y=${halfH * 2}:w=${width}:h=${footerH}:color=0xC21807@1:t=fill[footer]; ` +
                  `[footer]drawtext=fontfile=arial.ttf:text='LIKE   •   COMMENT   •   SUBSCRIBE':fontsize=42:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${halfH * 2}+(${footerH}-text_h)/2[out_v]`;

    if (finalFilterComplex) {
      finalFilterComplex += "; " + videoChain;
    } else {
      finalFilterComplex = videoChain;
    }
    mapVideo = "[out_v]";
  }

  if (finalFilterComplex) {
    args.push("-filter_complex", finalFilterComplex);
    args.push("-map", mapVideo);
    args.push("-map", mapAudio);
    if (useAudioFilter && audioOverlays.length === 0) {
      args.push("-af", `apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}`);
    }
  } else {
    args.push("-map", mapVideo);
    args.push("-map", mapAudio);
    args.push("-af", `apad=pad_dur=${Math.max(0, duration - audioDuration).toFixed(3)}`);
    
    let filterString = "";
    if (spec.subtitlePath) {
      filterString += `subtitles=${spec.subtitlePath.replaceAll("\\", "/").replace(":", "\\:")}`;
    }
    if (spec.ctaEnabled && spec.ctaPosition) {
      const boxW = Math.round(width * 0.7);
      const boxH = Math.round(height * 0.06);
      const boxX = Math.round((width - boxW) / 2);
      const boxY = height - Math.round(height / 8);
      const fontSize = Math.round(height * 0.024);
      const textY = boxY + Math.round(boxH / 2);
      const boxFilter = `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.65:t=fill`;
      const textFilter = `drawtext=text='Like  |  Subscribe  |  Comment':fontcolor=white:fontsize=${fontSize}:x=(${width}-tw)/2:y=${textY}-th/2:fontfile=arial.ttf`;
      let enableExpr = "";
      if (spec.ctaPosition === "start") enableExpr = ":enable=lt(t\\,5)";
      else if (spec.ctaPosition === "end") enableExpr = `:enable=gt(t\\,${(duration - 5).toFixed(3)})`;
      else if (spec.ctaPosition === "both") enableExpr = `:enable=lt(t\\,5)+gt(t\\,${(duration - 5).toFixed(3)})`;
      if (filterString) filterString += ",";
      filterString += `${boxFilter}${enableExpr},${textFilter}${enableExpr}`;
    }
    if (filterString) {
      args.push("-vf", filterString);
    }
  }
  
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", spec.outputPath);
  await runFfmpeg(args);
  return { outputPath: spec.outputPath, duration, audioDuration, width, height };
}
