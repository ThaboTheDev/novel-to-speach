"use client";

import { useCallback, useRef, useState } from "react";
import { Card, SectionHeader, Icon } from "./ui";
import { estimateSpeechSeconds, formatDuration, formatNumber, formatUsd, SAMPLE_TEXT } from "@/lib/format";

interface Props {
  text: string;
  onTextChange: (text: string, filename?: string) => void;
  disabled: boolean;
  segmentCount: number;
  requestChars: number;
  costUsd: number;
}

export function ManuscriptPanel({ text, onTextChange, disabled, segmentCount, requestChars, costUsd }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const loadFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert("That file is over 5 MB of text. Split very long books into chapters first.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        onTextChange(String(reader.result ?? ""), file.name);
        setFileName(file.name);
      };
      reader.readAsText(file);
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
        hint="Paste text or drop a .txt file. Blank lines mark paragraphs and become natural pauses."
        right={
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onTextChange(SAMPLE_TEXT, "sample excerpt")}
              disabled={disabled}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text disabled:opacity-40"
            >
              Load sample
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-2 transition hover:border-border-2 hover:text-text disabled:opacity-40"
            >
              {Icon.upload("h-3.5 w-3.5")}
              Upload .txt
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
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
          readOnly={disabled}
          dir="auto"
          spellCheck={false}
          placeholder={"Once upon a time…\n\nPaste your chapter or full manuscript here."}
          className="h-64 w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-text placeholder:text-text-3 focus:outline-none"
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-border-2 bg-panel/90">
            <p className="flex items-center gap-2 text-sm text-text-2">
              {Icon.file()} Drop your .txt file
            </p>
          </div>
        )}
        {disabled && (
          <p className="border-t border-border bg-panel-2 px-5 py-2 text-[11px] text-text-3">
            Generation is running — stop it to edit the manuscript.
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-text-3">
        {fileName && (
          <span className="flex items-center gap-1.5 text-text-2">
            {Icon.file("h-3.5 w-3.5")} {fileName}
          </span>
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
