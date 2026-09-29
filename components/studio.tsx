"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManuscriptPanel } from "./manuscript-panel";
import { NarrationPanel, type NarrationSettings } from "./narration-panel";
import { SegmentsPanel } from "./segments-panel";
import { OutputPanel } from "./output-panel";
import { useGenerator, type GeneratorSettings } from "@/lib/use-generator";
import { useAudioPlayer } from "@/lib/use-audio-player";
import { DIRECTION_PRESETS, DEFAULT_MODEL, estimateCostUsd, getModel, sanitizeDirection } from "@/lib/catalog";
import { Icon } from "./ui";

const STORAGE_KEY = "n2s:studio:v1";

const DEFAULT_SETTINGS: NarrationSettings = {
  modelId: DEFAULT_MODEL,
  voiceId: "troy",
  directionId: "none",
  customDirection: "",
  concurrency: 3,
  maxChars: 200,
  paragraphPauseMs: 300,
};

interface Persisted {
  text: string;
  title: string;
  settings: NarrationSettings;
}

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return { text: "", title: "my-audiobook", settings: DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("none");
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : "my-audiobook",
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return { text: "", title: "my-audiobook", settings: DEFAULT_SETTINGS };
  }
}

function resolveDirection(s: NarrationSettings): string {
  if (!getModel(s.modelId)?.supportsDirections) return "";
  const preset = DIRECTION_PRESETS.find((d) => d.id === s.directionId);
  if (preset && preset.id !== "none") return preset.directive;
  return sanitizeDirection(s.customDirection);
}

function titleFromText(text: string, fileName?: string): string {
  if (fileName) return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const first = text.trim().split(/\s+/).slice(0, 5).join(" ");
  return first.length >= 4 ? first : "my-audiobook";
}

export function Studio() {
  const [hydrated, setHydrated] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("my-audiobook");
  const [settings, setSettings] = useState<NarrationSettings>(DEFAULT_SETTINGS);

  const gen = useGenerator();
  const segmentPlayer = useAudioPlayer();
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Hydrate from localStorage once --------------------------------------
  useEffect(() => {
    const persisted = loadPersisted();
    setText(persisted.text);
    setTitle(persisted.title);
    setSettings(persisted.settings);
    setHydrated(true);
  }, []);

  // ---- Persist (debounced) ---------------------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, title, settings } satisfies Persisted));
      } catch {
        /* storage may be full for very long texts — non-fatal */
      }
    }, 600);
    return () => clearTimeout(id);
  }, [text, title, settings, hydrated]);

  const direction = useMemo(() => resolveDirection(settings), [settings]);
  const prepareSignature = useMemo(
    () => `${settings.maxChars}:${direction}`,
    [settings.maxChars, direction],
  );

  // ---- (Re)split text into segments whenever it materially changes ---------
  useEffect(() => {
    if (!hydrated) return;
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = setTimeout(() => {
      gen.prepare(text, { maxChars: settings.maxChars, direction });
    }, 350);
    return () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prepareSignature, hydrated]);

  // ---- Auto-stitch once every segment is done --------------------------------
  const allDone = gen.counts.total > 0 && gen.counts.done === gen.counts.total;
  useEffect(() => {
    if (allDone && !gen.combined) gen.assemble(settings.paragraphPauseMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, gen.combined]);

  // ---- Warn before leaving mid-generation -------------------------------------
  useEffect(() => {
    if (gen.phase !== "running") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [gen.phase]);

  const requestChars = useMemo(() => gen.segments.reduce((n, s) => n + s.apiText.length, 0), [gen.segments]);
  const costUsd = useMemo(() => estimateCostUsd(requestChars, settings.modelId), [requestChars, settings.modelId]);

  const handleTextChange = useCallback((value: string, fileName?: string) => {
    setText(value);
    setTitle((t) => (t === "my-audiobook" || t.trim() === "" ? titleFromText(value, fileName) : t));
  }, []);

  const handleSettingsChange = useCallback(
    (patch: Partial<NarrationSettings>, _opts?: { invalidateAudio?: boolean }) => {
      setSettings((s) => ({ ...s, ...patch }));
      // Audio-invalidating changes (direction / maxChars) alter prepareSignature,
      // which triggers the re-split effect above.
    },
    [],
  );

  const resolvedSettings = useCallback((): GeneratorSettings => {
    return {
      model: settings.modelId,
      voice: settings.voiceId,
      direction,
      maxChars: settings.maxChars,
      concurrency: settings.concurrency,
      paragraphPauseMs: settings.paragraphPauseMs,
    };
  }, [settings, direction]);

  const model = getModel(settings.modelId);
  const running = gen.phase === "running";

  return (
    <div className="relative min-h-screen">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-amber-500/[0.09] blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[520px] rounded-full bg-violet-600/[0.07] blur-[130px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-zinc-950 shadow-[0_8px_24px_-8px_rgba(251,191,36,0.6)]">
              {Icon.waveform("h-5 w-5")}
            </span>
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-zinc-100">
                Novel <span className="text-gradient italic">→ Speech</span>
              </h1>
              <p className="text-[11px] text-zinc-500">Audiobook studio · Groq Orpheus</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-xs">
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 px-3 py-2 text-zinc-400 transition hover:border-amber-400/40 hover:text-amber-300"
            >
              Get a free API key
            </a>
            <a
              href="https://github.com/ThaboTheDev/novel-to-speach"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-lg border border-white/10 px-3 py-2 text-zinc-400 transition hover:border-white/30 hover:text-zinc-200 sm:block"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 pb-16 sm:px-8">
        {/* Hero */}
        <div className="max-w-2xl py-10">
          <h2 className="font-display text-4xl font-medium leading-[1.08] tracking-tight text-zinc-100 sm:text-5xl">
            Give your novel a <span className="text-gradient italic">voice</span>.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Paste a chapter, choose a narrator, and export a finished audiobook. Your text is split into
            API-sized segments, generated in parallel, and stitched together — entirely in your browser.
          </p>
        </div>

        {/* Workspace */}
        <div className="grid items-start gap-6 lg:grid-cols-[1.12fr_1fr]">
          <div className="space-y-6">
            <ManuscriptPanel
              text={text}
              onTextChange={handleTextChange}
              disabled={running}
              segmentCount={gen.counts.total}
              requestChars={requestChars}
              costUsd={costUsd}
            />
            <NarrationPanel settings={settings} onChange={handleSettingsChange} disabled={running} />
          </div>

          <div className="space-y-6 lg:sticky lg:top-6">
            <OutputPanel
              phase={gen.phase}
              counts={gen.counts}
              combined={gen.combined}
              startedAt={gen.startedAt}
              title={title}
              onTitleChange={setTitle}
              onGenerate={() => gen.start(resolvedSettings())}
              onCancel={gen.cancel}
              onAssemble={() => gen.assemble(settings.paragraphPauseMs)}
              demoMode={gen.demoMode}
            />
            <SegmentsPanel
              segments={gen.segments}
              player={segmentPlayer}
              getSegmentUrl={gen.getSegmentUrl}
              modelDir={model?.dir ?? "ltr"}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-[11px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            Powered by{" "}
            <a href="https://console.groq.com/docs/text-to-speech" target="_blank" rel="noreferrer" className="text-zinc-400 underline decoration-white/20 underline-offset-2 hover:text-amber-300">
              Groq Orpheus TTS
            </a>
            {" "}— English $22 / Arabic $40 per 1M characters.
          </p>
          <p>Your API key is only used by the server route — it never reaches the browser.</p>
        </div>
      </footer>
    </div>
  );
}
