import { NextResponse } from "next/server";
import { getRecentLogs } from "@/services/personal/auto-news";
import { DEITIES } from "@/services/personal/auto-devotional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const allLogs = getRecentLogs(150);
  const deityNames = DEITIES.map(d => d.tamilName);
  
  // Filter logs where the region matches one of the Tamil deity names
  const filteredLogs = allLogs.filter(log => log.region && deityNames.includes(log.region));
  
  return NextResponse.json(
    { logs: filteredLogs.reverse() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      }
    }
  );
}
