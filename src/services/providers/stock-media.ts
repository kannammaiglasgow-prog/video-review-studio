import { config } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { StockAsset, StockMediaProvider } from "./types";
import { detectImageType, imageExtension } from "@/lib/images";
import { database } from "@/lib/database";
import { runFfmpeg } from "../render/ffmpeg";

export const pexelsProvider: StockMediaProvider = {
  async search(query, orientation, limit = 8) {
    if (!config.api.pexels) return [];
    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query); url.searchParams.set("orientation", orientation); url.searchParams.set("per_page", String(Math.min(80, Math.max(1, limit))));
    const response = await fetch(url, { headers: { Authorization: config.api.pexels } });
    if (!response.ok) throw new Error(`Pexels API ${response.status}`);
    const data = await response.json();
    return (data.videos || []).flatMap((video: { id: number; width: number; height: number; user?: { name?: string }; video_files?: { link: string; width: number; height: number; file_type?: string }[] }) => {
      const file = video.video_files?.filter((item) => item.file_type === "video/mp4").sort((a, b) => {
        const aLargest = Math.max(a.width, a.height); const bLargest = Math.max(b.width, b.height);
        const aOversized = aLargest > 1920 ? 1 : 0; const bOversized = bLargest > 1920 ? 1 : 0;
        return aOversized - bOversized || (b.width * b.height) - (a.width * a.height);
      })[0];
      return file ? [{ provider: "pexels", id: String(video.id), url: file.link, width: file.width, height: file.height, attribution: video.user?.name }] : [];
    }) as StockAsset[];
  },
};

export const pixabayProvider: StockMediaProvider = {
  async search(query, orientation, limit = 8) {
    if (!config.api.pixabay) return [];
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", config.api.pixabay); url.searchParams.set("q", query); url.searchParams.set("per_page", String(Math.min(200, Math.max(3, limit))));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Pixabay API ${response.status}`);
    const data = await response.json();
    return (data.hits || []).flatMap((video: { id: number; user?: string; videos?: Record<string, { url: string; width: number; height: number }> }) => {
      const files = Object.values(video.videos || {}).filter((item) => orientation === "portrait" ? item.height >= item.width : item.width >= item.height).sort((a, b) => b.width - a.width);
      const file = files[0];
      return file ? [{ provider: "pixabay", id: String(video.id), url: file.url, width: file.width, height: file.height, attribution: video.user }] : [];
    }) as StockAsset[];
  },
};

export async function searchStockImages(query: string, orientation: "portrait" | "landscape", limit = 8) {
  const assets: StockAsset[] = [];
  if (config.api.pexels) {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query); url.searchParams.set("orientation", orientation); url.searchParams.set("per_page", String(Math.min(80, Math.max(1, limit))));
    const response = await fetch(url, { headers: { Authorization: config.api.pexels } });
    if (response.ok) {
      const data = await response.json();
      for (const photo of (data.photos || []) as { id: number; width: number; height: number; photographer?: string; src?: { original?: string; large2x?: string; large?: string } }[]) {
        const full = photo.src?.large2x || photo.src?.original;
        if (full) assets.push({ provider: "pexels", kind: "image", id: String(photo.id), url: full, previewUrl: photo.src?.large || full, width: photo.width, height: photo.height, attribution: photo.photographer });
      }
    }
  }
  if (config.api.pixabay) {
    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", config.api.pixabay); url.searchParams.set("q", query); url.searchParams.set("per_page", String(Math.min(200, Math.max(3, limit))));
    url.searchParams.set("image_type", "photo"); url.searchParams.set("orientation", orientation === "portrait" ? "vertical" : "horizontal");
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      for (const hit of (data.hits || []) as { id: number; imageWidth: number; imageHeight: number; user?: string; largeImageURL?: string; webformatURL?: string }[]) {
        if (hit.largeImageURL) assets.push({ provider: "pixabay", kind: "image", id: String(hit.id), url: hit.largeImageURL, previewUrl: hit.webformatURL || hit.largeImageURL, width: hit.imageWidth, height: hit.imageHeight, attribution: hit.user });
      }
    }
  }
  return assets;
}

