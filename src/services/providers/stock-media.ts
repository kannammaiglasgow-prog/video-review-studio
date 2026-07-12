import { config } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { StockAsset, StockMediaProvider } from "./types";
import { detectImageType, imageExtension } from "@/lib/images";

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

export async function searchStockMedia(terms: string[], orientation: "portrait" | "landscape", desiredCount = 6) {
  const searchTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 10);
  if (!searchTerms.length) searchTerms.push("people lifestyle", "city", "technology", "nature", "abstract background");
  const unique = new Map<string, StockAsset>();
  const perTerm = Math.min(80, Math.max(8, Math.ceil(desiredCount / searchTerms.length) + 4));
  const add = (asset: StockAsset) => unique.set(`${asset.provider}:video:${asset.id}`, { ...asset, kind: "video" });

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
      unique.set(`${image.provider}:image:${image.id}`, image);
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
        files[index] = filePath;
        break;
      } catch { continue; }
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
