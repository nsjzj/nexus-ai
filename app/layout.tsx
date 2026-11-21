import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS AI — Your AI workspace",
  description: "One calm workspace for AI conversations, projects, and developer workflows.",
  applicationName: "NEXUS AI",
};

export const viewport: Viewport = {
  themeColor: "#090b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}