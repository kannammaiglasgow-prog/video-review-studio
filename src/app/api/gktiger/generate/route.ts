/** Legacy GK Tiger endpoint. Quizzes now run on every channel through
 * /api/quiz/[channel]/generate; this stays so anything still pointing here
 * keeps working, and simply forwards to the GK Tiger channel. */

import { GET as quizGet, POST as quizPost } from "../../quiz/[channel]/generate/route";

export const runtime = "nodejs";
export const maxDuration = 900;
export const dynamic = "force-dynamic";

const gktiger = { params: Promise.resolve({ channel: "gktiger" }) };

export function GET(request: Request) {
  return quizGet(request, gktiger);
}

export function POST(request: Request) {
  return quizPost(request, gktiger);
}
