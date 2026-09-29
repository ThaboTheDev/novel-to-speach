#!/usr/bin/env python3
"""
Split a long book text into chunks under the TTS character limit (default 55,000).
Usage:
  python3 split_text.py --input book.txt --outdir chapters --max-chars 55000
"""

import argparse
import os
import re
from pathlib import Path

def split_text(text: str, max_chars: int = 55000):
    """Split text into chunks, preferring paragraph or sentence boundaries."""
    # Normalize line endings
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    chunks = []
    current = ""
    
    # Split by double newlines first (paragraphs)
    paragraphs = re.split(r'\n\s*\n', text)
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
            
        if len(current) + len(para) + 2 <= max_chars:
            if current:
                current += "\n\n" + para
            else:
                current = para
        else:
            if current:
                chunks.append(current)
            # If a single paragraph is too long, split by sentences
            if len(para) > max_chars:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current = ""
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_chars:
                        current = (current + " " + sent).strip()
                    else:
                        if current:
                            chunks.append(current)
                        current = sent
            else:
                current = para
    
    if current:
        chunks.append(current)
    
    return chunks

def main():
    parser = argparse.ArgumentParser(description="Split long text into TTS-friendly chunks")
    parser.add_argument("--input", "-i", required=True, help="Input text file")
    parser.add_argument("--outdir", "-o", default="chapters", help="Output directory")
    parser.add_argument("--max-chars", type=int, default=55000, help="Max characters per chunk")
    parser.add_argument("--prefix", default="part", help="Filename prefix")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        text = f.read()

    chunks = split_text(text, args.max_chars)
    
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"Split into {len(chunks)} parts:")
    for i, chunk in enumerate(chunks, 1):
        filename = outdir / f"{args.prefix}_{i:03d}.txt"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(chunk)
        print(f"  {filename}  ({len(chunk)} chars)")

    print(f"\nDone. Now generate each part with generate_chapter.py")

if __name__ == "__main__":
    main()
