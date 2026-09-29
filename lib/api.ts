/**
 * Client for our own /api/tts route (which proxies Groq server-side so the
 * API key never ships to the browser).
 */

export class SynthesizeError extends Error {
  status: number;
  retryAfterMs?: number;
  code: "rate_limited" | "server" | "network" | "aborted" | "bad_request";

  constructor(message: string, status: number, opts: { retryAfterMs?: number } = {}) {
    super(message);
    this.name = "SynthesizeError";
    this.status = status;
    this.retryAfterMs = opts.retryAfterMs;
    this.code = status === 429 ? "rate_limited" : status >= 500 ? "server" : status >= 400 ? "bad_request" : "network";
  }
}

export interface SynthesizeResult {
  audio: ArrayBuffer;
  /** True when the dev-server responded with synthetic demo audio (no API key configured). */
  demo: boolean;
}

export async function synthesizeSpeech(
  params: { text: string; voice: string; model: string },
  signal?: AbortSignal,
): Promise<SynthesizeResult> {
  let res: Response;
  try {
    res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new SynthesizeError("Network error — could not reach the server.", 0);
  }

  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* non-JSON error body */
    }
    const retryAfter = res.headers.get("retry-after");
    throw new SynthesizeError(message, res.status, {
      retryAfterMs: retryAfter ? Math.min(60_000, Number(retryAfter) * 1000) : undefined,
    });
  }

  const demo = res.headers.get("x-demo-audio") === "true";
  const audio = await res.arrayBuffer();
  if (audio.byteLength < 100) throw new SynthesizeError("The server returned an empty audio response.", 502);
  return { audio, demo };
}

/** Wav data URL helper for previews. */
export function bufferToObjectUrl(buffer: ArrayBuffer | Blob): string {
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}
