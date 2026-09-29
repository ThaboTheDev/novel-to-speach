/**
 * PDF text extraction using PDF.js, fully client-side.
 * pdfjs-dist is imported dynamically so its ~1 MB bundle only loads when needed.
 */

import { normalizeText } from "./text-extract";

// pdfjs-dist v6 uses very recent Promise APIs; provide fallbacks for older runtimes.
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
if (typeof (Promise as { try?: unknown }).try !== "function") {
  (Promise as { try: unknown }).try = function ptry<T, A extends unknown[]>(
    fn: (...args: A) => T | PromiseLike<T>,
    ...args: A
  ): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn(...args)));
  };
}

export type PdfProgress = (info: { page: number; total: number }) => void;

export async function extractPdf(data: ArrayBuffer, onProgress?: PdfProgress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Browser: point at the bundled worker asset (built by Next/Turbopack).
  // Node: pdf.js auto-falls back to a fake worker — leave its default alone.
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc ||= new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false, // never run JS embedded in PDFs
  }).promise;

  const pages: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      // Rebuild lines: pdf.js emits items in reading order with hasEOL markers.
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        } else if (item.str.length > 0 && !/[\s-]$/.test(item.str)) {
          line += " "; // pdf.js items often omit spaces between words
        }
      }
      if (line.trim()) lines.push(line);

      const pageText = lines.map((l) => l.trim()).filter(Boolean).join("\n");
      if (pageText) pages.push(pageText);
      onProgress?.({ page: p, total: doc.numPages });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  const text = normalizeText(pages.join("\n\n"));
  if (text.length < 20) {
    throw new Error(
      "This PDF yielded almost no text — it's likely a scanned image. Run it through OCR first, then upload again.",
    );
  }
  return text;
}
