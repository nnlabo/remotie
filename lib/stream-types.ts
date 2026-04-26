export type StreamStatus =
  | "idle"
  | "starting"
  | "live"
  | "stopping"
  | "ended"
  | "error";

export type StreamMode = "audio_video" | "audio_only";

export type ActiveStream = {
  id: string;
  ownerUserId: string;
  status: StreamStatus;
  startedAt?: string;
  endedAt?: string;
  mode: StreamMode;
  autoStopMinutes: number;
};

export type StreamStatusResponse = {
  stream: ActiveStream;
  isLive: boolean;
  now: string;
};
