"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionHeader, Icon, Spinner, Badge } from "./ui";
import type { CombinedAudio, Phase } from "@/lib/use-generator";
import { downloadBlob, formatDuration, slugify } from "@/lib/format";
import { encodeMp3 } from "@/lib/mp3";

interface Counts {
  pending: number;
  generating: number;
  done: number;
  error: number;
  total: number;
}

interface Props {
  phase: Phase;
  counts: Counts;
  combined: CombinedAudio | null;
  startedAt: number | null;
  title: string;
  onTitleChange: (t: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onAssemble: () => void;
  demoMode: boolean;
}

export function OutputPanel({
  phase,
  counts,
  combined,
  startedAt,
  title,
  onTitleChange,
  onGenerate,
  onCancel,
  onAssemble,
  demoMode,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [mp3State, setMp3State] = useState<{ running: boolean; progress: number }>({ running: false, progress: 0 });
  const [bitrate, setBitrate] = useState(96);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed((Date.now() - startedAt) / 1000);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const running = phase === "running";
  const progress = counts.total > 0 ? counts.done / counts.total : 0;
  const remaining = counts.pending + counts.generating + counts.error;

  const eta = useMemo(() => {
    if (!running || counts.done < 3 || elapsed < 3) return null;
    const perItem = elapsed / counts.done;
    return perItem * Math.max(0, counts.pending + counts.generating);
  }, [running, counts.done, counts.pending, counts.generating, elapsed]);

  const canGenerate = counts.total > 0 && remaining > 0 && !running;
  const allDone = counts.total > 0 && counts.done === counts.total;

  const exportMp3 = async () => {
    if (!combined || mp3State.running) return;
    setMp3State({ running: true, progress: 0 });
    try {
      const blob = await encodeMp3(combined.pcm, combined.sampleRate, {
        kbps: bitrate,
        onProgress: (p) => setMp3State({ running: true, progress: p }),
      });
      const url = URL.createObjectURL(blob);
      downloadBlob(url, `${slugify(title)}.mp3`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setMp3State({ running: false, progress: 0 });
    }
  };

  return (
    <Card className="overflow-hidden">
      <SectionHeader
        step="04"
        title="Generate & export"
        hint="Audio is stitched in your browser — the API key never leaves the server."
      />

      <div className="space-y-5 px-5 py-5">
        {demoMode && (
          <div className="rounded-lg border border-warn/25 bg-warn/[0.07] px-3.5 py-3 text-xs leading-relaxed text-text-2">
            <strong className="font-semibold text-text">Demo mode:</strong> no{" "}
            <code className="font-mono">GROQ_API_KEY</code> is set, so you&apos;ll hear synthetic placeholder audio. Add the
            key to hear the real voices.
          </div>
        )}

        {/* Progress */}
        <div>
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="text-text-2">
              {counts.total === 0
                ? "Nothing to generate yet"
                : running
                  ? `Generating… ${counts.done} of ${counts.total}`
                  : allDone
                    ? "All segments generated"
                    : `${counts.done} of ${counts.total} generated`}
            </span>
            <span className="font-mono text-text-3">
              {running && `${formatDuration(elapsed)} elapsed`}
              {running && eta !== null && ` · ~${formatDuration(eta)} left`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          {counts.total > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge>done {counts.done}</Badge>
              {counts.pending > 0 && <Badge>queued {counts.pending}</Badge>}
              {counts.generating > 0 && <Badge tone="warn">active {counts.generating}</Badge>}
              {counts.error > 0 && <Badge tone="danger">failed {counts.error}</Badge>}
            </div>
          )}
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/15"
            >
              {Icon.stop()} Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {counts.error > 0
                ? `Retry failed (${counts.error})`
                : counts.done > 0 && remaining > 0
                  ? `Resume (${remaining} left)`
                  : "Generate audiobook"}
            </button>
          )}
          {!running && counts.done > 0 && (!allDone || !combined) && (
            <button
              type="button"
              onClick={onAssemble}
              className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success transition hover:bg-success/15"
            >
              {Icon.waveform("h-4 w-4")}
              {allDone ? "Stitch audiobook" : `Stitch what's ready (${counts.done})`}
            </button>
          )}
        </div>

        {/* Result */}
        {combined && (
          <div className="animate-rise space-y-4 rounded-lg border border-border bg-panel-2/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <span className="text-success">{Icon.check("h-4 w-4")}</span> Your audiobook is ready
              </div>
              <span className="font-mono text-xs text-text-3">{formatDuration(combined.durationSec)}</span>
            </div>

            <audio controls preload="metadata" src={combined.url} />

            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-text-2">File name</label>
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="my-audiobook"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-border-2 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadBlob(combined.url, `${slugify(title)}.wav`)}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
              >
                {Icon.download()} Download WAV
              </button>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-border">
                <select
                  value={bitrate}
                  onChange={(e) => setBitrate(Number(e.target.value))}
                  className="bg-panel px-2.5 py-2.5 text-xs text-text-2 focus:outline-none"
                  title="MP3 bitrate"
                >
                  <option value={64}>64k</option>
                  <option value={96}>96k</option>
                  <option value={128}>128k</option>
                  <option value={192}>192k</option>
                </select>
                <button
                  type="button"
                  onClick={exportMp3}
                  disabled={mp3State.running}
                  className="flex items-center gap-2 border-l border-border px-4 py-2.5 text-sm font-medium text-text transition hover:bg-panel-2 disabled:opacity-50"
                >
                  {mp3State.running ? (
                    <>
                      <Spinner /> {Math.round(mp3State.progress * 100)}%
                    </>
                  ) : (
                    <>{Icon.download()} MP3</>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onAssemble}
                title="Re-stitch (applies the current paragraph pause)"
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text"
              >
                {Icon.retry("h-3 w-3")} Re-stitch
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-text-3">
              WAV is lossless but large. MP3 encodes in your browser — smaller files, easier to share.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
