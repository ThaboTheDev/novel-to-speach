"use client";

import { useCallback, useRef, useState } from "react";
import { Badge, Card, Icon, SectionHeader, Spinner } from "./ui";
import { DIRECTION_PRESETS, MODELS, type ModelInfo } from "@/lib/catalog";
import { synthesizeSpeech } from "@/lib/api";
import { useAudioPlayer } from "@/lib/use-audio-player";

export interface NarrationSettings {
  modelId: string;
  voiceId: string;
  directionId: string;
  customDirection: string;
  concurrency: number;
  maxChars: number;
  paragraphPauseMs: number;
}

interface Props {
  settings: NarrationSettings;
  onChange: (patch: Partial<NarrationSettings>, opts?: { invalidateAudio?: boolean }) => void;
  disabled: boolean;
}

const PREVIEW_TEXT: Record<string, string> = {
  "canopylabs/orpheus-v1-english": "Every great story deserves a voice. Let me read yours, one chapter at a time.",
  "canopylabs/orpheus-arabic-saudi": "مرحبا بكم. كل قصة عظيمة تستحق صوتا جميلا يرويها، فصلًا بعد فصل.",
};

export function NarrationPanel({ settings, onChange, disabled }: Props) {
  const model: ModelInfo = MODELS.find((m) => m.id === settings.modelId) ?? MODELS[0];
  const { playingId, play, stop } = useAudioPlayer();
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const cacheRef = useRef(new Map<string, string>());

  const preview = useCallback(
    async (voiceId: string) => {
      const cacheKey = `${model.id}:${voiceId}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        play(cacheKey, cached);
        return;
      }
      setPreviewError(null);
      setLoadingVoice(voiceId);
      try {
        const { audio } = await synthesizeSpeech({
          text: PREVIEW_TEXT[model.id] ?? PREVIEW_TEXT[MODELS[0].id],
          voice: voiceId,
          model: model.id,
        });
        const url = URL.createObjectURL(new Blob([audio], { type: "audio/wav" }));
        cacheRef.current.set(cacheKey, url);
        play(cacheKey, url);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Preview failed.");
      } finally {
        setLoadingVoice(null);
      }
    },
    [model.id, play],
  );

  const selectModel = (modelId: string) => {
    if (disabled || modelId === settings.modelId) return;
    stop();
    const next = MODELS.find((m) => m.id === modelId)!;
    onChange({ modelId: next.id, voiceId: next.voices[0].id });
  };

  return (
    <Card className="overflow-hidden">
      <SectionHeader
        step="02"
        title="Narrator & performance"
        hint="Pick a model and voice — press play to hear a live sample."
      />

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {/* Model tabs */}
        <div className="flex gap-2">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectModel(m.id)}
              disabled={disabled}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm transition disabled:opacity-50 ${
                m.id === model.id
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Voice grid */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {model.voices.map((voice) => {
            const selected = voice.id === settings.voiceId;
            const isLoading = loadingVoice === voice.id;
            const isPlaying = playingId === `${model.id}:${voice.id}`;
            return (
              <div
                key={voice.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && onChange({ voiceId: voice.id })}
                onKeyDown={(e) => e.key === "Enter" && !disabled && onChange({ voiceId: voice.id })}
                className={`group relative rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-amber-400/50 bg-amber-400/[0.08]"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/25"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-display text-base font-semibold ${selected ? "text-amber-200" : "text-zinc-200"}`}>
                      {voice.label}
                    </span>
                    <Badge tone={voice.gender === "male" ? "violet" : "amber"}>
                      {voice.gender === "male" ? "M" : "F"}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    aria-label={`Preview ${voice.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(voice.id);
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                      isPlaying
                        ? "border-amber-400/60 bg-amber-400/20 text-amber-300"
                        : "border-white/15 text-zinc-400 hover:border-amber-400/50 hover:text-amber-300"
                    }`}
                  >
                    {isLoading ? <Spinner className="h-3.5 w-3.5" /> : isPlaying ? Icon.stop("h-3 w-3") : Icon.play("h-3 w-3")}
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{voice.blurb}</p>
              </div>
            );
          })}
        </div>
        {previewError && <p className="text-xs text-rose-400">{previewError}</p>}

        {/* Vocal direction — English model only */}
        {model.supportsDirections ? (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400">
              Delivery style <span className="text-zinc-600">(Orpheus vocal directions)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTION_PRESETS.map((d) => {
                const active = d.id === settings.directionId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ directionId: d.id }, { invalidateAudio: true })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-50 ${
                      active
                        ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                        : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <input
              value={settings.customDirection}
              disabled={disabled || settings.directionId !== "none"}
              onChange={(e) => onChange({ customDirection: e.target.value }, { invalidateAudio: true })}
              placeholder='Custom direction, e.g. "gravelly whisper" (select "Natural" first to enable)'
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-amber-400/40 focus:outline-none disabled:opacity-40"
            />
            <p className="mt-1.5 text-[11px] text-zinc-600">Styles are applied to every request — changing them resets generated audio.</p>
          </div>
        ) : (
          <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">
            Vocal directions are not supported by the Arabic model — it speaks naturally.
          </p>
        )}

        {/* Advanced */}
        <div className="border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-medium tracking-wide text-zinc-400 transition hover:text-zinc-200"
          >
            Advanced
            <span className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}>{Icon.chevron()}</span>
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <SliderRow
                label="Parallel requests"
                value={settings.concurrency}
                min={1}
                max={8}
                step={1}
                display={`${settings.concurrency}×`}
                hint="Lower this if you hit Groq rate limits."
                onChange={(v) => onChange({ concurrency: v })}
              />
              <SliderRow
                label="Characters per request"
                value={settings.maxChars}
                min={100}
                max={200}
                step={10}
                display={`${settings.maxChars}`}
                hint="API hard limit: 200. Shorter = snappier, more requests."
                onChange={(v) => onChange({ maxChars: v }, { invalidateAudio: true })}
              />
              <SliderRow
                label="Paragraph pause"
                value={settings.paragraphPauseMs}
                min={0}
                max={1000}
                step={50}
                display={`${settings.paragraphPauseMs} ms`}
                hint="Silence inserted at blank-line breaks."
                onChange={(v) => onChange({ paragraphPauseMs: v })}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-amber-300">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
