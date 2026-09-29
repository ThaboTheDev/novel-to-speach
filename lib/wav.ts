/**
 * WAV utilities: lenient RIFF parsing (Groq streams responses with
 * unknown/oversized chunk lengths), PCM concatenation with silence gaps,
 * WAV encoding, and linear resampling for MP3 export.
 */

export interface WavData {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Mono 16-bit PCM samples. Multi-channel input is downmixed. */
  pcm: Int16Array;
}

/** Parse a WAV file. Tolerates 0xFFFFFFFF / bogus stream chunk sizes. */
export function parseWav(buffer: ArrayBuffer): WavData {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) throw new Error("File too small to be a WAV file.");
  if (view.getUint32(0, false) !== 0x52494646 /* RIFF */ || view.getUint32(8, false) !== 0x57415645 /* WAVE */) {
    throw new Error("Not a RIFF/WAVE file.");
  }

  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataStart = -1;
  let dataLen = -1;

  while (offset + 8 <= buffer.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    // Streaming encoders emit 0xFFFFFFFF / 0 sizes — clamp to what actually exists.
    const plausible = size > buffer.byteLength ? buffer.byteLength - bodyStart : size;

    if (id === 0x666d7420 /* fmt  */) {
      fmt = {
        audioFormat: view.getUint16(bodyStart, true),
        channels: view.getUint16(bodyStart + 2, true),
        sampleRate: view.getUint32(bodyStart + 4, true),
        bitsPerSample: view.getUint16(bodyStart + 14, true),
      };
    } else if (id === 0x64617461 /* data */) {
      dataStart = bodyStart;
      dataLen = plausible;
      break; // data is the last chunk we care about
    }
    offset = bodyStart + plausible + (plausible % 2); // chunks are word-aligned
  }

  if (!fmt) throw new Error("WAV fmt chunk not found.");
  if (dataStart < 0 || dataLen <= 0) throw new Error("WAV data chunk not found.");
  if (fmt.audioFormat !== 1) throw new Error(`Unsupported WAV format ${fmt.audioFormat} (only uncompressed PCM).`);
  if (fmt.bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${fmt.bitsPerSample} (only 16-bit PCM).`);

  const frameBytes = (fmt.bitsPerSample / 8) * fmt.channels;
  const frames = Math.floor(dataLen / frameBytes);
  const mono = new Int16Array(frames);

  if (fmt.channels === 1) {
    const src = new Int16Array(buffer, dataStart, frames);
    mono.set(src);
  } else {
    // Downmix to mono by averaging channels.
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      for (let c = 0; c < fmt.channels; c++) {
        sum += view.getInt16(dataStart + f * frameBytes + c * 2, true);
      }
      mono[f] = Math.max(-32768, Math.min(32767, Math.round(sum / fmt.channels)));
    }
  }

  return { sampleRate: fmt.sampleRate, channels: 1, bitsPerSample: 16, pcm: mono };
}

/** Encode mono 16-bit PCM as a standard 44-byte-header WAV blob. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Blob {
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
  v.setUint32(16, 16, true); // fmt size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits
  writeStr(36, "data");
  v.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: "audio/wav" });
}

/** Create a mono 16-bit PCM silence of `ms` milliseconds. */
export function silence(ms: number, sampleRate: number): Int16Array {
  return new Int16Array(Math.max(0, Math.round((ms / 1000) * sampleRate)));
}

/**
 * Concatenate PCM segments, inserting a pause after segments flagged as
 * paragraph ends. All segments must share the sample rate (use resampleLinear first if not).
 */
export function concatPcm(
  parts: { pcm: Int16Array; paragraphPause?: boolean }[],
  sampleRate: number,
  paragraphPauseMs: number,
): Int16Array {
  const pauseSamples = Math.round((paragraphPauseMs / 1000) * sampleRate);
  const total =
    parts.reduce((n, p) => n + p.pcm.length, 0) + pauseSamples * parts.filter((p) => p.paragraphPause).length;
  const out = new Int16Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part.pcm, o);
    o += part.pcm.length;
    if (part.paragraphPause && pauseSamples > 0) o += pauseSamples; // leave zeros
  }
  return out;
}

/** Linear-interpolation resampler — good enough for speech at these rates. */
export function resampleLinear(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return pcm;
  const ratio = toRate / fromRate;
  const outLen = Math.round(pcm.length * ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const t = src - i0;
    out[i] = Math.round(pcm[i0] * (1 - t) + pcm[i1] * t);
  }
  return out;
}

/** Total duration in seconds. */
export function pcmDuration(pcm: Int16Array, sampleRate: number): number {
  return pcm.length / sampleRate;
}
