import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { getStreamStatus } from "@/lib/stream-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStreamStatus(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
