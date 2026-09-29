#!/usr/bin/env python3
"""
Generate an audiobook chapter from a text file using Groq's Orpheus TTS.

Orpheus accepts max 200 characters per request, so the text is split into
sentence-aware segments, synthesized concurrently (with retry/backoff), and
stitched into one WAV.

Usage:
  python3 generate_chapter.py chapter_01.txt -o chapter_01.wav --voice troy
  python3 generate_chapter.py book.txt -o book.wav --direction "professionally" --concurrency 4

Requires: pip install -r requirements.txt  and  GROQ_API_KEY in the environment or a .env file.
Get a free key at https://console.groq.com/keys
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Allow running both as a script and from the backend folder.
sys.path.insert(0, str(Path(__file__).parent))

from tts_common import (
    MODELS,
    Wav,
    chunk_text,
    read_wav,
    sanitize_direction,
    silence_bytes,
    write_wav,
)

MAX_ATTEMPTS = 4


def load_client():
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass  # dotenv is optional — the key can come from the environment

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        sys.exit(
            "Error: GROQ_API_KEY is not set.\n"
            "  1. Get a free key at https://console.groq.com/keys\n"
            "  2. `export GROQ_API_KEY=...` or put it in a .env file next to this script."
        )
    from groq import Groq

    return Groq(api_key=api_key)


def synthesize_segment(client, model: str, voice: str, text: str) -> Wav:
    """Call the API for one segment with retry/backoff. Raises on persistent failure."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = client.audio.speech.create(model=model, voice=voice, input=text, response_format="wav")
            return read_wav(resp.read() if hasattr(resp, "read") else resp.content)
        except Exception as err:  # noqa: BLE001 — surface any SDK/HTTP error uniformly
            status = getattr(err, "status_code", None)
            if status == 400:  # not worth retrying (bad voice/model/text)
                raise RuntimeError(f"API rejected the request: {err}") from err
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(f"Failed after {MAX_ATTEMPTS} attempts: {err}") from err
            wait = min(10.0, 0.7 * 2**attempt + random.random() / 2)
            print(f"    retry {attempt}/{MAX_ATTEMPTS - 1} in {wait:.1f}s ({err})")
            time.sleep(wait)
    raise AssertionError("unreachable")


def synthesize_text(client, text: str, model: str, voice: str, direction: str,
                    concurrency: int, paragraph_pause_ms: int) -> Wav:
    segments = chunk_text(text, direction=direction)
    if not segments:
        raise ValueError("No text to synthesize.")

    print(f"  {len(segments)} segments · {sum(len(s.api_text) for s in segments):,} chars sent to API · {concurrency} lanes")

    results: list[Wav | None] = [None] * len(segments)
    done = 0

    def work(seg):
        nonlocal done
        wav = synthesize_segment(client, model, voice, seg.api_text)
        results[seg.index] = wav
        done += 1
        pct = 100 * done / len(segments)
        print(f"\r  {done}/{len(segments)} ({pct:5.1f}%)", end="", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, min(8, concurrency))) as pool:
        list(pool.map(work, segments))
    print()

    sample_rate = results[0].sample_rate
    pcm = bytearray()
    for seg, wav in zip(segments, results):
        assert wav is not None
        pcm += wav.pcm
        if seg.end_of_paragraph:
            pcm += silence_bytes(paragraph_pause_ms, sample_rate)
    return Wav(sample_rate, bytes(pcm))


def maybe_convert_mp3(wav_path: Path, mp3_path: Path) -> bool:
    import shutil
    import subprocess

    if not shutil.which("ffmpeg"):
        print("  note: ffmpeg not found — skipping MP3 conversion (WAV is ready).")
        return False
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
         "-codec:a", "libmp3lame", "-b:a", "96k", str(mp3_path)],
        check=True,
    )
    print(f"  MP3: {mp3_path}")
    return True


def main() -> None:
    p = argparse.ArgumentParser(description="Generate an audiobook chapter with Groq Orpheus TTS")
    p.add_argument("text_file", nargs="?", help="Input .txt file (chapter or full book)")
    p.add_argument("-o", "--output", default=None, help="Output WAV path (default: <input>.wav)")
    p.add_argument("--model", default="canopylabs/orpheus-v1-english", choices=sorted(MODELS), help="TTS model")
    p.add_argument("--voice", default="troy", help="Voice ID (see voices.txt or --list-voices)")
    p.add_argument("--direction", default="", help='Vocal direction, e.g. "professionally" (English model only)')
    p.add_argument("--concurrency", type=int, default=3, help="Parallel requests (lower if rate-limited)")
    p.add_argument("--paragraph-pause-ms", type=int, default=300, help="Silence inserted at paragraph breaks")
    p.add_argument("--mp3", action="store_true", help="Also produce an .mp3 (requires ffmpeg)")
    p.add_argument("--list-voices", action="store_true", help="Print available voices and exit")
    args = p.parse_args()

    if args.list_voices:
        for mid, m in MODELS.items():
            print(f"{mid}  ({m['label']})")
            print(f"  voices: {', '.join(m['voices'])}")
        return

    info = MODELS[args.model]
    if args.voice not in info["voices"]:
        sys.exit(f"Error: voice '{args.voice}' is not available for {args.model}.\n"
                 f"  Available: {', '.join(info['voices'])}")

    direction = sanitize_direction(args.direction)
    if direction and not info["directions"]:
        print("  note: vocal directions are not supported by this model — ignoring.")

    if not args.text_file:
        p.error("the following arguments are required: text_file")

    src = Path(args.text_file)
    if not src.exists():
        sys.exit(f"Error: {src} not found")
    text = src.read_text(encoding="utf-8").strip()
    if not text:
        sys.exit("Error: input file is empty.")

    out = Path(args.output) if args.output else src.with_suffix(".wav")

    print(f"Input  : {src} ({len(text):,} chars)")
    print(f"Model  : {args.model} · voice '{args.voice}'" + (f" · {direction}" if direction else ""))
    print(f"Output : {out}")

    client = load_client()
    started = time.time()
    wav = synthesize_text(client, text, args.model, args.voice,
                          direction if info["directions"] else "",
                          args.concurrency, args.paragraph_pause_ms)
    write_wav(wav, str(out))

    print(f"Done in {time.time() - started:.1f}s → {out} ({wav.seconds / 60:.1f} min of audio)")

    if args.mp3:
        maybe_convert_mp3(out, out.with_suffix(".mp3"))


if __name__ == "__main__":
    main()
