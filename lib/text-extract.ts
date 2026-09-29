/**
 * Shared text helpers for document extraction.
 */

/** Decode the most common HTML entities (used when stripping markup). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Strip markup to readable text (blocks → newlines, scripts/styles dropped). */
export function stripMarkup(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr|table|blockquote|pre|br|hr)[^>]*>/gi, "\n")
      .replace(/<(br|hr)[^>]*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );
}

/** Very basic RTF → text (covers typical simple exports; documented as best-effort). */
export function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\par[d]?|\\line/g, "\n")
    .replace(/\\tab/g, " ")
    .replace(/\\u(-?\d+)\??/g, (_, n) => {
      const code = Number(n);
      return String.fromCodePoint(code < 0 ? code + 65536 : code);
    })
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, " ");
}

/** Normalize any extracted text for the manuscript editor. */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
