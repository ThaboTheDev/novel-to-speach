#!/usr/bin/env python3
"""
Combine multiple MP3 chapter files into one continuous audiobook.
Adds a short silence (1.5 seconds) between chapters.
Usage:
  python3 combine_chapters.py --chapters ch01.mp3 ch02.mp3 ch03.mp3 --output audiobook.mp3
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

def create_silence(duration: float, sample_rate: int = 24000, output: str = "silence.mp3"):
    """Generate a short silent MP3."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"anullsrc=r={sample_rate}:cl=mono",
        "-t", str(duration),
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        output
    ]
    subprocess.run(cmd, check=True, capture_output=True)

def combine(chapters: list, output: str, silence_duration: float = 1.5):
    if not chapters:
        raise ValueError("No chapters provided")

    with tempfile.TemporaryDirectory() as tmpdir:
        silence_path = Path(tmpdir) / "silence.mp3"
        create_silence(silence_duration, output=str(silence_path))

        # Build concat list
        list_file = Path(tmpdir) / "list.txt"
        with open(list_file, "w") as f:
            for i, ch in enumerate(chapters):
                f.write(f"file '{Path(ch).absolute()}'\n")
                if i < len(chapters) - 1:
                    f.write(f"file '{silence_path.absolute()}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            output
        ]
        print("Combining chapters...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stderr)
            raise RuntimeError("ffmpeg failed")
        print(f"Created: {output}")

def main():
    parser = argparse.ArgumentParser(description="Combine MP3 chapters into one audiobook")
    parser.add_argument("--chapters", "-c", nargs="+", required=True, help="List of MP3 files in order")
    parser.add_argument("--output", "-o", default="audiobook.mp3", help="Output file")
    parser.add_argument("--silence", type=float, default=1.5, help="Seconds of silence between chapters")
    args = parser.parse_args()

    combine(args.chapters, args.output, args.silence)

if __name__ == "__main__":
    main()
