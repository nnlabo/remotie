import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";
import type { TranscriptState, TranscriptStatusResponse } from "./transcript-types";

const TRANSCRIPT_PK = "transcript";

declare global {
  // eslint-disable-next-line no-var
  var __remotieTranscriptState: TranscriptState | undefined;
}

function emptyTranscript(now = new Date()): TranscriptState {
  return {
    status: "idle",
    provider: "placeholder",
    updatedAt: now.toISOString(),
    entries: []
  };
}

function getMemoryState() {
  if (!globalThis.__remotieTranscriptState) {
    globalThis.__remotieTranscriptState = emptyTranscript();
  }

  return globalThis.__remotieTranscriptState;
}

function getTableName() {
  return process.env.REMOTIE_STREAM_TABLE;
}

function getDynamoClient() {
  return new DynamoDBClient({
    region: process.env.REMOTIE_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  });
}

function transcriptToItem(transcript: TranscriptState): Record<string, AttributeValue> {
  return {
    pk: { S: TRANSCRIPT_PK },
    status: { S: transcript.status },
    provider: { S: transcript.provider },
    updatedAt: { S: transcript.updatedAt },
    entriesJson: { S: JSON.stringify(transcript.entries) },
    ...(transcript.startedAt ? { startedAt: { S: transcript.startedAt } } : {}),
    ...(transcript.stoppedAt ? { stoppedAt: { S: transcript.stoppedAt } } : {}),
    ...(transcript.summary ? { summary: { S: transcript.summary } } : {})
  };
}

function itemToTranscript(item?: Record<string, AttributeValue>): TranscriptState {
  if (!item) return emptyTranscript();

  let entries: TranscriptState["entries"] = [];
  try {
    entries = JSON.parse(item.entriesJson?.S ?? "[]") as TranscriptState["entries"];
  } catch {
    entries = [];
  }

  return {
    status: (item.status?.S as TranscriptState["status"]) ?? "idle",
    provider: (item.provider?.S as TranscriptState["provider"]) ?? "placeholder",
    startedAt: item.startedAt?.S,
    stoppedAt: item.stoppedAt?.S,
    updatedAt: item.updatedAt?.S ?? new Date().toISOString(),
    entries,
    summary: item.summary?.S
  };
}

async function readDynamoTranscript() {
  const tableName = getTableName();
  if (!tableName) return null;

  const result = await getDynamoClient().send(
    new GetItemCommand({
      TableName: tableName,
      Key: { pk: { S: TRANSCRIPT_PK } },
      ConsistentRead: true
    })
  );

  return itemToTranscript(result.Item);
}

async function writeDynamoTranscript(transcript: TranscriptState) {
  const tableName = getTableName();
  if (!tableName) return;

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: tableName,
      Item: transcriptToItem(transcript)
    })
  );
}

async function readTranscript() {
  const dynamoTranscript = await readDynamoTranscript();
  if (dynamoTranscript) return dynamoTranscript;
  return getMemoryState();
}

async function writeTranscript(transcript: TranscriptState) {
  if (getTableName()) {
    await writeDynamoTranscript(transcript);
    return;
  }

  globalThis.__remotieTranscriptState = transcript;
}

function toResponse(transcript: TranscriptState, now: Date): TranscriptStatusResponse {
  return {
    transcript,
    now: now.toISOString()
  };
}

export async function getTranscriptStatus(now = new Date()): Promise<TranscriptStatusResponse> {
  return toResponse(await readTranscript(), now);
}

export async function startTranscript(): Promise<TranscriptStatusResponse> {
  const now = new Date();
  const transcript: TranscriptState = {
    status: "listening",
    provider: "placeholder",
    startedAt: now.toISOString(),
    stoppedAt: undefined,
    updatedAt: now.toISOString(),
    entries: [],
    summary: undefined
  };

  await writeTranscript(transcript);
  return toResponse(transcript, now);
}

export async function stopTranscript(): Promise<TranscriptStatusResponse> {
  const now = new Date();
  const current = await readTranscript();
  const transcript: TranscriptState = {
    ...current,
    status: "idle",
    stoppedAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  await writeTranscript(transcript);
  return toResponse(transcript, now);
}

export async function summarizeTranscript(): Promise<TranscriptStatusResponse> {
  const now = new Date();
  const current = await readTranscript();
  const summary =
    current.entries.length > 0
      ? current.entries.map((entry) => entry.text).join("\n")
      : "まだ文字起こしはありません。AWS Transcribe 接続後、必要なときだけ要約を生成します。";
  const transcript: TranscriptState = {
    ...current,
    status: "summarized",
    summary,
    updatedAt: now.toISOString()
  };

  await writeTranscript(transcript);
  return toResponse(transcript, now);
}
