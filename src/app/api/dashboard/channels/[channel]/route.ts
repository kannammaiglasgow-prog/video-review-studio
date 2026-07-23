import { NextResponse } from "next/server";
import { getChannelDashboardSummary, listStoryProjectsForChannel } from "@/lib/database";
import { isYoutubeConnected, youtubeChannelInfo, type ChannelType } from "@/services/providers/youtube";
import { CHANNELS } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IN_PROGRESS_STATUSES = new Set(["generating", "writing_scenes", "generating_audio", "script_ready", "fetching_media", "rendering"]);

// GET → full detail for one channel's dashboard page: connection status, what's
// currently in progress, and the full upload/creation history.
export async function GET(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  const known = CHANNELS.find((c) => c.key === channel);
  if (!known) return NextResponse.json({ error: "Unknown channel" }, { status: 404 });

  const connected = isYoutubeConnected(channel as ChannelType);
  let channelInfo: { id: string; title: string } | null = null;
  if (connected) {
    try {
      channelInfo = await youtubeChannelInfo(channel as ChannelType);
    } catch { /* token may be stale — connected=true still reflects a saved token */ }
  }

  const history = listStoryProjectsForChannel(channel, 50);
  const inProgress = history.filter((h) => IN_PROGRESS_STATUSES.has(h.status));
  const summary = getChannelDashboardSummary(channel);

  return NextResponse.json({
    key: known.key,
    label: known.label,
    connected,
    channelInfo,
    inProgress,
    history,
    todayCount: summary.todayCount,
  });
}
