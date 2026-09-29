/**
 * MP3 export via lamejs (bundled npm package, runs fully in the browser).
 * Encoding happens in slices with yields so the UI stays responsive.
 */

import { resampleLinear } from "./wav";

export interface Mp3Options {
  kbps?: number;
  onProgress?: (fraction: number) => void;
}

/**
 * Encode mono 16-bit PCM to an MP3 blob.
 * Input is resampled to 44.1 kHz (lamejs' well-supported rate) if needed.
 */
export async function encodeMp3(pcm: Int16Array, sampleRate: number, opts: Mp3Options = {}): Promise<Blob> {
  const kbps = opts.kbps ?? 96;
  const { Mp3Encoder } = await import("lamejs").then((m) => m.default ?? m);

  const data = sampleRate === 44100 ? pcm : resampleLinear(pcm, sampleRate, 44100);
  const encoder = new Mp3Encoder(1, 44100, kbps);

  const blockSize = 1152 * 64; // encoder frame multiple; ~1.5s of audio per block
  const chunks: BlobPart[] = [];

  for (let i = 0; i < data.length; i += blockSize) {
    const slice = data.subarray(i, Math.min(i + blockSize, data.length));
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded).buffer as ArrayBuffer);
    opts.onProgress?.(Math.min(1, (i + slice.length) / data.length));
    // Yield to keep the page responsive between blocks.
    await new Promise((r) => setTimeout(r, 0));
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail).buffer as ArrayBuffer);
  opts.onProgress?.(1);

  return new Blob(chunks, { type: "audio/mpeg" });
}
