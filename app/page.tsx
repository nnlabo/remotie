import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh bg-ink px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-between">
        <section className="pt-10">
          <p className="text-sm font-medium text-ready">Remotie</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal">
            Instant Listen
          </h1>
          <p className="mt-4 text-base leading-7 text-white/72">
            iPhoneを置いて、必要な瞬間にだけカメラとマイクを起動するためのPWAです。
          </p>
        </section>

        <section className="grid gap-3 pb-4">
          <Link
            href="/go"
            className="rounded-full bg-white px-6 py-4 text-center text-lg font-semibold text-ink"
          >
            送信を開く
          </Link>
          <Link
            href="/watch"
            className="rounded-full border border-white/18 px-6 py-4 text-center text-lg font-semibold text-white"
          >
            視聴を開く
          </Link>
        </section>
      </div>
    </main>
  );
}
