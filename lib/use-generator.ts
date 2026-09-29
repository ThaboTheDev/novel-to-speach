"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { chunkText, type TextSegment } from "./chunker";
import { synthesizeSpeech, SynthesizeError } from "./api";
import { concatPcm, encodeWav, parseWav, pcmDuration } from "./wav";

export type SegmentStatus = "pending" | "generating" | "done" | "error";
export type Phase = "idle" | "ready" | "running" | "assembled";

export interface AudioSegment extends TextSegment {
  status: SegmentStatus;
  error?: string;
  attempts: number;
  pcm?: Int16Array;
  sampleRate?: number;
  url?: string;
}

export interface CombinedAudio {
  pcm: Int16Array;
  sampleRate: number;
  url: string;
  durationSec: number;
}

export interface GeneratorSettings {
  model: string;
  voice: string;
  direction: string;
  maxChars: number;
  concurrency: number;
  paragraphPauseMs: number;
}

const MAX_ATTEMPTS = 3;

export function useGenerator() {
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [sourceChars, setSourceChars] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [demoMode, setDemoMode] = useState(false);
  const [combined, setCombined] = useState<CombinedAudio | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Ref mirror of segments — workers read it; every write goes through `update`.
  const segmentsRef = useRef<AudioSegment[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const update = useCallback((updater: (prev: AudioSegment[]) => AudioSegment[]) => {
    setSegments((prev) => {
      const next = updater(prev);
      segmentsRef.current = next;
      return next;
    });
  }, []);

  const revokeAll = useCallback((list: AudioSegment[]) => {
    for (const s of list) if (s.url) URL.revokeObjectURL(s.url);
  }, []);

  /** Split text into segments and reset all generated audio. Returns segment count. */
  const prepare = useCallback(
    (text: string, settings: Pick<GeneratorSettings, "maxChars" | "direction">) => {
      abortRef.current?.abort();
      update((old) => {
        revokeAll(old);
        return [];
      });
      setCombined((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return null;
      });

      const chunks = chunkText(text, { maxChars: settings.maxChars, direction: settings.direction });
      setSourceChars(text.trim().length);
      update(() => chunks.map((c) => ({ ...c, status: "pending" as const, attempts: 0 })));
      setPhase(chunks.length > 0 ? "ready" : "idle");
      return chunks.length;
    },
    [revokeAll, update],
  );

  const patchSegment = useCallback(
    (index: number, patch: Partial<AudioSegment>) => {
      update((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)));
    },
    [update],
  );

  const generateOne = useCallback(
    async (seg: AudioSegment, settings: GeneratorSettings, signal: AbortSignal) => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (signal.aborted) return;
        patchSegment(seg.index, { status: "generating", attempts: attempt, error: undefined });
        try {
          const { audio, demo } = await synthesizeSpeech(
            { text: seg.apiText, voice: settings.voice, model: settings.model },
            signal,
          );
          if (demo) setDemoMode(true);
          const wav = parseWav(audio);
          patchSegment(seg.index, {
            status: "done",
            pcm: wav.pcm,
            sampleRate: wav.sampleRate,
            error: undefined,
          });
          return;
        } catch (err) {
          if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          if (attempt === MAX_ATTEMPTS) {
            const msg = err instanceof SynthesizeError ? err.message : "Generation failed.";
            patchSegment(seg.index, { status: "error", error: msg });
            return;
          }
          const hinted = err instanceof SynthesizeError ? err.retryAfterMs : undefined;
          const wait = hinted ?? Math.min(9000, 700 * 2 ** attempt + Math.random() * 500);
          patchSegment(seg.index, { error: `Retrying in ${Math.ceil(wait / 1000)}s…` });
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    },
    [patchSegment],
  );

  /** Run the queue over all non-done segments. Resolves when settled or aborted. */
  const start = useCallback(
    async (settings: GeneratorSettings) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const work = segmentsRef.current.filter((s) => s.status !== "done");
      if (work.length === 0) return;

      // Any previously stitched result is now stale.
      setCombined((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return null;
      });

      setPhase("running");
      setStartedAt(Date.now());

      let cursor = 0;
      const worker = async () => {
        while (!controller.signal.aborted) {
          const i = cursor++;
          if (i >= work.length) return;
          await generateOne(work[i], settings, controller.signal);
        }
      };
      const lanes = Math.max(1, Math.min(8, Math.round(settings.concurrency)));
      await Promise.all(Array.from({ length: lanes }, worker));

      setStartedAt(null);
      const anyLeft = segmentsRef.current.some((s) => s.status === "pending" || s.status === "error");
      setPhase(anyLeft ? "ready" : "assembled");
    },
    [generateOne],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    update((prev) =>
      prev.map((s) => (s.status === "generating" ? { ...s, status: "pending" as const, error: undefined } : s)),
    );
    setStartedAt(null);
    setPhase((p) => (p === "running" ? "ready" : p));
  }, [update]);

  /** Stitch all done segments (in order) into one playable/downloadable file. */
  const assemble = useCallback((paragraphPauseMs: number): CombinedAudio | null => {
    const done = segmentsRef.current
      .slice()
      .sort((a, b) => a.index - b.index)
      .filter((s) => s.status === "done" && s.pcm);
    if (done.length === 0) return null;

    const sampleRate = done[0].sampleRate ?? 24000;
    const pcm = concatPcm(
      done.map((s) => ({ pcm: s.pcm!, paragraphPause: s.endOfParagraph })),
      sampleRate,
      paragraphPauseMs,
    );
    const blob = encodeWav(pcm, sampleRate);
    const next: CombinedAudio = {
      pcm,
      sampleRate,
      url: URL.createObjectURL(blob),
      durationSec: pcmDuration(pcm, sampleRate),
    };
    setCombined((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return next;
    });
    setPhase("assembled");
    return next;
  }, []);

  /** Lazily create (or reuse) a playable object URL for a segment. */
  const getSegmentUrl = useCallback(
    (index: number): string | null => {
      const seg = segmentsRef.current.find((s) => s.index === index);
      if (!seg?.pcm) return null;
      if (seg.url) return seg.url;
      const url = URL.createObjectURL(encodeWav(seg.pcm, seg.sampleRate ?? 24000));
      patchSegment(index, { url });
      return url;
    },
    [patchSegment],
  );

  /** Retry only the failed segments. */
  const retryFailed = useCallback(
    (settings: GeneratorSettings) => start(settings),
    [start],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, generating: 0, done: 0, error: 0, total: segments.length };
    for (const s of segments) c[s.status]++;
    return c;
  }, [segments]);

  return {
    segments,
    counts,
    sourceChars,
    phase,
    demoMode,
    combined,
    startedAt,
    prepare,
    start,
    cancel,
    assemble,
    getSegmentUrl,
    retryFailed,
  };
}
