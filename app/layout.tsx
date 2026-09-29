import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (bundled via npm — no runtime fetch, works everywhere).
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novel to Speech — Audiobook Studio",
  description:
    "Convert novels and long-form text into downloadable audiobooks. Paste your manuscript, choose a voice, generate, and export a finished audio file.",
  keywords: ["audiobook", "text to speech", "TTS", "Groq", "Orpheus", "novel", "narration"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/** Applies the saved/system theme before first paint to avoid a flash. */
const themeInit = `try{var t=localStorage.getItem("n2s:theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
