export type TranscriptStatus = "idle" | "listening" | "summarized";

export type TranscriptProvider = "placeholder" | "aws_transcribe";

export type TranscriptEntry = {
  id: string;
  text: string;
  createdAt: string;
};

export type TranscriptState = {
  status: TranscriptStatus;
  provider: TranscriptProvider;
  startedAt?: string;
  stoppedAt?: string;
  updatedAt: string;
  entries: TranscriptEntry[];
  summary?: string;
};

export type TranscriptStatusResponse = {
  transcript: TranscriptState;
  summaryProviderConfigured: boolean;
  transcribeProviderConfigured: boolean;
  now: string;
};
