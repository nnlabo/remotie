import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { appendTranscriptEntry } from "@/lib/transcript-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    return NextResponse.json(await appendTranscriptEntry(body.text ?? ""), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
