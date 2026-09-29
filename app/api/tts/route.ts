import { NextRequest } from "next/server";
import { getModel, isValidVoice, MAX_INPUT_CHARS } from "@/lib/catalog";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";
const UPSTREAM_TIMEOUT_MS = 30_000;

function jsonError(status: number, error: string, headers?: Record<string, string>) {
  return Response.json({ error }, { status, headers });
}

export async function POST(req: NextRequest) {
  // ---- Parse & validate body -------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const { text, voice, model } = (body ?? {}) as { text?: unknown; voice?: unknown; model?: unknown };

  if (typeof text !== "string" || text.trim().length === 0) {
    return jsonError(400, "Field 'text' is required.");
  }
  if (text.length > MAX_INPUT_CHARS) {
    return jsonError(
      400,
      `Orpheus accepts at most ${MAX_INPUT_CHARS} characters per request (got ${text.length}). Split the text into smaller segments — the web UI does this automatically.`,
    );
  }
  if (typeof model !== "string" || !getModel(model)) {
    return jsonError(400, "Unknown 'model'. See /README for supported model IDs.");
  }
  if (typeof voice !== "string" || !isValidVoice(model, voice)) {
    return jsonError(400, `Voice '${String(voice)}' is not available for model '${model}'.`);
  }

  // ---- Rate limit (per IP, best-effort) --------------------------------------
  const limit = Number(process.env.RATE_LIMIT_RPM ?? 240);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const rate = checkRateLimit(`tts:${ip}`, Number.isFinite(limit) ? limit : 240);
  if (!rate.allowed) {
    return jsonError(429, "Too many requests — slow down a little.", {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  // ---- API key / demo mode -----------------------------------------------------
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      // Local demo mode: synthetic placeholder audio so the UI can be tried
      // end-to-end before a key is configured. Clearly flagged via header.
      return demoAudioResponse(text);
    }
    return jsonError(
      503,
      "Speech generation is not configured: set the GROQ_API_KEY environment variable (Project Settings → Environment Variables on Vercel).",
    );
  }

  // ---- Call Groq -----------------------------------------------------------------
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(GROQ_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: text, voice, response_format: "wav" }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return jsonError(timedOut ? 504 : 502, timedOut ? "Groq took too long to respond." : "Could not reach Groq.");
  }

  if (!upstream.ok || !upstream.body) {
    let detail = `Groq error (HTTP ${upstream.status}).`;
    try {
      const payload = await upstream.json();
      detail = payload?.error?.message ?? detail;
    } catch {
      /* keep generic message */
    }
    const headers: Record<string, string> = {};
    const retryAfter = upstream.headers.get("retry-after");
    if (upstream.status === 429 && retryAfter) headers["Retry-After"] = retryAfter;
    return jsonError(upstream.status === 429 ? 429 : 502, detail, headers);
  }

  // ---- Stream audio back ---------------------------------------------------------
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Generate pleasant synthetic placeholder audio for local development,
 * deterministic per input text. 24 kHz 16-bit mono WAV — same shape as Groq's output.
 */
function demoAudioResponse(text: string): Response {
  const sampleRate = 24000;
  const seconds = Math.min(2.2, 0.6 + text.length * 0.01);
  const n = Math.round(seconds * sampleRate);
  const pcm = new Int16Array(n);

  const scale = Array.from(text.slice(0, 24)).reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 196 + (scale % 7) * 22; // ~G3 up a few steps
  const notes = [0, 4, 7, 12, 7, 4];

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const note = notes[Math.floor(t * 5) % notes.length];
    const f = base * Math.pow(2, note / 12);
    const env = Math.min(1, 10 * t) * Math.exp(-2.5 * ((t * 5) % 1));
    pcm[i] = Math.round(Math.sin(2 * Math.PI * f * t) * 12000 * env * 0.8);
  }

  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(pcm);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
      "X-Demo-Audio": "true",
    },
  });
}