const queryTagMap: Record<string, string> = {
  "கடல்": "beach", "கடற்கரை": "beach", "beach": "beach", "sea": "beach", "ocean": "beach",
  "சூரிய": "sunset", "மாலை": "sunset", "sunset": "sunset", "sunrise": "sunset",
  "குழந்": "kids", "விளையா": "kids", "kids": "kids", "kid": "kids", "child": "kids", "children": "kids",
  "உணவு": "food", "சாப்பாடு": "food", "உணவகம்": "food", "food": "food", "dinner": "food", "lunch": "food", "restaurant": "food",
  "கோவி": "temple", "கோயி": "temple", "temple": "temple",
  "பயண": "travel", "travel": "travel", "trip": "travel",
  "மலை": "nature", "காடு": "nature", "இயற்கை": "nature", "nature": "nature",
  "நண்ப": "friends", "friends": "friends", "party": "friends"
};

export async function getGeneralLocalClips(orientation: "portrait" | "landscape", desiredCount = 6, localFolderId: number): Promise<StockAsset[]> {
  try {
    const db = database();
    const unique = new Map<string, StockAsset>();

    const rows = db.prepare(`
      SELECT s.*, f.absolute_path, f.orientation
      FROM local_media_scenes s
      JOIN local_media_files f ON s.file_id = f.id
      WHERE f.scan_status = 'completed' AND f.folder_id = ? AND f.orientation = ?
      ORDER BY RANDOM()
      LIMIT ?
    `).all(localFolderId, orientation, desiredCount) as any[];

    for (const row of rows) {
      const assetId = String(row.id);
      unique.set(`local:video:${assetId}`, {
        provider: "local",
        kind: "video",
        id: assetId,
        url: row.absolute_path,
        previewUrl: row.absolute_path,
        width: orientation === "portrait" ? 1080 : 1920,
        height: orientation === "portrait" ? 1920 : 1080,
        bestStart: row.best_start,
        bestEnd: row.best_end
      } as any);
    }
    return [...unique.values()];
  } catch (err) {
    console.error("General local library query failed", err);
    return [];
  }
}

import { searchLocalSemantic } from "../personal/vector-store";

export async function searchLocalLibrary(terms: string[], orientation: "portrait" | "landscape", desiredCount = 6, localFolderId?: number): Promise<StockAsset[]> {
  try {
    const query = terms.join(" ");
    if (!query.trim()) return [];

    const matches = await searchLocalSemantic(query, orientation, desiredCount);
    const unique = new Map<string, StockAsset>();

    for (const match of matches) {
      unique.set(`local:video:${match.sceneId}`, {
        provider: "local",
        kind: match.kind,
        id: String(match.sceneId),
        url: match.filePath,
        previewUrl: match.filePath,
        width: match.orientation === "portrait" ? 1080 : 1920,
        height: match.orientation === "portrait" ? 1920 : 1080,
        bestStart: match.start,
        bestEnd: match.end
      } as any);
    }

    return [...unique.values()];
  } catch (err) {
    console.error("Local library search failed", err);
    return [];
  }
}

export async function searchStockMedia(
  terms: string[], 
  orientation: "portrait" | "landscape", 
  desiredCount = 6, 
  bRollSource: "stock" | "personal" | "mix" = "stock",
  localFolderId?: number
) {
  const unique = new Map<string, StockAsset>();

  if (bRollSource === "personal" || bRollSource === "mix") {
    const locals = await searchLocalLibrary(terms, orientation, desiredCount, localFolderId);
    for (const asset of locals) {
      unique.set(assetKey(asset), asset);
    }
    
    // Fallback: if personal search was empty or insufficient, fetch random general clips from the selected folder
    if (unique.size < desiredCount && localFolderId) {
      const generalLocals = await getGeneralLocalClips(orientation, desiredCount - unique.size, localFolderId);
      for (const asset of generalLocals) {
        unique.set(assetKey(asset), asset);
      }
    }

    if (bRollSource === "personal") {
      return [...unique.values()];
    }
  }

  const remainingCount = desiredCount - unique.size;
  if (remainingCount <= 0) return [...unique.values()];

  const searchTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 10);
  if (!searchTerms.length) searchTerms.push("people lifestyle", "city", "technology", "nature", "abstract background");
  
  const perTerm = Math.min(80, Math.max(8, Math.ceil(remainingCount / searchTerms.length) + 4));
  const add = (asset: StockAsset) => unique.set(assetKey(asset), { ...asset, kind: "video" });

  for (const term of searchTerms) {
    const [pexels, pixabay] = await Promise.all([
      pexelsProvider.search(term, orientation, perTerm).catch(() => []),
      pixabayProvider.search(term, orientation, perTerm).catch(() => []),
    ]);
    const maximum = Math.max(pexels.length, pixabay.length);
    for (let index = 0; index < maximum; index += 1) {
      if (pexels[index]) add(pexels[index]);
      if (pixabay[index]) add(pixabay[index]);
      if (unique.size >= desiredCount) return [...unique.values()];
    }
  }

  for (const term of searchTerms) {
    const images = await searchStockImages(term, orientation, perTerm).catch(() => []);
    for (const image of images) {
      unique.set(assetKey(image), image);
      if (unique.size >= desiredCount) return [...unique.values()];
    }
  }
  return [...unique.values()];
}

