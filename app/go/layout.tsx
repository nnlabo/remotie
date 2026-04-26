import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remotie Go",
  applicationName: "Remotie Go",
  manifest: "/go.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Remotie Go"
  },
  icons: {
    icon: [
      { url: "/icons/go.svg", type: "image/svg+xml" },
      { url: "/icons/go-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/go-180.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function GoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
