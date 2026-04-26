import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remotie Watch",
  applicationName: "Remotie Watch",
  manifest: "/watch.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Remotie Watch"
  },
  icons: {
    icon: [
      { url: "/icons/watch.svg", type: "image/svg+xml" },
      { url: "/icons/watch-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/watch-180.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
