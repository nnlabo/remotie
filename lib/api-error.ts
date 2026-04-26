import { NextResponse } from "next/server";

function sanitizeMessage(message: string) {
  return message.replace(/[^\x20-\x7E]/g, "").slice(0, 500);
}

export function jsonError(error: unknown, status = 500) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? sanitizeMessage(error.message) : "Unknown error";

  return NextResponse.json(
    {
      error: {
        name,
        message
      }
    },
    {
      status,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
