/**
 * DOCX text extraction via mammoth (dynamic import — only loaded when needed).
 * Runs in the browser via mammoth's browser field mappings.
 */

import { normalizeText } from "./text-extract";

export async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  // Browser build (jszip) wants arrayBuffer; Node build wants a Buffer.
  const input =
    typeof window === "undefined"
      ? { buffer: Buffer.from(data) }
      : { arrayBuffer: data };
  const result = await mammoth.extractRawText(input as Parameters<typeof mammoth.extractRawText>[0]);
  const text = normalizeText(result.value);
  if (text.length < 3) {
    throw new Error("No readable text found in this DOCX file.");
  }
  return text;
}
