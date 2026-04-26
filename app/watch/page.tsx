"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent
} from "livekit-client";
import type { StreamStatusResponse } from "@/lib/stream-types";

type LiveKitViewerState = "mock" | "connecting" | "connected" | "error";

type LiveKitTokenResponse =
  | { enabled: false }
  | { enabled: true; token: string; url: string; roomName: string };

function formatTime(iso?: string) {
  if (!iso) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

export default function WatchPage() {
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveKitState, setLiveKitState] = useState<LiveKitViewerState>("mock");
  const [connectionError, setConnectionError] = useState("");
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const isLive = status?.isLive ?? false;
  const stateLabel = useMemo(() => {
    if (!status) return "確認中";
    if (liveKitState === "connected") return "Connected";
    return isLive ? "Live" : "Waiting";
  }, [isLive, liveKitState, status]);

  const clearMedia = useCallback(() => {
    if (!mediaRef.current) return;
    mediaRef.current.replaceChildren();
    setRemoteTrackCount(0);
  }, []);

  const attachTrack = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteVideoTrack || track instanceof RemoteAudioTrack)) {
      return;
    }

    const element = track.attach();
    element.autoplay = true;
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }
    element.className =
      track instanceof RemoteVideoTrack
        ? "h-full w-full rounded-3xl object-cover"
        : "hidden";
    mediaRef.current?.appendChild(element);
    setRemoteTrackCount((count) => count + 1);
  }, []);

  const detachTrack = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteVideoTrack || track instanceof RemoteAudioTrack)) {
      return;
    }
    track.detach().forEach((element) => element.remove());
    setRemoteTrackCount((count) => Math.max(0, count - 1));
  }, []);

  const connectViewer = useCallback(async () => {
    if (roomRef.current || liveKitState === "connecting") return;

    const tokenResponse = (await fetch("/api/token/viewer", { cache: "no-store" }).then((response) =>
      response.json()
    )) as LiveKitTokenResponse;

    if (!tokenResponse.enabled) {
      setLiveKitState("mock");
      return;
    }

    setConnectionError("");
    setLiveKitState("connecting");
    const room = new Room({
      adaptiveStream: true
    });
    roomRef.current = room;

    room
      .on(
        RoomEvent.TrackSubscribed,
        (
          track: RemoteTrack,
          _publication: RemoteTrackPublication,
          _participant: RemoteParticipant
        ) => attachTrack(track)
      )
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => detachTrack(track))
      .on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setLiveKitState("mock");
        clearMedia();
      });

    try {
      await room.connect(tokenResponse.url, tokenResponse.token);
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track) {
            attachTrack(publication.track);
          }
        });
      });
      setLiveKitState("connected");
    } catch (err) {
      room.disconnect();
      roomRef.current = null;
      setLiveKitState("error");
      setConnectionError(err instanceof Error ? err.message : "接続できませんでした");
    }
  }, [attachTrack, clearMedia, detachTrack, liveKitState]);

  const disconnectViewer = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    clearMedia();
    setLiveKitState("mock");
  }, [clearMedia]);

  useEffect(() => {
    let isMounted = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/stream/status", { cache: "no-store" });
        const data = (await response.json()) as StreamStatusResponse;
        if (isMounted) {
          setStatus(data);
          setLastUpdated(new Date());
        }
      } catch {
        if (isMounted) {
          setLastUpdated(new Date());
        }
      }
    };

    poll().catch(() => undefined);
    const interval = window.setInterval(poll, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      disconnectViewer();
    };
  }, [disconnectViewer]);

  useEffect(() => {
    if (isLive) {
      connectViewer().catch((err) => {
        setLiveKitState("error");
        setConnectionError(err instanceof Error ? err.message : "接続できませんでした");
      });
      return;
    }

    disconnectViewer();
  }, [connectViewer, disconnectViewer, isLive]);

  return (
    <main className="min-h-dvh bg-ink px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white">
      <section className="mx-auto flex min-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] max-w-lg flex-col">
        <header className="flex items-center justify-between pt-3">
          <div>
            <p className="text-sm font-medium text-ready">Remotie</p>
            <h1 className="text-2xl font-semibold">Watch</h1>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              isLive ? "bg-live text-white" : "bg-white/10 text-white/72"
            }`}
          >
            {isLive ? "LIVE" : "IDLE"}
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-8">
          <div className="rounded-[2rem] border border-white/10 bg-panel p-5 shadow-soft">
            <div
              ref={mediaRef}
              className="flex aspect-video items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black p-5"
            >
              {isLive ? (
                remoteTrackCount === 0 ? (
                  <div>
                    <div className="flex items-center gap-2 text-live">
                      <span className="h-3 w-3 rounded-full bg-live" />
                      <span className="text-sm font-bold">
                        {liveKitState === "connecting" ? "Connecting" : "Live stream active"}
                      </span>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-white/62">
                      LiveKit が未設定、または映像トラックを待機中です。
                    </p>
                  </div>
                ) : null
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-3xl font-semibold">Waiting for stream...</p>
                  <p className="mt-3 text-base leading-7 text-white/62">
                    このページを開いたままにしてください。/go で START すると自動で切り替わります。
                  </p>
                </div>
              )}
            </div>

            {connectionError ? (
              <div className="mt-4 rounded-2xl border border-live/40 bg-live/10 p-3 text-sm text-white">
                {connectionError}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <p className="text-white/58">State</p>
                <p className="mt-1 text-lg font-semibold">{stateLabel}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <p className="text-white/58">Started</p>
                <p className="mt-1 text-lg font-semibold">{formatTime(status?.stream.startedAt)}</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="pb-2 text-center text-xs text-white/44">
          {lastUpdated ? `Last check ${formatTime(lastUpdated.toISOString())}` : "Checking status"}
        </footer>
      </section>
    </main>
  );
}
