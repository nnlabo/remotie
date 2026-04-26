import { NextResponse } from "next/server";
import { startStream } from "@/lib/stream-store";
import type { StreamMode } from "@/lib/stream-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { mode?: StreamMode };
  const mode = body.mode === "audio_only" ? "audio_only" : "audio_video";

  return NextResponse.json(startStream(mode), {
    headers: { "Cache-Control": "no-store" }
  });
}
