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
            ? `${segments.length} requests of ≤200 characters, generated one by one and stitched back together.`
            : "Your text is split into API-sized pieces here."
        }
        right={
          segments.length > 0 ? (
            <span className="mt-1 shrink-0 font-mono text-[11px] text-zinc-500">
              {segments.filter((s) => s.status === "done").length}/{segments.length}
            </span>
          ) : undefined
        }
      />

      {segments.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="text-zinc-600">{Icon.waveform("h-7 w-7")}</span>
          <p className="text-sm text-zinc-500">Add some text and your segments will appear here.</p>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-white/[0.04] overflow-y-auto">
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
    <li className="group flex items-start gap-3 px-4 py-2.5 transition hover:bg-white/[0.03] sm:px-5">
      <div className="mt-[5px]">
        <StatusDot status={seg.status} />
      </div>
      <span className="mt-0.5 w-9 shrink-0 font-mono text-[10px] text-zinc-600">#{seg.index + 1}</span>
      <div className="min-w-0 flex-1">
        <p dir={dir === "rtl" ? "rtl" : "ltr"} className="line-clamp-2 text-[12px] leading-snug text-zinc-400">
          {seg.text}
        </p>
        {seg.error && (
          <p className={`mt-1 text-[11px] ${seg.status === "error" ? "text-rose-400" : "text-amber-400/80"}`}>{seg.error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-600">{seg.apiText.length}c</span>
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
                ? "border-amber-400/60 bg-amber-400/20 text-amber-300"
                : "border-white/15 text-zinc-500 hover:border-amber-400/50 hover:text-amber-300"
            }`}
          >
            {isPlaying ? Icon.stop("h-2.5 w-2.5") : Icon.play("h-2.5 w-2.5")}
          </button>
        )}
      </div>
    </li>
  );
}
