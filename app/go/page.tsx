"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioPresets, Room, Track, VideoPresets } from "livekit-client";
import type { StreamStatusResponse } from "@/lib/stream-types";

type PermissionState = "checking" | "ready" | "required" | "error";
type FacingMode = "environment" | "user";
type LiveKitConnectionState = "mock" | "connecting" | "connected" | "error";

type LiveKitTokenResponse =
  | { enabled: false }
  | { enabled: true; token: string; url: string; roomName: string };

const audioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

function buildMediaConstraints(facingMode: FacingMode, videoEnabled: boolean): MediaStreamConstraints {
  return {
    audio: audioConstraints,
    video: videoEnabled
      ? {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      : false
  };
}

function formatElapsed(startedAt: string | undefined, nowMs: number) {
  if (!startedAt) return "00:00:00";
  const seconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function remainingMinutes(startedAt: string | undefined, autoStopMinutes: number, nowMs: number) {
  if (!startedAt) return autoStopMinutes;
  const elapsedMinutes = (nowMs - new Date(startedAt).getTime()) / 60000;
  return Math.max(0, Math.ceil(autoStopMinutes - elapsedMinutes));
}

function formatClock(nowMs: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(nowMs));
}

function formatDate(nowMs: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date(nowMs));
}

export default function GoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const [permissionState, setPermissionState] = useState<PermissionState>("checking");
  const [error, setError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [liveKitState, setLiveKitState] = useState<LiveKitConnectionState>("mock");
  const [screenHidden, setScreenHidden] = useState(false);

  const isLive = status?.isLive ?? false;
  const elapsed = formatElapsed(status?.stream.startedAt, nowMs);
  const autoStopRemaining = remainingMinutes(status?.stream.startedAt, status?.stream.autoStopMinutes ?? 60, nowMs);
  const permissionLabel = useMemo(() => {
    if (permissionState === "ready") return "Camera and mic ready";
    if (permissionState === "checking") return "Checking permission";
    if (permissionState === "required") return "Preview is stopped";
    return "Permission error";
  }, [permissionState]);

  const stopMeter = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setMicLevel(0);
  }, []);

  const stopMediaTracks = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopMeter]);

  const stopLiveKitPublishing = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setLiveKitState("mock");
  }, []);

  const applyTrackState = useCallback(
    (stream: MediaStream, nextMicEnabled = micEnabled, nextCameraEnabled = cameraEnabled) => {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = nextMicEnabled;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = nextCameraEnabled;
      });
    },
    [cameraEnabled, micEnabled]
  );

  const startMeter = useCallback(
    (stream: MediaStream, nextMicEnabled = micEnabled) => {
      stopMeter();
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || !nextMicEnabled) {
        setMicLevel(0);
        return;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = audioContext;

      const update = () => {
        if (!audioTrack.enabled) {
          setMicLevel(0);
        } else {
          analyser.getByteFrequencyData(data);
          const average = data.reduce((sum, value) => sum + value, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((average / 128) * 100)));
        }
        animationRef.current = requestAnimationFrame(update);
      };

      update();
    },
    [micEnabled, stopMeter]
  );

  const requestMedia = useCallback(
    async (nextFacingMode = facingMode, nextCameraEnabled = cameraEnabled) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState("error");
        setError("This browser cannot access the camera or microphone. Please use Safari on a recent iOS version.");
        return null;
      }

      setPermissionState("checking");
      setError("");
      stopMediaTracks();

      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildMediaConstraints(nextFacingMode, nextCameraEnabled));
        streamRef.current = stream;
        applyTrackState(stream, micEnabled, nextCameraEnabled);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        startMeter(stream, micEnabled);
        setPermissionState("ready");
        return stream;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setPermissionState("error");
        setError(`Camera or microphone permission failed: ${message}`);
        return null;
      }
    },
    [applyTrackState, cameraEnabled, facingMode, micEnabled, startMeter, stopMediaTracks]
  );

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/stream/status", { cache: "no-store" });
    setStatus((await response.json()) as StreamStatusResponse);
  }, []);

  const startStream = useCallback(async () => {
    setIsBusy(true);
    try {
      const stream = streamRef.current ?? (await requestMedia());
      if (!stream) return;

      const tokenResponse = (await fetch("/api/token/sender", { cache: "no-store" }).then((response) =>
        response.json()
      )) as LiveKitTokenResponse;

      if (tokenResponse.enabled) {
        setLiveKitState("connecting");
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        await room.connect(tokenResponse.url, tokenResponse.token);

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        if (audioTrack && micEnabled) {
          await room.localParticipant.publishTrack(audioTrack, {
            source: Track.Source.Microphone,
            name: "remotie-microphone",
            audioPreset: AudioPresets.speech,
            dtx: true,
            red: true
          });
        }
        if (videoTrack && cameraEnabled) {
          await room.localParticipant.publishTrack(videoTrack, {
            source: Track.Source.Camera,
            name: "remotie-camera",
            videoEncoding: VideoPresets.h1080.encoding,
            videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h180],
            simulcast: true
          });
        }
        setLiveKitState("connected");
      } else {
        setLiveKitState("mock");
      }

      const response = await fetch("/api/stream/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: cameraEnabled ? "audio_video" : "audio_only" })
      });
      setStatus((await response.json()) as StreamStatusResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setLiveKitState("error");
      setError(`Could not start streaming: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }, [cameraEnabled, micEnabled, requestMedia]);

  const stopStream = useCallback(async () => {
    setIsBusy(true);
    try {
      const response = await fetch("/api/stream/stop", { method: "POST" });
      setStatus((await response.json()) as StreamStatusResponse);
      stopLiveKitPublishing();
      stopMediaTracks();
      setPermissionState("required");
      setScreenHidden(false);
    } finally {
      setIsBusy(false);
    }
  }, [stopLiveKitPublishing, stopMediaTracks]);

  const switchCamera = useCallback(async () => {
    const nextFacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacingMode);
    if (cameraEnabled) await requestMedia(nextFacingMode, true);
  }, [cameraEnabled, facingMode, requestMedia]);

  const toggleMic = useCallback(() => {
    const nextMicEnabled = !micEnabled;
    setMicEnabled(nextMicEnabled);
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextMicEnabled;
    });
    roomRef.current?.localParticipant.setMicrophoneEnabled(nextMicEnabled).catch(() => undefined);
    if (nextMicEnabled) startMeter(stream, true);
    else stopMeter();
  }, [micEnabled, startMeter, stopMeter]);

  const toggleCamera = useCallback(async () => {
    const nextCameraEnabled = !cameraEnabled;
    setCameraEnabled(nextCameraEnabled);
    roomRef.current?.localParticipant.setCameraEnabled(nextCameraEnabled).catch(() => undefined);
    if (nextCameraEnabled) {
      await requestMedia(facingMode, true);
      return;
    }
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = false;
      track.stop();
    });
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [cameraEnabled, facingMode, requestMedia]);

  useEffect(() => {
    refreshStatus().catch(() => undefined);
    requestMedia().catch(() => undefined);
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearInterval(interval);
      stopMediaTracks();
      stopLiveKitPublishing();
    };
  }, [refreshStatus, requestMedia, stopLiveKitPublishing, stopMediaTracks]);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream) applyTrackState(stream);
  }, [applyTrackState, micEnabled, cameraEnabled]);

  useEffect(() => {
    if (!isLive || autoStopRemaining > 0) return;
    stopStream().catch(() => undefined);
  }, [autoStopRemaining, isLive, stopStream]);

  return (
    <main className="min-h-dvh bg-ink px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white">
      {screenHidden ? (
        <button
          type="button"
          aria-label="Show preview"
          onClick={() => setScreenHidden(false)}
          className="fixed inset-0 z-50 flex min-h-dvh w-full flex-col items-center justify-center bg-black px-6 text-white"
        >
          <div className="absolute left-5 top-[calc(1.25rem+env(safe-area-inset-top))] flex items-center gap-2 text-sm font-semibold text-live">
            <span className="h-2.5 w-2.5 rounded-full bg-live" />
            LIVE {elapsed}
          </div>
          <div className="text-center">
            <p className="text-7xl font-semibold tracking-normal">{formatClock(nowMs)}</p>
            <p className="mt-4 text-base text-white/58">{formatDate(nowMs)}</p>
          </div>
          <p className="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] text-sm text-white/40">
            Tap anywhere to show controls
          </p>
        </button>
      ) : null}

      <section className="mx-auto flex min-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] max-w-md flex-col gap-4">
        <header className="flex items-center justify-between pt-2">
          <div>
            <p className="text-sm font-medium text-ready">Remotie</p>
            <h1 className="text-2xl font-semibold">Instant Listen</h1>
          </div>
          <div className={`rounded-full px-3 py-1.5 text-sm font-semibold ${isLive ? "bg-live text-white" : "bg-white/10 text-white/78"}`}>
            {isLive ? `LIVE ${elapsed}` : "READY"}
          </div>
        </header>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-soft">
          {cameraEnabled ? (
            <video ref={videoRef} autoPlay muted playsInline className="aspect-[3/4] w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center bg-black">
              <div className="text-center">
                <p className="text-lg font-semibold">Camera Off</p>
                <p className="mt-2 text-sm text-white/54">Audio only mode</p>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-4">
            <p className="text-sm font-medium text-white/82">{permissionLabel}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-white/10 bg-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/68">Mic</span>
            <span className="text-sm font-semibold text-white">
              {!micEnabled ? "Off" : micLevel > 2 ? "OK" : "No input"}
            </span>
          </div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-ready transition-[width] duration-100" style={{ width: `${micEnabled ? micLevel : 0}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <button type="button" onClick={switchCamera} disabled={!cameraEnabled || isBusy} className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45">
              <span>Camera</span>
              <span className="mt-1 block font-semibold text-white">{facingMode === "environment" ? "Back" : "Front"}</span>
            </button>
            <button type="button" onClick={toggleCamera} disabled={isBusy} className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45">
              <span>Video</span>
              <span className="mt-1 block font-semibold text-white">{cameraEnabled ? "On" : "Off"}</span>
            </button>
            <button type="button" onClick={toggleMic} disabled={isBusy || permissionState !== "ready"} className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45">
              <span>Mic</span>
              <span className="mt-1 block font-semibold text-white">{micEnabled ? "On" : "Off"}</span>
            </button>
            <button type="button" onClick={() => setScreenHidden(true)} disabled={!isLive} className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45">
              <span>Screen</span>
              <span className="mt-1 block font-semibold text-white">Hide</span>
            </button>
          </div>
          <div className="mt-3 rounded-2xl bg-white/[0.06] p-3 text-sm text-white/72">
            Auto stop <span className="font-semibold text-white">{autoStopRemaining} min</span>
            <span className="ml-3 text-white/42">
              {liveKitState === "connected"
                ? "LiveKit connected"
                : liveKitState === "connecting"
                  ? "LiveKit connecting"
                  : liveKitState === "error"
                    ? "LiveKit error"
                    : "Mock status"}
            </span>
          </div>
        </section>

        {error ? <section className="rounded-3xl border border-live/40 bg-live/10 p-4 text-sm leading-6 text-white">{error}</section> : null}

        <div className="mt-auto grid gap-3">
          {isLive ? (
            <button type="button" onClick={stopStream} disabled={isBusy} className="h-20 rounded-full bg-live text-2xl font-bold text-white shadow-soft disabled:opacity-60">
              STOP
            </button>
          ) : (
            <button type="button" onClick={startStream} disabled={isBusy || permissionState === "checking"} className="h-24 rounded-full bg-white text-3xl font-bold text-ink shadow-soft disabled:opacity-60">
              START
            </button>
          )}
          {permissionState !== "ready" ? (
            <button type="button" onClick={() => requestMedia()} className="rounded-full border border-white/14 px-5 py-4 text-base font-semibold text-white">
              Retry preview
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
