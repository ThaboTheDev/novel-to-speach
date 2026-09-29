#!/usr/bin/env python3
"""
Shared utilities for the Novel→Speech CLI.

Groq's Orpheus TTS (https://console.groq.com/docs/text-to-speech):
  - Models: canopylabs/orpheus-v1-english, canopylabs/orpheus-arabic-saudi
  - Hard limit of 200 characters per request, WAV output only (24 kHz 16-bit mono)
So any long text must be split sentence-aware, synthesized in many small
requests, then stitched back together here.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass

MAX_INPUT_CHARS = 200
SAMPLE_RATE = 24000

MODELS: dict[str, dict] = {
    "canopylabs/orpheus-v1-english": {
        "label": "Orpheus · English",
        "directions": True,
        "voices": ["autumn", "diana", "hannah", "austin", "daniel", "troy"],
    },
    "canopylabs/orpheus-arabic-saudi": {
        "label": "Orpheus · Arabic (Saudi)",
        "directions": False,
        "voices": ["abdullah", "fahad", "sultan", "lulwa", "noura", "aisha"],
    },
}

# ---------------------------------------------------------------------------
# Text chunking (sentence-aware; mirrors the web app's lib/chunker.ts)
# ---------------------------------------------------------------------------

_SENTENCE_END = re.compile(r'[.!?…؟]["\'”’)\]]*(?=\s|$)')


def split_sentences(paragraph: str) -> list[str]:
    parts: list[str] = []
    rest = paragraph.strip()
    while rest:
        m = _SENTENCE_END.search(rest)
        if not m:
            parts.append(rest.strip())
            break
        cut = m.end()
        parts.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    return [p for p in parts if p]


def _force_split(text: str, max_len: int) -> list[str]:
    out: list[str] = []
    rest = text
    while len(rest) > max_len:
        window = rest[: max_len + 1]
        cut = -1
        clause = max(window.rfind(", "), window.rfind("; "), window.rfind(": "),
                     window.rfind(" — "), window.rfind("، "))
        if clause > max_len * 0.4:
            cut = clause + 1
        if cut == -1:
            space = window.rfind(" ")
            if space > max_len * 0.3:
                cut = space + 1
        if cut == -1:
            cut = max_len
        out.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    if rest:
        out.append(rest)
    return [p for p in out if p]


@dataclass
class Segment:
    index: int
    text: str            # display text
    api_text: str        # exact text sent to the API (direction prefix included)
    end_of_paragraph: bool


def chunk_text(text: str, max_chars: int = MAX_INPUT_CHARS, direction: str = "") -> list[Segment]:
    """Split into TTS-ready segments. Every api_text is guaranteed <= max_chars."""
    max_chars = max(40, min(max_chars, MAX_INPUT_CHARS))
    direction = direction.strip()
    budget = max_chars - (len(direction) + 1 if direction else 0)
    if budget < 24:
        raise ValueError("The vocal direction leaves too little room for text. Shorten it.")

    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        return []

    paragraphs = [re.sub(r"\n", " ", p).strip() for p in re.split(r"\n{2,}", normalized)]
    paragraphs = [p for p in paragraphs if p]

    segments: list[Segment] = []
    current = ""

    def flush(end_of_paragraph: bool):
        nonlocal current
        t = current.strip()
        if not t:
            return
        segments.append(Segment(len(segments), t, f"{direction} {t}" if direction else t, end_of_paragraph))
        current = ""

    for pi, para in enumerate(paragraphs):
        pieces: list[str] = []
        for sentence in split_sentences(para):
            pieces.extend(_force_split(sentence, budget) if len(sentence) > budget else [sentence])
        for piece in pieces:
            if not current:
                current = piece
            elif len(current) + 1 + len(piece) <= budget:
                current += " " + piece
            else:
                flush(False)
                current = piece
        flush(pi < len(paragraphs) - 1)
    flush(False)
    return segments


def sanitize_direction(raw: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z \-]", " ", raw.replace("[", " ").replace("]", " "))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:32]
    return f"[{cleaned.lower()}]" if cleaned else ""


# ---------------------------------------------------------------------------
# WAV helpers — lenient reader (Groq streams headers with unknown sizes)
# ---------------------------------------------------------------------------

@dataclass
class Wav:
    sample_rate: int
    pcm: bytes  # signed 16-bit little-endian mono

    @property
    def seconds(self) -> float:
        return len(self.pcm) / 2 / self.sample_rate


def read_wav(data: bytes) -> Wav:
    """Parse a RIFF/WAVE file, tolerating streamed/oversized chunk lengths."""
    if len(data) < 44 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("Not a RIFF/WAVE file")

    fmt = None
    pcm = None
    offset = 12
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        (size,) = struct.unpack_from("<I", data, offset + 4)
        body = offset + 8
        plausible = len(data) - body if size > len(data) else size
        if chunk_id == b"fmt ":
            audio_format, channels, rate, _brate, _balign, bits = struct.unpack_from("<HHIIHH", data, body)
            fmt = (audio_format, channels, rate, bits)
        elif chunk_id == b"data":
            pcm = data[body : body + plausible]
            break
        offset = body + plausible + (plausible % 2)

    if not fmt:
        raise ValueError("WAV fmt chunk not found")
    if pcm is None:
        raise ValueError("WAV data chunk not found")

    audio_format, channels, rate, bits = fmt
    if audio_format != 1 or bits != 16:
        raise ValueError(f"Unsupported WAV (format={audio_format}, bits={bits}); need 16-bit PCM")
    if channels != 1:
        frames = len(pcm) // (channels * 2)
        out = bytearray(frames * 2)
        for f in range(frames):
            total = 0
            for c in range(channels):
                (v,) = struct.unpack_from("<h", pcm, f * channels * 2 + c * 2)
                total += v
            struct.pack_into("<h", out, f * 2, max(-32768, min(32767, total // channels)))
        pcm = bytes(out)
    return Wav(rate, pcm)


def write_wav(wav: Wav, path: str) -> None:
    """Write a standards-compliant 24/16 mono WAV (stdlib wave writes a clean header)."""
    import wave

    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(wav.sample_rate)
        w.writeframes(wav.pcm)


def silence_bytes(ms: int, sample_rate: int) -> bytes:
    return b"\x00\x00" * round(ms / 1000 * sample_rate)
