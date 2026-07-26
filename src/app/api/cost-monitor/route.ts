import { NextResponse } from "next/server";
import { getCostSummary } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCostSummary());
}
