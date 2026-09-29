# Audiobook Creation System

This system creates audiobooks using the available high-quality TTS voices.

## Important Limitations
- **Custom voice training / uploading is NOT supported.**  
  Only the predefined voices listed below can be used.
- Maximum ~60,000 characters per generation (~1–1.5 hours of audio).
- Long books must be split into chapters or sections.

## Available Voices (Deep / Professional recommended)
| Voice ID   | Gender | Notes                  |
|------------|--------|------------------------|
| atlas      | Male   | Deep, authoritative    |
| orion      | Male   | Clear, strong          |
| rex        | Male   | Deep                   |
| helios     | Male   | Warm deep              |
| perseus    | Male   | Strong                 |
| sirius     | Male   | Clear                  |
| altair     | Male   | Neutral                |
| aurora     | Female | Soft                   |
| eve        | Female | Clear                  |
| luna       | Female | Warm                   |

## How to Use

### 1. Prepare your book text
- Put the full text (or one chapter) in a `.txt` file inside this folder.
- Example: `chapter_01.txt`

### 2. Generate speech for a chapter
Use the helper script:

```bash
python3 generate_chapter.py --text chapter_01.txt --voice atlas --output chapter_01.mp3
```

### 3. Combine multiple chapters
```bash
python3 combine_chapters.py --chapters chapter_01.mp3 chapter_02.mp3 chapter_03.mp3 --output full_audiobook.mp3
```

### 4. Full workflow example
See `example_workflow.sh`

## Files in this system
- `generate_chapter.py` – Converts a text file into speech
- `combine_chapters.py` – Joins multiple MP3s with short pauses
- `split_text.py` – Splits a long book into smaller chunks under the character limit
- `example_workflow.sh` – Ready-to-run example
- `voices.txt` – List of available voices
