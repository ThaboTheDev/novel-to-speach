#!/usr/bin/env python3
"""
Combine multiple chapter WAV files into one continuous audiobook,
with a short pause between chapters.

Pure-stdlib for WAV inputs. If you pass MP3s (or want an MP3 result),
install ffmpeg and it will be used instead.

Usage:
  python3 combine_chapters.py chapter_01.wav chapter_02.wav -o audiobook.wav
  python3 combine_chapters.py chapter_01.mp3 chapter_02.mp3 -o audiobook.mp3 --pause 2.0
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from tts_common import Wav, read_wav, silence_bytes, write_wav


def combine_wavs(paths: list[Path], output: Path, pause_s: float) -> None:
    wavs = []
    for p in paths:
        data = p.read_bytes()
        w = read_wav(data)
        wavs.append(w)
        print(f"  {p.name}: {w.seconds / 60:.1f} min @ {w.sample_rate} Hz")

    rate = wavs[0].sample_rate
    if any(w.sample_rate != rate for w in wavs):
        sys.exit("Error: mixed sample rates — convert them first (e.g. with ffmpeg).")

    gap = silence_bytes(int(pause_s * 1000), rate)
    pcm = bytearray()
    for i, w in enumerate(wavs):
        pcm += w.pcm
        if i < len(wavs) - 1:
            pcm += gap
    combined = Wav(rate, bytes(pcm))
    write_wav(combined, str(output))
    print(f"Created: {output} ({combined.seconds / 60:.1f} min)")


def combine_with_ffmpeg(paths: list[Path], output: Path, pause_s: float) -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("Error: ffmpeg is required for MP3 inputs/outputs but was not found on PATH.")
    with tempfile.TemporaryDirectory() as tmp:
        silence = Path(tmp) / "silence.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(pause_s), str(silence)],
            check=True,
        )
        list_file = Path(tmp) / "list.txt"
        with open(list_file, "w") as f:
            for i, p in enumerate(paths):
                f.write(f"file '{p.absolute()}'\n")
                if i < len(paths) - 1:
                    f.write(f"file '{silence.absolute()}'\n")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(list_file)]
        cmd += ["-c", "copy"] if output.suffix.lower() == ".mp3" else []
        cmd.append(str(output))
        subprocess.run(cmd, check=True)
        print(f"Created: {output}")


def main() -> None:
    p = argparse.ArgumentParser(description="Combine chapter audio files into one audiobook")
    p.add_argument("chapters", nargs="+", help="Audio files in story order")
    p.add_argument("-o", "--output", required=True, help="Output file (.wav or .mp3)")
    p.add_argument("--pause", type=float, default=1.5, help="Seconds of silence between chapters")
    args = p.parse_args()

    paths = [Path(c) for c in args.chapters]
    for pth in paths:
        if not pth.exists():
            sys.exit(f"Error: {pth} not found")

    out = Path(args.output)
    all_wav = all(p.suffix.lower() == ".wav" for p in paths) and out.suffix.lower() == ".wav"
    if all_wav:
        combine_wavs(paths, out, args.pause)
    else:
        combine_with_ffmpeg(paths, out, args.pause)


if __name__ == "__main__":
    main()
