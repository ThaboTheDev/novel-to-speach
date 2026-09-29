import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (bundled via npm — no runtime fetch, works everywhere).
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novel → Speech — Audiobook Studio",
  description:
    "Turn novels and long-form text into downloadable audiobooks with expressive AI voices. Paste your manuscript, pick a voice, and export a finished audio file.",
  keywords: ["audiobook", "text to speech", "TTS", "Groq", "Orpheus", "novel", "narration"],
};

export const viewport: Viewport = {
  themeColor: "#09090d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="noise-overlay" aria-hidden />
        {children}
      </body>
    </html>
  );
}
