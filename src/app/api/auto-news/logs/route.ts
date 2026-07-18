import { NextResponse } from "next/server";
import { getRecentLogs } from "@/services/personal/auto-news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logs = getRecentLogs(80);
  return NextResponse.json(
    { logs: logs.reverse() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      }
    }
  );
}
