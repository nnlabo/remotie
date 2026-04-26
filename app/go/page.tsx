"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamStatusResponse } from "@/lib/stream-types";

type PermissionState = "checking" | "ready" | "required" | "error";
type FacingMode = "environment" | "user";

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
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15, max: 30 }
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

export default function GoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  const isLive = status?.isLive ?? false;
  const elapsed = formatElapsed(status?.stream.startedAt, nowMs);
  const autoStopRemaining = remainingMinutes(
    status?.stream.startedAt,
    status?.stream.autoStopMinutes ?? 60,
    nowMs
  );

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

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopMeter]);

  const applyTrackState = useCallback((stream: MediaStream, nextMicEnabled = micEnabled) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextMicEnabled;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled, micEnabled]);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || !micEnabled) {
        setMicLevel(0);
        return;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
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
        setError("このブラウザではカメラまたはマイクを利用できません。Safariの最新版で開いてください。");
        return null;
      }

      setPermissionState("checking");
      setError("");
      stopMediaTracks();

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          buildMediaConstraints(nextFacingMode, nextCameraEnabled)
        );
        streamRef.current = stream;
        applyTrackState(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        startMeter(stream);
        setPermissionState("ready");
        return stream;
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラー";
        setPermissionState("error");
        setError(`カメラまたはマイクにアクセスできませんでした: ${message}`);
        return null;
      }
    },
    [applyTrackState, cameraEnabled, facingMode, startMeter, stopMediaTracks]
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
      const response = await fetch("/api/stream/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: cameraEnabled ? "audio_video" : "audio_only" })
      });
      setStatus((await response.json()) as StreamStatusResponse);
    } finally {
      setIsBusy(false);
    }
  }, [cameraEnabled, requestMedia]);

  const stopStream = useCallback(async () => {
    setIsBusy(true);
    try {
      const response = await fetch("/api/stream/stop", { method: "POST" });
      setStatus((await response.json()) as StreamStatusResponse);
      stopMediaTracks();
      setPermissionState("required");
    } finally {
      setIsBusy(false);
    }
  }, [stopMediaTracks]);

  const switchCamera = useCallback(async () => {
    const nextFacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacingMode);
    if (cameraEnabled) {
      await requestMedia(nextFacingMode, true);
    }
  }, [cameraEnabled, facingMode, requestMedia]);

  const toggleMic = useCallback(() => {
    const nextMicEnabled = !micEnabled;
    setMicEnabled(nextMicEnabled);
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextMicEnabled;
    });
    if (nextMicEnabled) {
      startMeter(stream);
    } else {
      stopMeter();
    }
  }, [micEnabled, startMeter, stopMeter]);

  const toggleCamera = useCallback(async () => {
    const nextCameraEnabled = !cameraEnabled;
    setCameraEnabled(nextCameraEnabled);
    if (nextCameraEnabled) {
      await requestMedia(facingMode, true);
      return;
    }

    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = false;
      track.stop();
    });
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [cameraEnabled, facingMode, requestMedia]);

  useEffect(() => {
    refreshStatus().catch(() => undefined);
    requestMedia().catch(() => undefined);
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearInterval(interval);
      stopMediaTracks();
    };
  }, [refreshStatus, requestMedia, stopMediaTracks]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    applyTrackState(stream);
  }, [applyTrackState, micEnabled, cameraEnabled]);

  useEffect(() => {
    if (!isLive || autoStopRemaining > 0) return;
    stopStream().catch(() => undefined);
  }, [autoStopRemaining, isLive, stopStream]);

  return (
    <main className="min-h-dvh bg-ink px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white">
      <section className="mx-auto flex min-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] max-w-md flex-col gap-4">
        <header className="flex items-center justify-between pt-2">
          <div>
            <p className="text-sm font-medium text-ready">Remotie</p>
            <h1 className="text-2xl font-semibold">Instant Listen</h1>
          </div>
          <div
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              isLive ? "bg-live text-white" : "bg-white/10 text-white/78"
            }`}
          >
            {isLive ? `LIVE ${elapsed}` : "READY"}
          </div>
        </header>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-soft">
          {cameraEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="aspect-[3/4] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center bg-black">
              <div className="text-center">
                <p className="text-lg font-semibold">Camera Off</p>
                <p className="mt-2 text-sm text-white/54">音声のみで待機します</p>
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-4">
            <p className="text-sm font-medium text-white/82">
              {permissionState === "ready"
                ? "カメラ・マイク準備完了"
                : permissionState === "checking"
                  ? "権限を確認中"
                  : permissionState === "required"
                    ? "プレビューを再開してください"
                    : "権限エラー"}
            </p>
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
            <div
              className="h-full rounded-full bg-ready transition-[width] duration-100"
              style={{ width: `${micEnabled ? micLevel : 0}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={switchCamera}
              disabled={!cameraEnabled || isBusy}
              className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45"
            >
              <span>Camera</span>
              <span className="mt-1 block font-semibold text-white">
                {facingMode === "environment" ? "Back" : "Front"}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              disabled={isBusy}
              className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45"
            >
              <span>Video</span>
              <span className="mt-1 block font-semibold text-white">{cameraEnabled ? "On" : "Off"}</span>
            </button>
            <button
              type="button"
              onClick={toggleMic}
              disabled={isBusy || permissionState !== "ready"}
              className="rounded-2xl bg-white/[0.06] p-3 text-left text-sm text-white/72 disabled:opacity-45"
            >
              <span>Mic</span>
              <span className="mt-1 block font-semibold text-white">{micEnabled ? "On" : "Off"}</span>
            </button>
          </div>
          <div className="mt-3 rounded-2xl bg-white/[0.06] p-3 text-sm text-white/72">
            Auto stop <span className="font-semibold text-white">{autoStopRemaining} min</span>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-live/40 bg-live/10 p-4 text-sm leading-6 text-white">
            {error}
          </section>
        ) : null}

        <div className="mt-auto grid gap-3">
          {isLive ? (
            <button
              type="button"
              onClick={stopStream}
              disabled={isBusy}
              className="h-20 rounded-full bg-live text-2xl font-bold text-white shadow-soft disabled:opacity-60"
            >
              STOP
            </button>
          ) : (
            <button
              type="button"
              onClick={startStream}
              disabled={isBusy || permissionState === "checking"}
              className="h-24 rounded-full bg-white text-3xl font-bold text-ink shadow-soft disabled:opacity-60"
            >
              START
            </button>
          )}
          {permissionState !== "ready" ? (
            <button
              type="button"
              onClick={() => requestMedia()}
              className="rounded-full border border-white/14 px-5 py-4 text-base font-semibold text-white"
            >
              プレビューを再試行
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
