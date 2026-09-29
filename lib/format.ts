/** Small formatting helpers. */

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Rough speech-duration estimate: ~15 chars/sec of narration. */
export function estimateSpeechSeconds(chars: number): number {
  return chars / 15;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "< $0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function slugify(name: string, fallback = "audiobook"): string {
  const slug = name
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const SAMPLE_TEXT = `Chapter One

The political system is showing people flames. They are corrupted by nature. The moment you remove all consciousness, a person no longer fears anything, but people think they themselves are God.

The systems we have inherited by nature — these systems are controlled and will be problematic. We can change political parties. They will start right, then move to being a disaster. They will move from god consciousness.

The god consciousness helps people to be in order. It helps a man to know that he is not the author of the universe, but a participant in it. When a society forgets this, everything becomes negotiable, and nothing is sacred.`;
