# Novel → Speech — Audiobook Studio

Turn novels and long-form text into downloadable audiobooks using [Groq's Orpheus TTS](https://console.groq.com/docs/text-to-speech) expressive voices.

Paste a chapter (or a whole book), pick a narrator, optionally set a delivery style like `[professionally]`, and the studio splits your text into API-sized segments, generates them in parallel, and stitches everything into one audio file you can download as **WAV** or **MP3** — right in the browser.

## ✨ Features

- **Web studio UI** — manuscript editor with drag-&-drop `.txt` upload, live stats, and cost estimates
- **12 voices / 2 languages** — English (with vocal-direction control) and Saudi-dialect Arabic, all with one-click previews
- **Smart segmentation** — sentence-aware splitting that respects the API's 200-character limit and preserves paragraph pauses
- **Resilient pipeline** — limited parallelism with automatic retry/backoff, per-segment status, resume and "retry failed"
- **In-browser stitching & MP3** — chapters are assembled client-side; MP3 encoding happens locally too. Your text never touches a database
- **Server-side key** — `GROQ_API_KEY` lives only in a serverless route; it is never shipped to the browser
- **CLI tooling** — the original Python scripts, fixed and upgraded, remain in [`backend/`](backend/) for offline batch work

## 🚀 Deploy to Vercel (recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FThaboTheDev%2Fnovel-to-speach&env=GROQ_API_KEY&envDescription=Groq%20API%20key%20—%20get%20a%20free%20one%20at%20https%3A%2F%2Fconsole.groq.com%2Fkeys&project-name=novel-to-speech)

1. Click the button (or **Import Project** in Vercel and pick this repo). Zero config is needed — Next.js is detected automatically.
2. Add the environment variable when prompted (or later in **Settings → Environment Variables**):

   | Variable | Required | Description |
   |---|---|---|
   | `GROQ_API_KEY` | ✅ | Get a free key at <https://console.groq.com/keys> |
   | `RATE_LIMIT_RPM` | optional | Per-IP requests/minute for `/api/tts` (default `240`, `0` disables). Best-effort on serverless — see *Notes* |

3. Deploy. That's it — the app is fully serverless; audio assembly happens in the visitor's browser.

> **Sharing a public deployment?** The rate limiter is per warm instance (deterrent, not a guarantee). For a public launch, add real protection (e.g. Vercel Firewall / an external store) so strangers can't spend your Groq credits.

## 💻 Run locally

```bash
cp .env.example .env.local   # then paste your GROQ_API_KEY
npm install
npm run dev                  # → http://localhost:3000
```

No key yet? In development the app falls back to **demo mode** (clearly labelled) that returns synthetic placeholder tones, so you can try the whole pipeline before getting a key.

```bash
npm run build && npm start   # production build
```

## 🐍 Python CLI (offline batch work)

The original scripts are in [`backend/`](backend/), now corrected for the real Orpheus API (200-char requests, valid voices):

```bash
cd backend
pip install -r requirements.txt
export GROQ_API_KEY=...        # or put it in a .env file

# Generate a chapter (splits → synthesizes → stitches in one step)
python3 generate_chapter.py chapter_01.txt -o chapter_01.wav --voice troy
python3 generate_chapter.py book.txt -o book.wav --direction "professionally" --concurrency 4 --mp3

# Split a long book into chapter files first (optional, for organizing)
python3 split_text.py book.txt -o chapters --max-chars 60000

# Combine finished chapters (pure stdlib for WAV; ffmpeg for MP3)
python3 combine_chapters.py chapters_audio/*.wav -o full_audiobook.wav --pause 2.0

# See what's available
python3 generate_chapter.py --list-voices
```

## 🧩 How it works

```
chapter text ──▶ sentence-aware chunker (≤200 chars each, paragraph breaks kept)
            ──▶ /api/tts (validates, rate-limits, proxies to Groq — key stays server-side)
            ──▶ 24 kHz 16-bit WAV per segment, generated with limited parallelism + retry
            ──▶ browser stitches PCM (pauses at paragraphs) ──▶ WAV export
                                                            ──▶ MP3 export (lamejs, in-browser)
```

Why the chunking? Orpheus' hard limit is **200 characters per request** — a typical chapter is hundreds of requests. The studio handles that for you, and shows progress per segment.

### API costs at a glance

| Model | Price | Voices | Vocal directions |
|---|---|---|---|
| `canopylabs/orpheus-v1-english` | $22 / 1M chars | autumn, diana, hannah, austin, daniel, troy | ✅ |
| `canopylabs/orpheus-arabic-saudi` | $40 / 1M chars | abdullah, fahad, sultan, lulwa, noura, aisha | — |

A 20,000-character chapter ≈ **$0.44** (English). The UI always shows a live estimate before you generate.

## 🗂 Project structure

```
app/
  api/tts/route.ts     serverless proxy: validation + rate limit + key handling
  layout.tsx, page.tsx, globals.css
components/            studio UI (manuscript, narrator, segments, output)
lib/                   catalog, chunker, WAV tools, MP3 encoder, generator queue
backend/               Python CLI (generate/split/combine) — independent of the web app
voices.txt             voice reference
.env.example           environment template
```

## ❓ Troubleshooting

- **"Generation is not configured: set GROQ_API_KEY"** — add the env var in Vercel and redeploy.
- **429s / slowed generation** — you're hitting Groq rate limits; lower *Parallel requests* under Advanced.
- **A segment fails repeatedly** — check the text for unusual characters; then use **Retry failed**.
- **Huge books** — browser memory is the limit for stitching hours of lossless WAV. Generate per-chapter and combine later (locally or with `backend/combine_chapters.py`).

---

*Audio processing and MP3 encoding happen entirely on the client. Manuscript text is only sent to the TTS API, never stored.*
