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
import { ThemeToggle } from "./theme-toggle";

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
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
              {Icon.waveform("h-4 w-4")}
            </span>
            <span className="text-sm font-semibold tracking-tight text-text">Novel to Speech</span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text"
            >
              Get an API key {Icon.external("h-3 w-3")}
            </a>
            <a
              href="https://github.com/ThaboTheDev/novel-to-speach"
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center rounded-lg border border-border px-2.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text"
            >
              GitHub
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-6">
        {/* Page title */}
        <div className="py-7">
          <h1 className="text-xl font-semibold tracking-tight text-text">Audiobook studio</h1>
          <p className="mt-1 text-sm text-text-2">
            Convert long-form text into a downloadable audiobook. Nothing is stored — audio is assembled in your browser.
          </p>
        </div>

        {/* Workspace */}
        <div className="grid items-start gap-5 lg:grid-cols-[1.08fr_1fr]">
          <div className="space-y-5">
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

          <div className="space-y-5 lg:sticky lg:top-5">
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
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-text-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Powered by{" "}
            <a
              href="https://console.groq.com/docs/text-to-speech"
              target="_blank"
              rel="noreferrer"
              className="text-text-2 underline decoration-border-2 underline-offset-2 transition hover:text-text"
            >
              Groq Orpheus
            </a>
            {" "}· English $22 / Arabic $40 per 1M characters
          </p>
          <p>Your API key is only used by the server route.</p>
        </div>
      </footer>
    </div>
  );
}
