import { NextResponse } from "next/server";
import { stopStream } from "@/lib/stream-store";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await stopStream(), {
    headers: { "Cache-Control": "no-store" }
  });
}
