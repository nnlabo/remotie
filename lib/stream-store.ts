import type { ActiveStream, StreamMode, StreamStatusResponse } from "./stream-types";

const AUTO_STOP_MINUTES = 60;
const OWNER_USER_ID = "local-user";

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

function getState(): StreamState {
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

export function startStream(mode: StreamMode = "audio_video"): StreamStatusResponse {
  const now = new Date();
  const state = getState();
  state.stream = {
    id: crypto.randomUUID(),
    ownerUserId: OWNER_USER_ID,
    status: "live",
    startedAt: now.toISOString(),
    endedAt: undefined,
    mode,
    autoStopMinutes: AUTO_STOP_MINUTES
  };

  return getStreamStatus(now);
}

export function stopStream(): StreamStatusResponse {
  const now = new Date();
  const state = getState();
  state.stream = {
    ...applyAutoStop(state.stream, now),
    status: "ended",
    endedAt: now.toISOString()
  };

  return getStreamStatus(now);
}

export function getStreamStatus(now = new Date()): StreamStatusResponse {
  const state = getState();
  state.stream = applyAutoStop(state.stream, now);

  return {
    stream: state.stream,
    isLive: state.stream.status === "live",
    now: now.toISOString()
  };
}
