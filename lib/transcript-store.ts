import {
  BedrockRuntimeClient,
  ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";
import type { TranscriptEntry, TranscriptState, TranscriptStatusResponse } from "./transcript-types";

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
    region: getAwsRegion()
  });
}

function getAwsRegion() {
  return process.env.REMOTIE_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
}

function getSummaryModelId() {
  return process.env.REMOTIE_SUMMARY_MODEL_ID;
}

function isSummaryProviderConfigured() {
  return Boolean(getSummaryModelId());
}

function isTranscribeProviderConfigured() {
  return Boolean(process.env.REMOTIE_TRANSCRIBE_LANGUAGE_CODE || process.env.REMOTIE_TRANSCRIBE_REGION);
}

function getBedrockClient() {
  return new BedrockRuntimeClient({
    region: getAwsRegion()
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
    summaryProviderConfigured: isSummaryProviderConfigured(),
    transcribeProviderConfigured: isTranscribeProviderConfigured(),
    now: now.toISOString()
  };
}

async function summarizeWithBedrock(text: string) {
  const modelId = getSummaryModelId();
  if (!modelId) return null;

  const prompt = [
    "あなたは会議や現場確認の音声文字起こしを短く要約するアシスタントです。",
    "重要な状況、決定事項、次に確認すべきことを日本語で簡潔にまとめてください。",
    "",
    "文字起こし:",
    text
  ].join("\n");

  const result = await getBedrockClient().send(
    new ConverseCommand({
      modelId,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: 700,
        temperature: 0.2
      }
    })
  );
  return result.output?.message?.content
    ?.map((item) => item.text)
    .filter(Boolean)
    .join("\n")
    .trim() || null;
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
  const transcriptText = current.entries.map((entry) => entry.text).join("\n").trim();
  const bedrockSummary = transcriptText ? await summarizeWithBedrock(transcriptText) : null;
  const summary = bedrockSummary ?? "まだ文字起こしはありません。AWS Transcribe 接続後、必要なときだけ要約を生成します。";
  const transcript: TranscriptState = {
    ...current,
    status: "summarized",
    summary,
    updatedAt: now.toISOString()
  };

  await writeTranscript(transcript);
  return toResponse(transcript, now);
}

export async function appendTranscriptEntry(text: string): Promise<TranscriptStatusResponse> {
  const trimmed = text.trim();
  if (!trimmed) {
    return getTranscriptStatus();
  }

  const now = new Date();
  const current = await readTranscript();
  const entry: TranscriptEntry = {
    id: crypto.randomUUID(),
    text: trimmed,
    createdAt: now.toISOString()
  };
  const transcript: TranscriptState = {
    ...current,
    status: current.status === "idle" ? "listening" : current.status,
    updatedAt: now.toISOString(),
    entries: [...current.entries, entry],
    summary: undefined
  };

  await writeTranscript(transcript);
  return toResponse(transcript, now);
}
