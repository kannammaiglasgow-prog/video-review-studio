import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ status: "ok", outputLanguage: "ta", integrations: integrationStatus() });
}
