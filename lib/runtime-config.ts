export function getRuntimeConfig() {
  return {
    basicAuthConfigured: Boolean(
      process.env.REMOTIE_BASIC_USER && process.env.REMOTIE_BASIC_PASSWORD
    ),
    streamStoreBackend: process.env.REMOTIE_STREAM_TABLE ? "dynamodb" : "memory",
    streamTableConfigured: Boolean(process.env.REMOTIE_STREAM_TABLE),
    liveKitConfigured: Boolean(
      process.env.NEXT_PUBLIC_LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
    )
  };
}
