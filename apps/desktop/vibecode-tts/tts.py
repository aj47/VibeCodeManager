#!/usr/bin/env python3
"""
VibeCodeManager TTS - Local text-to-speech using Kitten TTS
Usage: python tts.py <output.wav> [--voice <voice_id>]
       Text is read from stdin
"""

import sys
import json
import argparse

def main():
    parser = argparse.ArgumentParser(description='Generate speech from text')
    parser.add_argument('output', help='Output WAV file path')
    parser.add_argument('--voice', default='expr-voice-2-f',
                        choices=['expr-voice-2-m', 'expr-voice-2-f',
                                'expr-voice-3-m', 'expr-voice-3-f',
                                'expr-voice-4-m', 'expr-voice-4-f',
                                'expr-voice-5-m', 'expr-voice-5-f'],
                        help='Voice to use (default: expr-voice-2-f)')
    parser.add_argument('--text', help='Text to synthesize (or read from stdin)')

    args = parser.parse_args()

    # Get text from argument or stdin
    if args.text:
        text = args.text
    else:
        text = sys.stdin.read().strip()

    if not text:
        print(json.dumps({
            'success': False,
            'error': 'No text provided'
        }))
        sys.exit(1)

    try:
        from kittentts import KittenTTS
        import soundfile as sf

        # Load model (caches after first load)
        model = KittenTTS("KittenML/kitten-tts-nano-0.2")

        # Generate audio
        audio = model.generate(text, voice=args.voice)

        # Save to file
        sf.write(args.output, audio, 24000)

        print(json.dumps({
            'success': True,
            'output': args.output,
            'voice': args.voice,
            'text_length': len(text)
        }))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
