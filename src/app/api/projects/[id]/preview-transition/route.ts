import { NextResponse } from "next/server";
import { database } from "@/lib/database";
import path from "node:path";
import fsp from "node:fs/promises";
import { config } from "@/lib/config";
import { dimensions, runFfmpeg, ensureAudioAssetsExist } from "@/services/render/ffmpeg";
import { downloadApprovedClips } from "@/services/providers/stock-media";
import { transitionPresetsMap } from "../../../../../../packages/transition-library/src";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const projectId = Number(id);
  const db = database();
  
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
  if (!project) return NextResponse.json({ error: "Project missing" }, { status: 404 });
  
  try {
    const body = await request.json();
    const sceneIndex = Number(body.sceneIndex);
    const customTransition = body.transition; // { id, durationFrames, intensity, direction, colour }
    
    // Load scenes from render job payload
    const renderJob = db.prepare("SELECT payload FROM render_jobs WHERE project_id=? ORDER BY id DESC LIMIT 1").get(projectId) as { payload: string | null } | undefined;
    if (!renderJob || !renderJob.payload) throw new Error("Scene list payload missing");
    const { scenes } = JSON.parse(renderJob.payload);
    
    if (sceneIndex < 0 || sceneIndex >= scenes.length - 1) {
      return NextResponse.json({ error: "Invalid boundary index" }, { status: 400 });
    }
    
    const prevScene = scenes[sceneIndex];
    const nextScene = scenes[sceneIndex + 1];
    
    const projectDir = path.join(config.mediaRoot, String(projectId));
    const previewDir = path.join(projectDir, "preview-transition");
    await fsp.mkdir(previewDir, { recursive: true });
    
    // Resolve asset paths (downloading if not present)
    const orientation = project.aspect_ratio === "9:16" ? "portrait" : "landscape";
    const downloadFolder = path.join(projectDir, "stock");
    const resolvedPaths = await downloadApprovedClips([prevScene, nextScene], orientation, downloadFolder);
    
    const prevPath = resolvedPaths[0];
    const nextPath = resolvedPaths[1];
    
    // Setup dimensions and files
    const { width, height } = dimensions(project.aspect_ratio);
    await ensureAudioAssetsExist();
    
    const prevTrimmed = path.join(previewDir, "prev_trimmed.mp4");
    const nextTrimmed = path.join(previewDir, "next_trimmed.mp4");
    const previewVideoOnly = path.join(previewDir, "preview_video.mp4");
    const finalPreview = path.join(previewDir, `preview-${sceneIndex}.mp4`);
    
    // Clean up old runs
    try { await fsp.unlink(prevTrimmed); } catch {}
    try { await fsp.unlink(nextTrimmed); } catch {}
    try { await fsp.unlink(previewVideoOnly); } catch {}
    try { await fsp.unlink(finalPreview); } catch {}

    // Transition filters helper
    const id = customTransition.id;
    const intensity = customTransition.intensity ?? 0.5;
    const direction = customTransition.direction ?? "left";
    const name = id.toLowerCase().replace(/[^a-z]/g, "");
    
    const d = 0.35 * intensity;
    let prevFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    let nextFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    
    // Apply slide/zoom/glitch/fade filters to preview trims
    if (name === "fade" || name === "crossdissolve" || name === "opacityblend" || name === "lumafade") {
      prevFilter += `,fade=t=out:st=1.2:d=0.3`;
      nextFilter += `,fade=t=in:st=0:d=0.3`;
    } else if (name === "diptoblack") {
      prevFilter += `,fade=t=out:st=1.2:d=0.3:color=black`;
      nextFilter += `,fade=t=in:st=0:d=0.3:color=black`;
    } else if (name === "diptowhite" || name === "sunlightfade") {
      prevFilter += `,fade=t=out:st=1.2:d=0.3:color=white`;
      nextFilter += `,fade=t=in:st=0:d=0.3:color=white`;
    } else if (name.includes("slide") || name.includes("push") || name.includes("swipe")) {
      const dir = name.includes("right") || direction === "right" ? "right" :
                  name.includes("up") || direction === "up" ? "up" :
                  name.includes("down") || direction === "down" ? "down" : "left";
      if (dir === "left") {
        prevFilter += `,crop=w=iw-40:h=ih-40:x='if(gt(t\\,${1.5 - d})\\,20+20*(t-${1.5 - d})/${d}\\,20)':y=20`;
        nextFilter += `,crop=w=iw-40:h=ih-40:x='if(lt(t\\,${d})\\,20+20*(1-t/${d})\\,20)':y=20`;
      } else if (dir === "right") {
        prevFilter += `,crop=w=iw-40:h=ih-40:x='if(gt(t\\,${1.5 - d})\\,20-20*(t-${1.5 - d})/${d}\\,20)':y=20`;
        nextFilter += `,crop=w=iw-40:h=ih-40:x='if(lt(t\\,${d})\\,20-20*(1-t/${d})\\,20)':y=20`;
      } else if (dir === "up") {
        prevFilter += `,crop=w=iw-40:h=ih-40:x=20:y='if(gt(t\\,${1.5 - d})\\,20+20*(t-${1.5 - d})/${d}\\,20)'`;
        nextFilter += `,crop=w=iw-40:h=ih-40:x=20:y='if(lt(t\\,${d})\\,20+20*(1-t/${d})\\,20)'`;
      } else {
        prevFilter += `,crop=w=iw-40:h=ih-40:x=20:y='if(gt(t\\,${1.5 - d})\\,20-20*(t-${1.5 - d})/${d}\\,20)'`;
        nextFilter += `,crop=w=iw-40:h=ih-40:x=20:y='if(lt(t\\,${d})\\,20-20*(1-t/${d})\\,20)'`;
      }
    } else if (name.includes("zoom") || name === "epicreveal" || name === "punchzoom") {
      if (name.includes("out")) {
        prevFilter += `,crop=w='iw*(1.0-0.12*if(gt(t\\,${1.5 - d})\\,(t-${1.5 - d})/${d}\\,0.0))':h='ih*(1.0-0.12*if(gt(t\\,${1.5 - d})\\,(t-${1.5 - d})/${d}\\,0.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
        nextFilter += `,crop=w='iw*(0.88+0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':h='ih*(0.88+0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
      } else {
        prevFilter += `,crop=w='iw*(1.0-0.12*if(gt(t\\,${1.5 - d})\\,(t-${1.5 - d})/${d}\\,0.0))':h='ih*(1.0-0.12*if(gt(t\\,${1.5 - d})\\,(t-${1.5 - d})/${d}\\,0.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
        nextFilter += `,crop=w='iw*(1.0-0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':h='ih*(1.0-0.12*if(lt(t\\,${d})\\,t/${d}\\,1.0))':x='(iw-ow)/2':y='(ih-oh)/2'`;
      }
    } else if (name.includes("glitch") || name.includes("rgb") || name.includes("signal") || name.includes("static")) {
      prevFilter += `,crop=w=iw-40:h=ih-40:x='20+if(gt(t\\,${1.5 - d})\\,15*sin(150*t)\\,0)':y='20+if(gt(t\\,${1.5 - d})\\,15*cos(120*t)\\,0)'`;
      nextFilter += `,crop=w=iw-40:h=ih-40:x='20+if(lt(t\\,${d})\\,15*sin(150*t)\\,0)':y='20+if(lt(t\\,${d})\\,15*cos(120*t)\\,0)'`;
    } else if (name.includes("flash") || name.includes("flare") || name.includes("light") || name.includes("glow")) {
      prevFilter += `,eq=brightness='if(gt(t\\,${1.5 - d})\\,0.7*(t-${1.5 - d})/${d}\\,0)':eval=1`;
      nextFilter += `,eq=brightness='if(lt(t\\,${d})\\,0.7*(1-t/${d})\\,0)':eval=1`;
    } else if (name === "camerashake" || name.includes("impact") || name.includes("explosion") || name.includes("whip")) {
      prevFilter += `,crop=w=iw-30:h=ih-30:x='15+if(gt(t\\,${1.5 - d})\\,12*sin(80*t)\\,0)':y='15+if(gt(t\\,${1.5 - d})\\,12*cos(60*t)\\,0)'`;
      nextFilter += `,crop=w=iw-30:h=ih-30:x='15+if(lt(t\\,${d})\\,12*sin(80*t)\\,0)':y='15+if(lt(t\\,${d})\\,12*cos(60*t)\\,0)'`;
    } else {
      prevFilter += `,fade=t=out:st=1.3:d=0.2`;
      nextFilter += `,fade=t=in:st=0:d=0.2`;
    }
    
    prevFilter += ",format=yuv420p";
    nextFilter += ",format=yuv420p";

    // Normalize and trim previous scene (last 1.5 seconds)
    // We use stream_loop -1 to avoid errors if the source is shorter than 1.5s
    const prevDuration = Math.max(1.5, prevScene.seconds);
    const prevStartSec = Math.max(0, prevDuration - 1.5);
    
    await runFfmpeg(["-ss", prevStartSec.toFixed(3), "-stream_loop", "-1", "-i", prevPath, "-t", "1.5", "-r", "30", "-vf", prevFilter, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", prevTrimmed]);
    
    // Normalize and trim next scene (first 1.5 seconds)
    await runFfmpeg(["-stream_loop", "-1", "-i", nextPath, "-t", "1.5", "-r", "30", "-vf", nextFilter, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", nextTrimmed]);

    // Concatenate trims
    const concatFile = path.join(previewDir, "concat.txt");
    await fsp.writeFile(concatFile, `file '${prevTrimmed.replaceAll("\\", "/")}'\nfile '${nextTrimmed.replaceAll("\\", "/")}'`, "utf8");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c:v", "copy", previewVideoOnly]);

    // Apply sound effect overlay
    const preset = transitionPresetsMap.get(id);
    if (preset && preset.audioEffect?.enabled) {
      const audioAssetPath = path.resolve(process.cwd(), "public", preset.audioEffect.asset.replace(/^\//, ""));
      const vol = preset.audioEffect.volume;
      
      // Delay whoosh by exactly 1.5s (1500ms) to sync with transition center
      const filterComplex = `[1:a]adelay=1500|1500,volume=${vol}[whoosh];[0:a][whoosh]amix=inputs=2:duration=first[aout]`;
      
      // Generate a 3-second silent base audio track
      const silentAudio = path.join(previewDir, "silent.wav");
      await runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:c=1", "-t", "3.0", silentAudio]);
      
      await runFfmpeg(["-i", previewVideoOnly, "-i", silentAudio, "-i", audioAssetPath, "-filter_complex", filterComplex, "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", finalPreview]);
      try { await fsp.unlink(silentAudio); } catch {}
    } else {
      // Return silent 3s video directly
      const silentAudio = path.join(previewDir, "silent.wav");
      await runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:c=1", "-t", "3.0", silentAudio]);
      await runFfmpeg(["-i", previewVideoOnly, "-i", silentAudio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", finalPreview]);
      try { await fsp.unlink(silentAudio); } catch {}
    }
    
    // Return relative URL path for the player
    const previewUrl = `/media/${projectId}/preview-transition/preview-${sceneIndex}.mp4?v=${Date.now()}`;
    return NextResponse.json({ success: true, url: previewUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to render transition preview" }, { status: 500 });
  }
}
