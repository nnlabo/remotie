"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoQuality
} from "livekit-client";
import type { StreamStatusResponse } from "@/lib/stream-types";

type LiveKitViewerState = "mock" | "connecting" | "connected" | "error";
type QualityMode = "high" | "medium" | "low";
type ZoomMode = 1 | 1.5 | 2;

type LiveKitTokenResponse =
  | { enabled: false }
  | { enabled: true; token: string; url: string; roomName: string };

const qualityMap: Record<QualityMode, VideoQuality> = {
  high: VideoQuality.HIGH,
  medium: VideoQuality.MEDIUM,
  low: VideoQuality.LOW
};

function formatTime(iso?: string) {
  if (!iso) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

export default function WatchPage() {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveKitState, setLiveKitState] = useState<LiveKitViewerState>("mock");
  const [connectionError, setConnectionError] = useState("");
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>("high");
  const [zoomMode, setZoomMode] = useState<ZoomMode>(1);
  const isLive = status?.isLive ?? false;
  const stateLabel = useMemo(() => {
    if (!status) return "確認中";
    if (liveKitState === "connected") return "Connected";
    return isLive ? "Live" : "Waiting";
  }, [isLive, liveKitState, status]);

  const applyVideoQuality = useCallback((room: Room, mode: QualityMode) => {
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.kind === Track.Kind.Video) {
          publication.setVideoQuality(qualityMap[mode]);
        }
      });
    });
  }, []);

  const clearMedia = useCallback(() => {
    if (!mediaRef.current) return;
    mediaRef.current.replaceChildren();
    setRemoteTrackCount(0);
  }, []);

  const attachTrack = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteVideoTrack || track instanceof RemoteAudioTrack)) return;

    const element = track.attach();
    element.autoplay = true;
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      element.controls = false;
    }
    element.className = track instanceof RemoteVideoTrack ? "h-full w-full object-cover" : "hidden";
    mediaRef.current?.appendChild(element);
    setRemoteTrackCount((count) => count + 1);
  }, []);

  const detachTrack = useCallback((track: RemoteTrack) => {
    if (!(track instanceof RemoteVideoTrack || track instanceof RemoteAudioTrack)) return;
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
    const room = new Room({ adaptiveStream: false });
    roomRef.current = room;

    room
      .on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (publication.kind === Track.Kind.Video) {
            publication.setVideoQuality(qualityMap[qualityMode]);
          }
          attachTrack(track);
        }
      )
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => detachTrack(track))
      .on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setLiveKitState("mock");
        clearMedia();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioNeedsGesture(!room.canPlaybackAudio);
      });

    try {
      await room.connect(tokenResponse.url, tokenResponse.token);
      setAudioNeedsGesture(!room.canPlaybackAudio);
      applyVideoQuality(room, qualityMode);
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track) attachTrack(publication.track);
        });
      });
      setLiveKitState("connected");
    } catch (err) {
      room.disconnect();
      roomRef.current = null;
      setLiveKitState("error");
      setConnectionError(err instanceof Error ? err.message : "接続できませんでした");
    }
  }, [applyVideoQuality, attachTrack, clearMedia, detachTrack, liveKitState, qualityMode]);

  const disconnectViewer = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    clearMedia();
    setLiveKitState("mock");
    setAudioNeedsGesture(false);
  }, [clearMedia]);

  const enableAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
      setAudioNeedsGesture(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "音声を有効化できませんでした");
    }
  }, []);

  const changeQuality = useCallback(
    (mode: QualityMode) => {
      setQualityMode(mode);
      const room = roomRef.current;
      if (room) applyVideoQuality(room, mode);
    },
    [applyVideoQuality]
  );

  const requestFullscreen = useCallback(async () => {
    const video = mediaRef.current?.querySelector("video") as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    const element = playerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (element?.requestFullscreen) {
      await element.requestFullscreen();
      return;
    }
    element?.webkitRequestFullscreen?.();
  }, []);

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
        if (isMounted) setLastUpdated(new Date());
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
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${isLive ? "bg-live text-white" : "bg-white/10 text-white/72"}`}>
            {isLive ? "LIVE" : "IDLE"}
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-8">
          <div className="rounded-[2rem] border border-white/10 bg-panel p-4 shadow-soft">
            <div ref={playerRef} className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black">
              <div
                ref={mediaRef}
                className="absolute inset-0 transition-transform duration-200"
                style={{ transform: `scale(${zoomMode})`, transformOrigin: "center" }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
                {isLive ? (
                  remoteTrackCount === 0 ? (
                    <div>
                      <div className="flex items-center gap-2 text-live">
                        <span className="h-3 w-3 rounded-full bg-live" />
                        <span className="text-sm font-bold">{liveKitState === "connecting" ? "Connecting" : "Live stream active"}</span>
                      </div>
                      <p className="mt-5 text-sm leading-6 text-white/62">映像トラックを待機中です。</p>
                    </div>
                  ) : audioNeedsGesture ? (
                    <button type="button" onClick={enableAudio} className="pointer-events-auto rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink shadow-soft">
                      音声を有効化
                    </button>
                  ) : null
                ) : (
                  <div className="flex h-full flex-col justify-center">
                    <p className="text-3xl font-semibold">Waiting for stream...</p>
                    <p className="mt-3 text-base leading-7 text-white/62">このページを開いたままにしてください。/go で START すると自動で切り替わります。</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              {(["high", "medium", "low"] as QualityMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeQuality(mode)}
                  className={`rounded-2xl px-3 py-3 font-semibold ${qualityMode === mode ? "bg-white text-ink" : "bg-white/[0.06] text-white/72"}`}
                >
                  {mode === "high" ? "High" : mode === "medium" ? "Mid" : "Low"}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
              {([1, 1.5, 2] as ZoomMode[]).map((zoom) => (
                <button
                  key={zoom}
                  type="button"
                  onClick={() => setZoomMode(zoom)}
                  className={`rounded-2xl px-3 py-3 font-semibold ${zoomMode === zoom ? "bg-ready text-ink" : "bg-white/[0.06] text-white/72"}`}
                >
                  {zoom}x
                </button>
              ))}
              <button type="button" onClick={requestFullscreen} className="rounded-2xl bg-white/[0.06] px-3 py-3 font-semibold text-white/82">
                Full
              </button>
            </div>

            {connectionError ? <div className="mt-4 rounded-2xl border border-live/40 bg-live/10 p-3 text-sm text-white">{connectionError}</div> : null}

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
