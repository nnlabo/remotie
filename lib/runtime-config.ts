export function getRuntimeConfig() {
  return {
    basicAuthConfigured: Boolean(
      process.env.REMOTIE_BASIC_USER && process.env.REMOTIE_BASIC_PASSWORD
    ),
    streamStoreBackend: process.env.REMOTIE_STREAM_TABLE ? "dynamodb" : "memory",
    streamTableConfigured: Boolean(process.env.REMOTIE_STREAM_TABLE),
    awsRegionConfigured: Boolean(
      process.env.REMOTIE_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
    ),
    liveKitConfigured: Boolean(
      process.env.NEXT_PUBLIC_LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
    ),
    liveKitUrlConfigured: Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL)
  };
}
