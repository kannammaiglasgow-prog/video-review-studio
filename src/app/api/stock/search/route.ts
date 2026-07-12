import { NextResponse } from "next/server";
import { pexelsProvider, pixabayProvider, searchStockImages } from "@/services/providers/stock-media";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") || "").trim();
    if (query.length < 2) return NextResponse.json({ error: "Keyword கொடுக்கவும்" }, { status: 400 });
    const orientation = params.get("orientation") === "landscape" ? "landscape" : "portrait";
    if (params.get("type") === "image") {
      const images = await searchStockImages(query, orientation).catch(() => []);
      return NextResponse.json({ results: images.slice(0, 12) });
    }
    const [pexels, pixabay] = await Promise.all([
      pexelsProvider.search(query, orientation).catch(() => []),
      pixabayProvider.search(query, orientation).catch(() => []),
    ]);
    return NextResponse.json({ results: [...pexels, ...pixabay].map((asset) => ({ ...asset, kind: "video" })).slice(0, 12) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search தோல்வியடைந்தது" }, { status: 400 });
  }
}
