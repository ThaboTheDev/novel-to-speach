"use client";

import { useCallback, useRef, useState } from "react";
import { Card, Icon, SectionHeader, Spinner } from "./ui";
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
        title="Narrator"
        hint="Choose a model and voice — press play to hear a live sample."
      />

      <div className="space-y-5 px-5 py-5">
        {/* Model selector */}
        <div className="flex rounded-lg border border-border bg-panel-2 p-1">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectModel(m.id)}
              disabled={disabled}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                m.id === model.id
                  ? "bg-panel font-medium text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-text-2 hover:text-text"
              }`}
            >
              {m.id === "canopylabs/orpheus-v1-english" ? "English" : "Arabic (Saudi)"}
            </button>
          ))}
        </div>

        {/* Voice grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                className={`relative rounded-lg border p-3 text-left transition ${
                  selected
                    ? "border-accent bg-panel-2"
                    : "border-border bg-panel hover:border-border-2"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${selected ? "text-text" : "text-text-2"}`}>
                      {voice.label}
                    </span>
                    <span className="rounded border border-border bg-panel px-1 py-px font-mono text-[10px] text-text-3">
                      {voice.gender === "male" ? "M" : "F"}
                    </span>
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
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border text-text-2 hover:border-border-2 hover:text-text"
                    }`}
                  >
                    {isLoading ? <Spinner className="h-3.5 w-3.5" /> : isPlaying ? Icon.stop("h-3 w-3") : Icon.play("h-3 w-3")}
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-text-3">{voice.blurb}</p>
              </div>
            );
          })}
        </div>
        {previewError && <p className="text-xs text-danger">{previewError}</p>}

        {/* Vocal direction — English model only */}
        {model.supportsDirections ? (
          <div>
            <p className="mb-2 text-xs font-medium text-text-2">
              Delivery style <span className="font-normal text-text-3">(vocal directions)</span>
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
                    className={`rounded-md border px-2.5 py-1.5 text-xs transition disabled:opacity-50 ${
                      active
                        ? "border-accent bg-panel-2 font-medium text-text"
                        : "border-border text-text-2 hover:border-border-2 hover:text-text"
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
              placeholder='Custom direction, e.g. "gravelly whisper" (select "Natural" first)'
              className="mt-2 w-full rounded-lg border border-border bg-panel px-3 py-2 text-xs text-text placeholder:text-text-3 focus:border-border-2 focus:outline-none disabled:opacity-40"
            />
            <p className="mt-1.5 text-[11px] text-text-3">Styles apply to every request — changing them resets generated audio.</p>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-[11px] text-text-3">
            Vocal directions are not supported by the Arabic model — it speaks naturally.
          </p>
        )}

        {/* Advanced */}
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-medium text-text-2 transition hover:text-text"
          >
            Advanced settings
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
                hint="API hard limit: 200. Shorter segments = more requests."
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
        <span className="text-text-2">{label}</span>
        <span className="font-mono text-text">{display}</span>
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
      {hint && <p className="mt-1 text-[11px] text-text-3">{hint}</p>}
    </div>
  );
}
