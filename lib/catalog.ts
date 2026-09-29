/**
 * Single source of truth for the Groq Orpheus TTS catalog.
 * Shared between the UI and the /api/tts route handler.
 *
 * Source: https://console.groq.com/docs/text-to-speech/orpheus
 * - Max 200 characters per request (hard API limit)
 * - WAV is the only response format
 */

export const MAX_INPUT_CHARS = 200;
export const DEFAULT_MODEL = "canopylabs/orpheus-v1-english";

export interface VoiceInfo {
  id: string;
  label: string;
  gender: "female" | "male";
  /** Unofficial suggestion based on tone — voices are subjective, preview first. */
  blurb: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  language: string;
  /** Writing direction for previews */
  dir: "ltr" | "rtl";
  /** USD per 1M characters (Groq pricing page, Sep 2026) */
  pricePerMillionChars: number;
  supportsDirections: boolean;
  voices: VoiceInfo[];
}

export const MODELS: ModelInfo[] = [
  {
    id: "canopylabs/orpheus-v1-english",
    label: "Orpheus · English",
    language: "English",
    dir: "ltr",
    pricePerMillionChars: 22,
    supportsDirections: true,
    voices: [
      { id: "troy", label: "Troy", gender: "male", blurb: "Clear, steady male — natural fit for narration" },
      { id: "daniel", label: "Daniel", gender: "male", blurb: "Warm male voice, measured delivery" },
      { id: "austin", label: "Austin", gender: "male", blurb: "Bright, energetic male voice" },
      { id: "hannah", label: "Hannah", gender: "female", blurb: "Expressive female — handles directions well" },
      { id: "diana", label: "Diana", gender: "female", blurb: "Calm, composed female voice" },
      { id: "autumn", label: "Autumn", gender: "female", blurb: "Casual, conversational female voice" },
    ],
  },
  {
    id: "canopylabs/orpheus-arabic-saudi",
    label: "Orpheus · العربية (Saudi)",
    language: "Arabic (Saudi)",
    dir: "rtl",
    pricePerMillionChars: 40,
    supportsDirections: false,
    voices: [
      { id: "abdullah", label: "Abdullah · عبدالله", gender: "male", blurb: "Saudi-dialect male voice" },
      { id: "fahad", label: "Fahad · فهد", gender: "male", blurb: "Saudi-dialect male voice" },
      { id: "sultan", label: "Sultan · سلطان", gender: "male", blurb: "Saudi-dialect male voice" },
      { id: "lulwa", label: "Lulwa · لولوة", gender: "female", blurb: "Saudi-dialect female voice" },
      { id: "noura", label: "Noura · نورة", gender: "female", blurb: "Saudi-dialect female voice" },
      { id: "aisha", label: "Aisha · عائشة", gender: "female", blurb: "Saudi-dialect female voice" },
    ],
  },
];

export interface DirectionPreset {
  id: string;
  label: string;
  /** Bracketed direction injected before each request ("" = natural). */
  directive: string;
}

/** Vocal directions — English model only. https://console.groq.com/docs/text-to-speech/orpheus#vocal-directions */
export const DIRECTION_PRESETS: DirectionPreset[] = [
  { id: "none", label: "Natural — no direction", directive: "" },
  { id: "professionally", label: "Professional narration", directive: "[professionally]" },
  { id: "authoritatively", label: "Authoritative", directive: "[authoritatively]" },
  { id: "warm", label: "Warm storyteller", directive: "[warm]" },
  { id: "calm", label: "Calm & soft", directive: "[calmly]" },
  { id: "dramatic", label: "Dramatic performance", directive: "[dramatic]" },
  { id: "cheerful", label: "Cheerful", directive: "[cheerful]" },
  { id: "whisper", label: "Whispered", directive: "[whisper]" },
];

export function getModel(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

export function isValidVoice(modelId: string, voiceId: string): boolean {
  return !!getModel(modelId)?.voices.some((v) => v.id === voiceId);
}

/** Sanitize a custom vocal direction into a safe bracketed tag. */
export function sanitizeDirection(input: string): string {
  const cleaned = input
    .replace(/[\[\]]/g, " ")
    .replace(/[^a-zA-Z -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return cleaned ? `[${cleaned.toLowerCase()}]` : "";
}

export function estimateCostUsd(chars: number, modelId: string): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (chars / 1_000_000) * model.pricePerMillionChars;
}
