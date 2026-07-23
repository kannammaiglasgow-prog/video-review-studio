import { NextResponse } from "next/server";
import { getChannelDashboardSummary } from "@/lib/database";
import { isYoutubeConnected, type ChannelType } from "@/services/providers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const CHANNELS: { key: ChannelType; label: string }[] = [
  { key: "story", label: "Tamil Story" },
  { key: "english", label: "English Stories" },
  { key: "food", label: "Food Business" },
  { key: "devotional", label: "Sivan Arul (Devotional)" },
  { key: "sanatana", label: "Sanatana Spirit (English)" },
  { key: "news", label: "Tamil Politics Star (News)" },
];

// GET → at-a-glance summary for every channel, for the home dashboard grid.
export async function GET() {
  const channels = CHANNELS.map(({ key, label }) => {
    const summary = getChannelDashboardSummary(key);
    return {
      key,
      label,
      connected: isYoutubeConnected(key),
      ...summary,
    };
  });
  return NextResponse.json({ channels });
}
