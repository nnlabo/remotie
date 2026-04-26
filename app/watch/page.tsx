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
type PanZoom = { scale: number; x: number; y: number };
type PointerPoint = { x: number; y: number };

type LiveKitTokenResponse =
  | { enabled: false }
  | { enabled: true; token: string; url: string; roomName: string };

const MIN_SCALE = 1;
const MAX_SCALE = 4;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: PointerPoint, b: PointerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function getPointerPoint(event: React.PointerEvent<HTMLDivElement>): PointerPoint {
  return { x: event.clientX, y: event.clientY };
}

export default function WatchPage() {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const gestureRef = useRef<{
    startZoom: PanZoom;
    startDistance: number;
    startMidpoint: PointerPoint;
  } | null>(null);

  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveKitState, setLiveKitState] = useState<LiveKitViewerState>("mock");
  const [connectionError, setConnectionError] = useState("");
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [resumeNeeded, setResumeNeeded] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>("high");
  const [panZoom, setPanZoom] = useState<PanZoom>({ scale: 1, x: 0, y: 0 });

  const isLive = status?.isLive ?? false;
  const stateLabel = useMemo(() => {
    if (!status) return "確認中";
    if (liveKitState === "connected") return "Connected";
    if (liveKitState === "connecting") return "Connecting";
    return isLive ? "Live" : "Waiting";
  }, [isLive, liveKitState, status]);

  const constrainPanZoom = useCallback((next: PanZoom): PanZoom => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const player = playerRef.current;
    if (!player || scale <= MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };

    const maxX = (player.clientWidth * (scale - 1)) / 2;
    const maxY = (player.clientHeight * (scale - 1)) / 2;
    return {
      scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY)
    };
  }, []);

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

  const resumePlayback = useCallback(async () => {
    const elements = Array.from(mediaRef.current?.querySelectorAll<HTMLMediaElement>("video,audio") ?? []);
    try {
      await roomRef.current?.startAudio();
      await Promise.all(elements.map((element) => element.play().catch(() => undefined)));
      setAudioNeedsGesture(false);
      setResumeNeeded(false);
      setConnectionError("");
    } catch (err) {
      setResumeNeeded(true);
      setConnectionError(err instanceof Error ? err.message : "再生を再開できませんでした");
    }
  }, []);

  const attachTrack = useCallback(
    (track: RemoteTrack) => {
      if (!(track instanceof RemoteVideoTrack || track instanceof RemoteAudioTrack)) return;

      const element = track.attach();
      element.autoplay = true;
      element.addEventListener("pause", () => setResumeNeeded(true));
      if (element instanceof HTMLVideoElement) {
        element.playsInline = true;
        element.controls = false;
      }
      element.className = track instanceof RemoteVideoTrack ? "h-full w-full object-cover" : "hidden";
      mediaRef.current?.appendChild(element);
      setRemoteTrackCount((count) => count + 1);
      resumePlayback().catch(() => undefined);
    },
    [resumePlayback]
  );

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
          if (publication.kind === Track.Kind.Video) publication.setVideoQuality(qualityMap[qualityMode]);
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
    setResumeNeeded(false);
    setPanZoom({ scale: 1, x: 0, y: 0 });
  }, [clearMedia]);

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
      window.setTimeout(() => resumePlayback().catch(() => undefined), 400);
      return;
    }

    const element = playerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (element?.requestFullscreen) {
      await element.requestFullscreen();
    } else {
      await element?.webkitRequestFullscreen?.();
    }
    window.setTimeout(() => resumePlayback().catch(() => undefined), 400);
  }, [resumePlayback]);

  const resetView = useCallback(() => {
    setPanZoom({ scale: 1, x: 0, y: 0 });
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, getPointerPoint(event));

      const points = Array.from(pointersRef.current.values());
      if (points.length >= 2) {
        gestureRef.current = {
          startZoom: panZoom,
          startDistance: distance(points[0], points[1]),
          startMidpoint: midpoint(points[0], points[1])
        };
      } else {
        gestureRef.current = {
          startZoom: panZoom,
          startDistance: 0,
          startMidpoint: points[0]
        };
      }
    },
    [panZoom]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return;
      pointersRef.current.set(event.pointerId, getPointerPoint(event));
      const points = Array.from(pointersRef.current.values());

      if (points.length >= 2) {
        const currentMidpoint = midpoint(points[0], points[1]);
        const currentDistance = distance(points[0], points[1]);
        const scale = gestureRef.current.startDistance
          ? gestureRef.current.startZoom.scale * (currentDistance / gestureRef.current.startDistance)
          : gestureRef.current.startZoom.scale;

        setPanZoom(
          constrainPanZoom({
            scale,
            x: gestureRef.current.startZoom.x + currentMidpoint.x - gestureRef.current.startMidpoint.x,
            y: gestureRef.current.startZoom.y + currentMidpoint.y - gestureRef.current.startMidpoint.y
          })
        );
        return;
      }

      if (points.length === 1 && gestureRef.current.startZoom.scale > MIN_SCALE) {
        setPanZoom(
          constrainPanZoom({
            scale: gestureRef.current.startZoom.scale,
            x: gestureRef.current.startZoom.x + points[0].x - gestureRef.current.startMidpoint.x,
            y: gestureRef.current.startZoom.y + points[0].y - gestureRef.current.startMidpoint.y
          })
        );
      }
    },
    [constrainPanZoom]
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      const points = Array.from(pointersRef.current.values());
      if (points.length === 1) {
        gestureRef.current = {
          startZoom: panZoom,
          startDistance: 0,
          startMidpoint: points[0]
        };
        return;
      }
      gestureRef.current = null;
    },
    [panZoom]
  );

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

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      resumePlayback().catch(() => undefined);
    };
    document.addEventListener("fullscreenchange", resume);
    document.addEventListener("webkitfullscreenchange", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("fullscreenchange", resume);
      document.removeEventListener("webkitfullscreenchange", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [resumePlayback]);

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
          <div className="rounded-[2rem] border border-white/10 bg-panel p-4 shadow-soft">
            <div
              ref={playerRef}
              className="relative aspect-video touch-none overflow-hidden rounded-3xl border border-white/10 bg-black"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onDoubleClick={resetView}
            >
              <div
                ref={mediaRef}
                className="absolute inset-0"
                style={{
                  transform: `translate3d(${panZoom.x}px, ${panZoom.y}px, 0) scale(${panZoom.scale})`,
                  transformOrigin: "center",
                  transition: pointersRef.current.size ? "none" : "transform 160ms ease"
                }}
              />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
                {isLive ? (
                  remoteTrackCount === 0 ? (
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-live">
                        <span className="h-3 w-3 rounded-full bg-live" />
                        <span className="text-sm font-bold">
                          {liveKitState === "connecting" ? "Connecting" : "Live stream active"}
                        </span>
                      </div>
                      <p className="mt-5 text-sm leading-6 text-white/62">映像トラックを待機中です。</p>
                    </div>
                  ) : audioNeedsGesture || resumeNeeded ? (
                    <button
                      type="button"
                      onClick={resumePlayback}
                      className="pointer-events-auto rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink shadow-soft"
                    >
                      再生を再開
                    </button>
                  ) : null
                ) : (
                  <div className="flex h-full flex-col justify-center text-center">
                    <p className="text-3xl font-semibold">Waiting for stream...</p>
                    <p className="mt-3 text-base leading-7 text-white/62">
                      このページを開いたままにしてください。/go で START すると自動で切り替わります。
                    </p>
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
                  className={`rounded-2xl px-3 py-3 font-semibold ${
                    qualityMode === mode ? "bg-white text-ink" : "bg-white/[0.06] text-white/72"
                  }`}
                >
                  {mode === "high" ? "High" : mode === "medium" ? "Mid" : "Low"}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <button type="button" onClick={resetView} className="rounded-2xl bg-white/[0.06] px-3 py-3 font-semibold text-white/82">
                Reset
              </button>
              <button type="button" onClick={resumePlayback} className="rounded-2xl bg-white/[0.06] px-3 py-3 font-semibold text-white/82">
                Play
              </button>
              <button type="button" onClick={requestFullscreen} className="rounded-2xl bg-white/[0.06] px-3 py-3 font-semibold text-white/82">
                Full
              </button>
            </div>

            {connectionError ? (
              <div className="mt-4 rounded-2xl border border-live/40 bg-live/10 p-3 text-sm text-white">{connectionError}</div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <p className="text-white/58">State</p>
                <p className="mt-1 text-lg font-semibold">{stateLabel}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <p className="text-white/58">Zoom</p>
                <p className="mt-1 text-lg font-semibold">{panZoom.scale.toFixed(1)}x</p>
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
