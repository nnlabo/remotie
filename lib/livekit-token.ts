import { AccessToken } from "livekit-server-sdk";

export type LiveKitRole = "sender" | "viewer";

const ROOM_NAME = "remotie-main";

export function isLiveKitConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
  );
}

export async function createLiveKitToken(role: LiveKitRole) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return {
      enabled: false as const
    };
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: `${role}-${crypto.randomUUID()}`,
    name: role === "sender" ? "Remotie Sender" : "Remotie Viewer",
    ttl: "65m"
  });

  token.addGrant({
    room: ROOM_NAME,
    roomJoin: true,
    roomCreate: role === "sender",
    canPublish: role === "sender",
    canSubscribe: true,
    canPublishData: false
  });

  return {
    enabled: true as const,
    token: await token.toJwt(),
    url,
    roomName: ROOM_NAME
  };
}
