import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { stopTranscript } from "@/lib/transcript-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await stopTranscript(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
