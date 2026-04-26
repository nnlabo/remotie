import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { stopStream } from "@/lib/stream-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await stopStream(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
