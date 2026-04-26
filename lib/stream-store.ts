import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";
import type { ActiveStream, StreamMode, StreamStatusResponse } from "./stream-types";

const AUTO_STOP_MINUTES = 60;
const OWNER_USER_ID = "local-user";
const STREAM_PK = "default";

type StreamState = {
  stream: ActiveStream;
};

const idleStream = (): ActiveStream => ({
  id: "local-stream",
  ownerUserId: OWNER_USER_ID,
  status: "idle",
  mode: "audio_video",
  autoStopMinutes: AUTO_STOP_MINUTES
});

declare global {
  // eslint-disable-next-line no-var
  var __remotieStreamState: StreamState | undefined;
}

function getMemoryState(): StreamState {
  if (!globalThis.__remotieStreamState) {
    globalThis.__remotieStreamState = { stream: idleStream() };
  }

  return globalThis.__remotieStreamState;
}

function applyAutoStop(stream: ActiveStream, now = new Date()): ActiveStream {
  if (stream.status !== "live" || !stream.startedAt) {
    return stream;
  }

  const started = new Date(stream.startedAt).getTime();
  const elapsedMs = now.getTime() - started;
  const maxMs = stream.autoStopMinutes * 60 * 1000;

  if (elapsedMs < maxMs) {
    return stream;
  }

  return {
    ...stream,
    status: "ended",
    endedAt: now.toISOString()
  };
}

function toResponse(stream: ActiveStream, now: Date): StreamStatusResponse {
  return {
    stream,
    isLive: stream.status === "live",
    now: now.toISOString()
  };
}

function getTableName() {
  return process.env.REMOTIE_STREAM_TABLE;
}

function getDynamoClient() {
  return new DynamoDBClient({});
}

function streamToItem(stream: ActiveStream): Record<string, AttributeValue> {
  return {
    pk: { S: STREAM_PK },
    id: { S: stream.id },
    ownerUserId: { S: stream.ownerUserId },
    status: { S: stream.status },
    mode: { S: stream.mode },
    autoStopMinutes: { N: String(stream.autoStopMinutes) },
    ...(stream.startedAt ? { startedAt: { S: stream.startedAt } } : {}),
    ...(stream.endedAt ? { endedAt: { S: stream.endedAt } } : {})
  };
}

function itemToStream(item?: Record<string, AttributeValue>): ActiveStream {
  if (!item) {
    return idleStream();
  }

  return {
    id: item.id?.S ?? "local-stream",
    ownerUserId: item.ownerUserId?.S ?? OWNER_USER_ID,
    status: (item.status?.S as ActiveStream["status"]) ?? "idle",
    mode: (item.mode?.S as ActiveStream["mode"]) ?? "audio_video",
    autoStopMinutes: Number(item.autoStopMinutes?.N ?? AUTO_STOP_MINUTES),
    startedAt: item.startedAt?.S,
    endedAt: item.endedAt?.S
  };
}

async function readDynamoStream() {
  const tableName = getTableName();
  if (!tableName) {
    return null;
  }

  const result = await getDynamoClient().send(
    new GetItemCommand({
      TableName: tableName,
      Key: { pk: { S: STREAM_PK } },
      ConsistentRead: true
    })
  );

  return itemToStream(result.Item);
}

async function writeDynamoStream(stream: ActiveStream) {
  const tableName = getTableName();
  if (!tableName) {
    return;
  }

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: tableName,
      Item: streamToItem(stream)
    })
  );
}

async function readStream() {
  const dynamoStream = await readDynamoStream();
  if (dynamoStream) {
    return dynamoStream;
  }

  return getMemoryState().stream;
}

async function writeStream(stream: ActiveStream) {
  if (getTableName()) {
    await writeDynamoStream(stream);
    return;
  }

  getMemoryState().stream = stream;
}

export async function startStream(mode: StreamMode = "audio_video"): Promise<StreamStatusResponse> {
  const now = new Date();
  const stream: ActiveStream = {
    id: crypto.randomUUID(),
    ownerUserId: OWNER_USER_ID,
    status: "live",
    startedAt: now.toISOString(),
    endedAt: undefined,
    mode,
    autoStopMinutes: AUTO_STOP_MINUTES
  };

  await writeStream(stream);
  return toResponse(stream, now);
}

export async function stopStream(): Promise<StreamStatusResponse> {
  const now = new Date();
  const current = applyAutoStop(await readStream(), now);
  const stream: ActiveStream = {
    ...current,
    status: "ended",
    endedAt: now.toISOString()
  };

  await writeStream(stream);
  return toResponse(stream, now);
}

export async function getStreamStatus(now = new Date()): Promise<StreamStatusResponse> {
  const current = await readStream();
  const stream = applyAutoStop(current, now);

  if (stream !== current) {
    await writeStream(stream);
  }

  return toResponse(stream, now);
}
