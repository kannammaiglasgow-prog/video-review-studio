import { config } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { StockAsset, StockMediaProvider } from "./types";

export const pexelsProvider: StockMediaProvider = {
  async search(query, orientation) {
    if (!config.api.pexels) return [];
    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query); url.searchParams.set("orientation", orientation); url.searchParams.set("per_page", "8");
    const response = await fetch(url, { headers: { Authorization: config.api.pexels } });
    if (!response.ok) throw new Error(`Pexels API ${response.status}`);
    const data = await response.json();
    return (data.videos || []).flatMap((video: { id: number; width: number; height: number; user?: { name?: string }; video_files?: { link: string; width: number; height: number; file_type?: string }[] }) => {
      const file = video.video_files?.filter((item) => item.file_type === "video/mp4").sort((a, b) => b.width - a.width)[0];
      return file ? [{ provider: "pexels", id: String(video.id), url: file.link, width: file.width, height: file.height, attribution: video.user?.name }] : [];
    }) as StockAsset[];
  },
};

export const pixabayProvider: StockMediaProvider = {
  async search(query, orientation) {
    if (!config.api.pixabay) return [];
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", config.api.pixabay); url.searchParams.set("q", query); url.searchParams.set("per_page", "8");
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

export async function searchStockMedia(terms: string[], orientation: "portrait" | "landscape") {
  const assets: StockAsset[] = [];
  for (const term of terms.slice(0, 5)) {
    const pexels = await pexelsProvider.search(term, orientation);
    assets.push(...pexels.slice(0, 2));
    if (pexels.length < 2) assets.push(...(await pixabayProvider.search(term, orientation)).slice(0, 2 - pexels.length));
  }
  return assets;
}

export async function downloadStockMedia(assets: StockAsset[], directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const files: string[] = [];
  for (let index = 0; index < assets.length; index += 1) {
    const response = await fetch(assets[index].url);
    if (!response.ok) continue;
    const filePath = path.join(directory, `stock-${index}.mp4`);
    await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    files.push(filePath);
  }
  return files;
}
