/**
 * Document → manuscript text extraction.
 *
 * Everything runs in the browser: files are never uploaded to a server.
 * Detects format by extension first, then by magic bytes (.pdf %PDF,
 * .docx/.epub ZIP, with EPUB identified by its mimetype entry).
 */

import { normalizeText, stripMarkup, stripRtf } from "./text-extract";

export const SUPPORTED_EXTENSIONS = ["txt", "md", "markdown", "html", "htm", "rtf", "pdf", "docx", "epub"] as const;

export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",") + ",text/plain,text/markdown,text/html,application/rtf,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const MAX_DOC_BYTES = 60 * 1024 * 1024; // local extraction — generous cap

export interface ExtractedDocument {
  text: string;
  format: string;
}

export type ExtractProgress = (message: string) => void;

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

async function headBytes(file: File, n: number): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

export async function extractDocument(file: File, onProgress?: ExtractProgress): Promise<ExtractedDocument> {
  if (file.size > MAX_DOC_BYTES) {
    throw new Error("That file is over 60 MB. Split it into smaller parts first.");
  }

  const ext = extOf(file.name);
  const head = await headBytes(file, 8);

  // ---------- Binary containers ----------
  if (ext === "pdf" || (isPdf(head) && !ext)) {
    onProgress?.("Reading PDF…");
    const { extractPdf } = await import("./extract-pdf");
    const buffer = await file.arrayBuffer();
    const text = await extractPdf(buffer, ({ page, total }) =>
      onProgress?.(`Extracting PDF — page ${page} of ${total}…`),
    );
    return finish(text, "PDF", file.name);
  }

  if (ext === "docx" || ext === "epub" || (isZip(head) && !ext)) {
    const buffer = await file.arrayBuffer();
    const { zipLooksLikeEpub } = await import("./extract-epub");
    const epub = ext === "epub" || (ext !== "docx" && zipLooksLikeEpub(buffer));
    if (epub) {
      onProgress?.("Extracting EPUB chapters…");
      const { extractEpub } = await import("./extract-epub");
      return finish(await extractEpub(buffer), "EPUB", file.name);
    }
    onProgress?.("Extracting DOCX text…");
    const { extractDocx } = await import("./extract-docx");
    return finish(await extractDocx(buffer), "DOCX", file.name);
  }

  // ---------- Text formats ----------
  if (["txt", "md", "markdown", "html", "htm", "rtf"].includes(ext) || file.type.startsWith("text/") || !ext) {
    onProgress?.("Reading text…");
    const raw = await file.text();
    if (ext === "html" || ext === "htm" || /^\s*<!doctype html|^\s*<html/i.test(raw.slice(0, 512))) {
      return finish(normalizeText(stripMarkup(raw)), "HTML", file.name);
    }
    if (ext === "rtf" || raw.startsWith("{\\rtf")) {
      return finish(normalizeText(stripRtf(raw)), "RTF", file.name);
    }
    return finish(normalizeText(raw), ext.toUpperCase() || "TXT", file.name);
  }

  throw new Error(
    `Unsupported file type ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.map((e) => "." + e).join(", ")}.`,
  );
}

const MAX_EXTRACTED_CHARS = 3_000_000;

function finish(text: string, format: string, name: string): ExtractedDocument {
  if (!text || text.trim().length === 0) {
    throw new Error(`No readable text found in ${name}.`);
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS);
  }
  return { text, format };
}
