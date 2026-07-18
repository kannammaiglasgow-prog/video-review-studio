import { NextResponse } from "next/server";
import { transitionPresets } from "../../../../../packages/transition-library/src";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      transitions: transitionPresets
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load transitions" }, { status: 500 });
  }
}
