import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { startStream } from "@/lib/stream-store";
import type { StreamMode } from "@/lib/stream-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: StreamMode };
    const mode = body.mode === "audio_only" ? "audio_only" : "audio_video";

    return NextResponse.json(await startStream(mode), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
