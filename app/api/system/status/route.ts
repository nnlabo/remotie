import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ...getRuntimeConfig(),
      now: new Date().toISOString()
    },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}
