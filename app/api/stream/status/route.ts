import { NextResponse } from "next/server";
import { getStreamStatus } from "@/lib/stream-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStreamStatus(), {
    headers: { "Cache-Control": "no-store" }
  });
}
