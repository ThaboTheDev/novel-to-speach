#!/usr/bin/env python3
"""
Helper script for generating a single chapter.
Because TTS is provided by the Voice connected tool, this script:
1. Validates the text length
2. Shows the exact command / arguments needed
3. (Optionally) prepares a clean text file

In practice, Grok will call the voice_generate_speech tool for you.
"""

import argparse
from pathlib import Path
from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()
MAX_CHARS = 60000
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def main():
    parser = argparse.ArgumentParser(description="Prepare / validate text for TTS generation")
    parser.add_argument("--text", "-t", required=True, help="Input .txt file")
    parser.add_argument("--voice", "-v", default="atlas", help="Voice ID (see voices.txt)")
    parser.add_argument("--output", "-o", default="chapter.mp3", help="Desired output MP3 name")
    args = parser.parse_args()

    path = Path(args.text)
    if not path.exists():
        print(f"Error: {path} not found")
        return

    text = path.read_text(encoding="utf-8").strip()
    char_count = len(text)

    print("=" * 60)
    print("AUDIOBOOK CHAPTER GENERATION")
    print("=" * 60)
    print(f"Input file : {path}")
    print(f"Characters : {char_count}")
    print(f"Voice      : {args.voice}")
    print(f"Output     : {args.output}")
    print()

    if char_count > MAX_CHARS:
        print(f"WARNING: Text is {char_count} characters.")
        print(f"Maximum allowed is {MAX_CHARS}.")
        print("Please split the text first using split_text.py")
        return

    print("Text is within limits.")
    print()
    print("To generate the audio, Grok will call:")
    print(f'  voice_generate_speech(')
    print(f'      text = <content of {path}>,')
    print(f'      voice = "{args.voice}",')
    print(f'      dest_path = "{args.output}"')
    print(f'  )')
    print()
    print("After generation you can combine multiple chapters with:")
    print(f"  python3 combine_chapters.py --chapters chapter_*.mp3 --output full_book.mp3")
    
    generate_audio(args.voice, text, args.output)
    
def get_text(path):
    output_text = ""
    with open(path, 'r+') as file:
        data = file.readlines
        for line in data:
            output_text += f" {line}"
            
    return output_text
    
def generate_audio(voice, text, output):
    speech_file_path = f"{output.strip()}.wav" 
    model = "canopylabs/orpheus-v1-english"
    response_format = "wav"
    
    response = client.audio.speech.create(
        model=model,
        voice=voice,
        input=text,
        response_format=response_format
    )
    
    response.write_to_file(speech_file_path)

if __name__ == "__main__":
    main()
