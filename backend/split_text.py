#!/usr/bin/env python3
"""
Split a long book into chapter files of a manageable size.

Note: the 200-character request limit of the TTS API is handled automatically
inside generate_chapter.py — this tool is only for organizing a long book
into chapters (e.g. to generate them in separate runs and track progress).

Usage:
  python3 split_text.py book.txt --outdir chapters --max-chars 60000
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def split_text(text: str, max_chars: int) -> list[str]:
    """Split into chunks <= max_chars, preferring paragraph then sentence boundaries."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    chunks: list[str] = []
    current = ""

    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        if len(para) <= max_chars:
            current = para
            continue
        # Paragraph alone exceeds the limit — split by sentences.
        for sent in re.split(r"(?<=[.!?؟…])\s+", para):
            candidate = f"{current} {sent}".strip() if current else sent
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = sent
    if current:
        chunks.append(current)
    return chunks


def main() -> None:
    p = argparse.ArgumentParser(description="Split a long text into chapter files")
    p.add_argument("input", help="Input text file")
    p.add_argument("-o", "--outdir", default="chapters", help="Output directory")
    p.add_argument("--max-chars", type=int, default=60000, help="Max characters per chapter file")
    p.add_argument("--prefix", default="chapter", help="Filename prefix")
    args = p.parse_args()

    text = Path(args.input).read_text(encoding="utf-8")
    chunks = split_text(text, args.max_chars)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"Split into {len(chunks)} chapter file(s):")
    for i, chunk in enumerate(chunks, 1):
        path = outdir / f"{args.prefix}_{i:03d}.txt"
        path.write_text(chunk, encoding="utf-8")
        print(f"  {path}  ({len(chunk):,} chars)")

    print("\nNext: python3 generate_chapter.py chapters/chapter_001.txt -o chapter_001.wav --voice troy")


if __name__ == "__main__":
    main()
