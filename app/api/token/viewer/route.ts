import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { createLiveKitToken } from "@/lib/livekit-token";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await createLiveKitToken("viewer"), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
