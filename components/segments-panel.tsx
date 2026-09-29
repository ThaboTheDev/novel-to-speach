"use client";

import { Card, SectionHeader, StatusDot, Icon } from "./ui";
import type { AudioSegment } from "@/lib/use-generator";
import type { useAudioPlayer } from "@/lib/use-audio-player";

interface Props {
  segments: AudioSegment[];
  player: ReturnType<typeof useAudioPlayer>;
  getSegmentUrl: (index: number) => string | null;
  modelDir: "ltr" | "rtl";
}

export function SegmentsPanel({ segments, player, getSegmentUrl, modelDir }: Props) {
  return (
    <Card className="flex h-[320px] min-h-0 flex-col overflow-hidden lg:h-[440px]">
      <SectionHeader
        step="03"
        title="Segments"
        hint={
          segments.length
            ? `${segments.length} requests of ≤200 characters, stitched back together after generation.`
            : "Your text is split into API-sized pieces here."
        }
        right={
          segments.length > 0 ? (
            <span className="mt-1 shrink-0 font-mono text-[11px] text-text-3">
              {segments.filter((s) => s.status === "done").length}/{segments.length}
            </span>
          ) : undefined
        }
      />

      {segments.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="text-text-3">{Icon.waveform("h-6 w-6")}</span>
          <p className="text-sm text-text-3">Add some text and your segments will appear here.</p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {segments.map((seg) => (
            <SegmentRow key={seg.index} seg={seg} player={player} getSegmentUrl={getSegmentUrl} dir={modelDir} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function SegmentRow({
  seg,
  player,
  getSegmentUrl,
  dir,
}: {
  seg: AudioSegment;
  player: ReturnType<typeof useAudioPlayer>;
  getSegmentUrl: (index: number) => string | null;
  dir: "ltr" | "rtl";
}) {
  const playId = `seg-${seg.index}`;
  const isPlaying = player.playingId === playId;

  return (
    <li className="group flex items-start gap-3 px-5 py-2.5 transition hover:bg-panel-2/60">
      <div className="mt-[5px]">
        <StatusDot status={seg.status} />
      </div>
      <span className="mt-0.5 w-8 shrink-0 font-mono text-[10px] text-text-3">#{seg.index + 1}</span>
      <div className="min-w-0 flex-1">
        <p dir={dir === "rtl" ? "rtl" : "ltr"} className="line-clamp-2 text-[12px] leading-snug text-text-2">
          {seg.text}
        </p>
        {seg.error && (
          <p className={`mt-1 text-[11px] ${seg.status === "error" ? "text-danger" : "text-warn"}`}>{seg.error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10px] text-text-3">{seg.apiText.length}c</span>
        {seg.status === "done" && (
          <button
            type="button"
            aria-label={`Play segment ${seg.index + 1}`}
            onClick={() => {
              const url = getSegmentUrl(seg.index);
              if (url) player.play(playId, url);
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
              isPlaying
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-text-3 hover:border-border-2 hover:text-text"
            }`}
          >
            {isPlaying ? Icon.stop("h-2.5 w-2.5") : Icon.play("h-2.5 w-2.5")}
          </button>
        )}
      </div>
    </li>
  );
}