function assetKey(asset: StockAsset) {
  return `${asset.provider}:${asset.kind || "video"}:${asset.id}`;
}

const genericSceneTerms = ["people lifestyle", "city", "technology", "nature", "abstract background"];

// ஒவ்வொரு scene index-க்கும் அதற்கே ஏற்ற terms-ஐ வைத்து தனித்தனியா தேடி, முழு video-க்குமான global uniqueness-ஐ பராமரிக்கும்.
// ஒரு scene-க்கு download தோல்வியடைந்தால், அதே scene index-க்கே மற்றொரு candidate-ஐ முயற்சிக்கும் — clip எண்ணிக்கை scene index-உடன் shift ஆகாது.
export async function downloadScenedStockMedia(sceneSearchTerms: string[][], orientation: "portrait" | "landscape", directory: string) {
  const sceneCount = sceneSearchTerms.length;
  await fs.mkdir(directory, { recursive: true });
  const staging = path.join(directory, `.download-${Date.now()}`);
  await fs.mkdir(staging, { recursive: true });
  const used = new Set<string>();
  const downloadedPaths = new Map<string, string>(); // maps assetKey -> local file path
  const searchCache = new Map<string, StockAsset[]>();
  const files: (string | null)[] = new Array(sceneCount).fill(null);

  const searchCached = async (terms: string[]) => {
    const key = terms.join("|");
    if (searchCache.has(key)) return searchCache.get(key)!;
    const results = await searchStockMedia(terms, orientation, 10).catch(() => [] as StockAsset[]);
    searchCache.set(key, results);
    return results;
  };

  const assetPool = new Map<string, StockAsset>();

  // Pass 1: Unique downloads (only download clips that haven't been used yet)
  for (let index = 0; index < sceneCount; index += 1) {
    const terms = sceneSearchTerms[index]?.length ? sceneSearchTerms[index] : genericSceneTerms;
    const candidates = [...(await searchCached(terms)), ...(await searchCached(genericSceneTerms))];
    for (const candidate of candidates) if (assetPool.size < 40) assetPool.set(assetKey(candidate), candidate);
    for (const candidate of candidates) {
      if (used.has(assetKey(candidate))) continue;
      try {
        const response = await fetch(candidate.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) continue;
        const data = Buffer.from(await response.arrayBuffer());
        const detectedImage = candidate.kind === "image" ? detectImageType(data) : null;
        if (candidate.kind === "image" && !detectedImage) continue;
        const extension = detectedImage ? imageExtension(detectedImage) : ".mp4";
        const filePath = path.join(staging, `stock-${index}${extension}`);
        await fs.writeFile(filePath, data);
        used.add(assetKey(candidate));
        downloadedPaths.set(assetKey(candidate), filePath);
        files[index] = filePath;
        break;
      } catch { continue; }
    }
  }

  // Pass 2: If any scenes still lack a clip, search specifically for unique images matching the scene's keywords
  for (let index = 0; index < sceneCount; index += 1) {
    if (files[index] !== null) continue;
    const terms = sceneSearchTerms[index]?.length ? sceneSearchTerms[index] : genericSceneTerms;
    
    let found = false;
    for (const term of terms) {
      try {
        const images = await searchStockImages(term, orientation, 20).catch(() => []);
        for (const image of images) {
          const key = assetKey(image);
          if (used.has(key)) continue;
          
          const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) continue;
          const data = Buffer.from(await response.arrayBuffer());
          const detectedImage = detectImageType(data);
          if (!detectedImage) continue;
          
          const extension = imageExtension(detectedImage);
          const filePath = path.join(staging, `stock-${index}${extension}`);
          await fs.writeFile(filePath, data);
          
          used.add(key);
          downloadedPaths.set(key, filePath);
          files[index] = filePath;
          assetPool.set(key, image);
          found = true;
          break;
        }
      } catch { continue; }
      if (found) break;
    }
  }

  // Pass 3: Fallback to unique generic images if any scenes still lack a clip
  for (let index = 0; index < sceneCount; index += 1) {
    if (files[index] !== null) continue;
    
    let found = false;
    for (const term of genericSceneTerms) {
      try {
        const images = await searchStockImages(term, orientation, 30).catch(() => []);
        for (const image of images) {
          const key = assetKey(image);
          if (used.has(key)) continue;
          
          const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) continue;
          const data = Buffer.from(await response.arrayBuffer());
          const detectedImage = detectImageType(data);
          if (!detectedImage) continue;
          
          const extension = imageExtension(detectedImage);
          const filePath = path.join(staging, `stock-${index}${extension}`);
          await fs.writeFile(filePath, data);
          
          used.add(key);
          downloadedPaths.set(key, filePath);
          files[index] = filePath;
          assetPool.set(key, image);
          found = true;
          break;
        }
      } catch { continue; }
      if (found) break;
    }
  }

  if (files.some((file) => !file)) {
    await fs.rm(staging, { recursive: true, force: true });
    return { files: [] as string[], assets: [...assetPool.values()] };
  }
  for (const file of await fs.readdir(directory)) {
    if (/^stock-\d+\.(mp4|jpe?g|png|webp)$/i.test(file)) await fs.rm(path.join(directory, file), { force: true });
  }
  const finalFiles: string[] = [];
  for (const stagedFile of files) {
    const output = path.join(directory, path.basename(stagedFile as string));
    await fs.rename(stagedFile as string, output);
    finalFiles.push(output);
  }
  await fs.rm(staging, { recursive: true, force: true });
  return { files: finalFiles, assets: [...assetPool.values()] };
}

