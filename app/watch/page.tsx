"use client";

import { useEffect, useMemo, useState } from "react";
import type { StreamStatusResponse } from "@/lib/stream-types";

function formatTime(iso?: string) {
  if (!iso) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

export default function WatchPage() {
  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isLive = status?.isLive ?? false;
  const stateLabel = useMemo(() => {
    if (!status) return "確認中";
    return isLive ? "Connected" : "Waiting";
  }, [isLive, status]);

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
    };
  }, []);

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
            <div className="aspect-video rounded-3xl border border-white/10 bg-black p-5">
              {isLive ? (
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center gap-2 text-live">
                    <span className="h-3 w-3 rounded-full bg-live" />
                    <span className="text-sm font-bold">Connected</span>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold">Live stream active</p>
                    <p className="mt-3 text-sm leading-6 text-white/62">
                      このMVPではWebRTC映像は未接続です。送信側のライブ状態だけを確認しています。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-3xl font-semibold">Waiting for stream...</p>
                  <p className="mt-3 text-base leading-7 text-white/62">
                    このページを開いたままにしてください。/go で START すると自動で切り替わります。
                  </p>
                </div>
              )}
            </div>

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
