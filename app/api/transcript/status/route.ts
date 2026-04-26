import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { getTranscriptStatus } from "@/lib/transcript-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTranscriptStatus(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