export async function downloadApprovedClips(
  scenes: { index: number; chosenAsset: StockAsset | null; keywords: string[] }[],
  orientation: "portrait" | "landscape",
  directory: string
) {
  const sceneCount = scenes.length;
  await fs.mkdir(directory, { recursive: true });
  const staging = path.join(directory, `.download-${Date.now()}`);
  await fs.mkdir(staging, { recursive: true });
  const files: (string | null)[] = new Array(sceneCount).fill(null);
  const downloadedPaths = new Map<string, string>(); // maps assetKey -> local file path

  for (let index = 0; index < sceneCount; index += 1) {
    const scene = scenes[index];
    const asset = scene.chosenAsset;
    if (!asset) continue;

    const key = assetKey(asset);
    const existing = downloadedPaths.get(key);
    if (existing) {
      try {
        const extension = path.extname(existing);
        const filePath = path.join(staging, `stock-${index}${extension}`);
        await fs.copyFile(existing, filePath);
        files[index] = filePath;
        continue;
      } catch { /* ignore */ }
    }

    if ((asset.provider as string) === "uploaded") {
      try {
        const localPath = (asset as any).localPath || path.join(path.dirname(directory), `uploaded_scene_${index}${path.extname(asset.url || "")}`);
        const exists = await fs.stat(localPath).then(() => true).catch(() => false);
        if (exists) {
          const extension = path.extname(localPath);
          const filePath = path.join(staging, `stock-${index}${extension}`);
          await fs.copyFile(localPath, filePath);
          files[index] = filePath;
          downloadedPaths.set(key, filePath);
          continue;
        } else {
          const projectDir = path.dirname(directory);
          const projectFiles = await fs.readdir(projectDir).catch(() => []);
          const matchFile = projectFiles.find((f: string) => f.startsWith(`uploaded_scene_${index}`));
          if (matchFile) {
            const foundPath = path.join(projectDir, matchFile);
            const extension = path.extname(foundPath);
            const filePath = path.join(staging, `stock-${index}${extension}`);
            await fs.copyFile(foundPath, filePath);
            files[index] = filePath;
            downloadedPaths.set(key, filePath);
            continue;
          }
        }
      } catch (err) {
        console.error("Uploaded custom asset copy failed", err);
      }
    }

    if (asset.provider === "local") {
      try {
        const filePath = path.join(staging, `stock-${index}.mp4`);
        const duration = (asset as any).bestEnd - (asset as any).bestStart;
        await runFfmpeg([
          "-ss", String((asset as any).bestStart),
          "-i", asset.url,
          "-t", String(duration),
          "-c", "copy",
          filePath
        ]);
        files[index] = filePath;
        downloadedPaths.set(key, filePath);
        continue;
      } catch (err) {
        console.error("Local clip slicing failed", err);
      }
    }

    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) continue;
      const data = Buffer.from(await response.arrayBuffer());
      const detectedImage = asset.kind === "image" ? detectImageType(data) : null;
      if (asset.kind === "image" && !detectedImage) continue;
      const extension = detectedImage ? imageExtension(detectedImage) : ".mp4";
      const filePath = path.join(staging, `stock-${index}${extension}`);
      await fs.writeFile(filePath, data);
      downloadedPaths.set(key, filePath);
      files[index] = filePath;
    } catch { continue; }
  }

  const usedKeys = new Set<string>();
  for (let index = 0; index < sceneCount; index += 1) {
    const scene = scenes[index];
    if (scene.chosenAsset && files[index] !== null) {
      usedKeys.add(assetKey(scene.chosenAsset));
    }
  }

  // Fallback 1: Unique video/image from searchStockMedia
  for (let index = 0; index < sceneCount; index += 1) {
    if (files[index] !== null) continue;
    const scene = scenes[index];
    const terms = scene.keywords && scene.keywords.length ? scene.keywords : genericSceneTerms;
    const candidates = await searchStockMedia(terms, orientation, 10).catch(() => []);
    for (const candidate of candidates) {
      const key = assetKey(candidate);
      if (usedKeys.has(key)) continue;
      try {
        const response = await fetch(candidate.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) continue;
        const data = Buffer.from(await response.arrayBuffer());
        const detectedImage = candidate.kind === "image" ? detectImageType(data) : null;
        if (candidate.kind === "image" && !detectedImage) continue;
        const extension = detectedImage ? imageExtension(detectedImage) : ".mp4";
        const filePath = path.join(staging, `stock-${index}${extension}`);
        await fs.writeFile(filePath, data);
        usedKeys.add(key);
        files[index] = filePath;
        break;
      } catch { continue; }
    }
  }

  // Fallback 2: Unique images matching keywords
  for (let index = 0; index < sceneCount; index += 1) {
    if (files[index] !== null) continue;
    const scene = scenes[index];
    const terms = scene.keywords && scene.keywords.length ? scene.keywords : genericSceneTerms;
    let found = false;
    for (const term of terms) {
      try {
        const images = await searchStockImages(term, orientation, 20).catch(() => []);
        for (const image of images) {
          const key = assetKey(image);
          if (usedKeys.has(key)) continue;
          const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) continue;
          const data = Buffer.from(await response.arrayBuffer());
          const detectedImage = detectImageType(data);
          if (!detectedImage) continue;
          const extension = imageExtension(detectedImage);
          const filePath = path.join(staging, `stock-${index}${extension}`);
          await fs.writeFile(filePath, data);
          usedKeys.add(key);
          files[index] = filePath;
          found = true;
          break;
        }
      } catch { continue; }
      if (found) break;
    }
  }

  // Fallback 3: Generic unique images
  for (let index = 0; index < sceneCount; index += 1) {
    if (files[index] !== null) continue;
    let found = false;
    for (const term of genericSceneTerms) {
      try {
        const images = await searchStockImages(term, orientation, 30).catch(() => []);
        for (const image of images) {
          const key = assetKey(image);
          if (usedKeys.has(key)) continue;
          const response = await fetch(image.url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) continue;
          const data = Buffer.from(await response.arrayBuffer());
          const detectedImage = detectImageType(data);
          if (!detectedImage) continue;
          const extension = imageExtension(detectedImage);
          const filePath = path.join(staging, `stock-${index}${extension}`);
          await fs.writeFile(filePath, data);
          usedKeys.add(key);
          files[index] = filePath;
          found = true;
          break;
        }
      } catch { continue; }
      if (found) break;
    }
  }

  if (files.some((file) => !file)) {
    await fs.rm(staging, { recursive: true, force: true });
    throw new Error("Clips download failed completely during rendering");
  }

  for (const file of await fs.readdir(directory)) {
    if (/^stock-\d+\.(mp4|jpe?g|png|webp)$/i.test(file)) await fs.rm(path.join(directory, file), { force: true });
  }
  const finalFiles: string[] = [];
  for (const stagedFile of files) {
    const output = path.join(directory, path.basename(stagedFile as string));
    await fs.rename(stagedFile as string, output);
    finalFiles.push(output);
  }
  await fs.rm(staging, { recursive: true, force: true });
  return finalFiles;
}
