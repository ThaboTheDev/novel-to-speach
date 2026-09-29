/**
 * Sentence-aware text chunker.
 *
 * Groq's Orpheus TTS accepts a hard maximum of 200 characters per request,
 * so a novel must be split into small segments that are synthesized one by
 * one and stitched back together. The chunker prefers sentence boundaries,
 * then clause boundaries, then word boundaries, and finally hard-cuts.
 * Segments never span paragraph breaks, so paragraph pacing survives.
 */

export interface TextSegment {
  index: number;
  /** Display text of the segment. */
  text: string;
  /** Exact text sent to the API (vocal-direction prefix included). */
  apiText: string;
  /** True when a paragraph break follows this segment (a pause is inserted when stitching). */
  endOfParagraph: boolean;
}

/** Split a paragraph into sentence-like pieces, keeping terminal punctuation. */
export function splitSentences(paragraph: string): string[] {
  const re = /[.!?…؟]["'”’)\]]*(?=\s|$)/g;
  const parts: string[] = [];
  let rest = paragraph.trim();

  while (rest.length > 0) {
    re.lastIndex = 0;
    const m = re.exec(rest);
    if (m === null) {
      parts.push(rest.trim());
      break;
    }
    const cut = m.index + m[0].length;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return parts.filter((p) => p.length > 0);
}

/** Split text that exceeds `max` at clause boundaries, then word boundaries, then a hard cut. */
function forceSplit(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;

  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = -1;

    // 1) clause boundary (incl. Arabic comma), keeping the punctuation on the left piece
    const clause = Math.max(
      window.lastIndexOf(", "),
      window.lastIndexOf("; "),
      window.lastIndexOf(": "),
      window.lastIndexOf(" — "),
      window.lastIndexOf("، "),
    );
    if (clause > max * 0.4) cut = clause + 1;

    // 2) word boundary
    if (cut === -1) {
      const space = window.lastIndexOf(" ");
      if (space > max * 0.3) cut = space + 1;
    }

    // 3) hard cut
    if (cut === -1) cut = max;

    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out.filter((p) => p.length > 0);
}

export interface ChunkOptions {
  /** Max chars per request incl. direction prefix. Hard API max is 200. */
  maxChars?: number;
  /** Bracketed vocal direction prepended to every request (English model). */
  direction?: string;
}

/**
 * Split a manuscript into TTS-ready segments.
 * Guarantees every `apiText` is <= maxChars.
 */
export function chunkText(input: string, opts: ChunkOptions = {}): TextSegment[] {
  const max = Math.max(40, Math.min(opts.maxChars ?? 200, 200));
  const direction = (opts.direction ?? "").trim();
  const budget = max - (direction ? direction.length + 1 : 0);
  if (budget < 24) {
    throw new Error("The vocal direction leaves too little room for text. Shorten it.");
  }

  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim().replace(/\n/g, " "))
    .filter(Boolean);

  const segments: TextSegment[] = [];
  let current = "";

  const flush = (endOfParagraph: boolean) => {
    const text = current.trim();
    if (text.length === 0) return;
    segments.push({
      index: segments.length,
      text,
      apiText: direction ? `${direction} ${text}` : text,
      endOfParagraph,
    });
    current = "";
  };

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const pieces: string[] = [];
    for (const sentence of splitSentences(paragraphs[pi])) {
      if (sentence.length > budget) pieces.push(...forceSplit(sentence, budget));
      else pieces.push(sentence);
    }

    for (const piece of pieces) {
      if (current.length === 0) {
        current = piece;
      } else if (current.length + 1 + piece.length <= budget) {
        current += " " + piece;
      } else {
        flush(false);
        current = piece;
      }
    }
    // Paragraph finished: close the current segment so no segment spans a paragraph break.
    flush(pi < paragraphs.length - 1);
  }
  flush(false);

  return segments;
}
