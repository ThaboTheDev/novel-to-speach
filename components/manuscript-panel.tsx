"use client";

import { useCallback, useRef, useState } from "react";
import { Card, SectionHeader, Icon, Spinner } from "./ui";
import { estimateSpeechSeconds, formatDuration, formatNumber, formatUsd, SAMPLE_TEXT } from "@/lib/format";
import { ACCEPT_ATTRIBUTE, extractDocument, MAX_DOC_BYTES } from "@/lib/documents";

interface Props {
  text: string;
  onTextChange: (text: string, filename?: string) => void;
  disabled: boolean;
  segmentCount: number;
  requestChars: number;
  costUsd: number;
}

interface ExtractState {
  running: boolean;
  message: string;
  error: string | null;
  format: string | null;
}

export function ManuscriptPanel({ text, onTextChange, disabled, segmentCount, requestChars, costUsd }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extract, setExtract] = useState<ExtractState>({ running: false, message: "", error: null, format: null });

  const loadFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > MAX_DOC_BYTES) {
        setExtract({ running: false, message: "", error: "That file is over 60 MB. Split it into smaller parts first.", format: null });
        return;
      }
      setFileName(file.name);
      setExtract({ running: true, message: "Reading file…", error: null, format: null });
      try {
        const { text: docText, format } = await extractDocument(file, (message) =>
          setExtract((s) => (s.running ? { ...s, message } : s)),
        );
        onTextChange(docText, file.name.replace(/\.[^.]+$/, ""));
        setExtract({ running: false, message: "", error: null, format });
      } catch (err) {
        setExtract({
          running: false,
          message: "",
          error: err instanceof Error ? err.message : "Could not read that file.",
          format: null,
        });
      }
    },
    [onTextChange],
  );

  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estSeconds = estimateSpeechSeconds(requestChars);

  return (
    <Card className="overflow-hidden">
      <SectionHeader
        step="01"
        title="Manuscript"
        hint="Paste text, or import a document — PDF, DOCX, EPUB, TXT, MD, HTML or RTF. Text is extracted locally in your browser."
        right={
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onTextChange(SAMPLE_TEXT, "sample excerpt")}
              disabled={disabled || extract.running}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text disabled:opacity-40"
            >
              Load sample
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || extract.running}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text disabled:opacity-40"
            >
              {extract.running ? <Spinner className="h-3.5 w-3.5" /> : Icon.upload("h-3.5 w-3.5")}
              Import file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(e) => {
                loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        }
      />

      <div
        className="relative"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) loadFile(e.dataTransfer.files?.[0]);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setFileName(null);
            onTextChange(e.target.value);
          }}
          readOnly={disabled || extract.running}
          dir="auto"
          spellCheck={false}
          placeholder={"Once upon a time…\n\nPaste your chapter or full manuscript here."}
          className="h-64 w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-text placeholder:text-text-3 focus:outline-none"
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-border-2 bg-panel/90">
            <p className="flex items-center gap-2 text-sm text-text-2">
              {Icon.file()} Drop PDF, DOCX, EPUB, TXT…
            </p>
          </div>
        )}
        {extract.running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-panel/90">
            <Spinner className="h-5 w-5 text-text-2" />
            <p className="text-sm text-text-2">{extract.message}</p>
            <p className="max-w-xs text-center text-[11px] text-text-3">Extraction happens in your browser — the file is never uploaded.</p>
          </div>
        )}
        {disabled && !extract.running && (
          <p className="border-t border-border bg-panel-2 px-5 py-2 text-[11px] text-text-3">
            Generation is running — stop it to edit the manuscript.
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-text-3">
        {extract.error ? (
          <span className="text-danger">{extract.error}</span>
        ) : (
          fileName && (
            <span className="flex items-center gap-1.5 text-text-2">
              {Icon.file("h-3.5 w-3.5")} {fileName}
              {extract.format && <span className="rounded border border-border bg-panel-2 px-1 py-px font-mono text-[10px] text-text-3">{extract.format}</span>}
            </span>
          )
        )}
        <Stat label="characters" value={formatNumber(chars)} />
        <Stat label="words" value={formatNumber(words)} />
        <Stat label="requests" value={segmentCount ? formatNumber(segmentCount) : "—"} title="One API request per ≤200 characters" />
        <Stat label="est. audio" value={chars ? `≈ ${formatDuration(estSeconds)}` : "—"} />
        <Stat label="est. cost" value={chars ? formatUsd(costUsd) : "—"} title="Based on Groq's per-character pricing" />
      </footer>
    </Card>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="font-mono text-text-2">{value}</span>
      <span>{label}</span>
    </span>
  );
}
