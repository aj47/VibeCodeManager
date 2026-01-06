/**
 * Audio Cue System for Agent Events
 * 
 * Provides audio feedback for various agent events using macOS system sounds.
 * Optionally combines with TTS for voice announcements.
 */

import { exec } from "child_process"
import { configStore } from "./config"
import { logApp } from "./debug"
import { synthesizeLocal, isLocalTTSAvailable } from "./local-audio"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// Audio cue types for different agent events
export type AudioCueType = "completion" | "approval" | "error" | "start" | "idle" | "thinking" | "success" | "navigation"

export interface AudioCueOptions {
  /** Whether to also speak a message via TTS */
  speakMessage?: string
  /** Volume level 0-1 (default: uses system volume) */
  volume?: number
  /** Delay in ms between cue and TTS to avoid overlap (default: 300) */
  ttsDelay?: number
  /** Whether to skip the sound cue and only speak (default: false) */
  skipCue?: boolean
}

// macOS system sounds mapped to cue types
const SYSTEM_SOUNDS: Record<AudioCueType, string> = {
  completion: "/System/Library/Sounds/Glass.aiff",
  approval: "/System/Library/Sounds/Sosumi.aiff",
  error: "/System/Library/Sounds/Basso.aiff",
  start: "/System/Library/Sounds/Pop.aiff",
  idle: "/System/Library/Sounds/Tink.aiff",
  thinking: "/System/Library/Sounds/Morse.aiff",
  success: "/System/Library/Sounds/Ping.aiff",
  navigation: "/System/Library/Sounds/Tink.aiff",
}

// Fallback sounds if primary sound doesn't exist
const FALLBACK_SOUNDS: Record<AudioCueType, string> = {
  completion: "/System/Library/Sounds/Ping.aiff",
  approval: "/System/Library/Sounds/Funk.aiff",
  error: "/System/Library/Sounds/Sosumi.aiff",
  start: "/System/Library/Sounds/Blow.aiff",
  idle: "/System/Library/Sounds/Pop.aiff",
  thinking: "/System/Library/Sounds/Tink.aiff",
  success: "/System/Library/Sounds/Glass.aiff",
  navigation: "/System/Library/Sounds/Pop.aiff",
}

// Default delay between audio cue and TTS to avoid overlap (ms)
const DEFAULT_TTS_DELAY_MS = 300

// Default volume level (0-1)
const DEFAULT_VOLUME = 0.7

// Module-level enabled state (can be toggled at runtime)
let audioCuesEnabled = true

/**
 * Set whether audio cues are enabled
 */
export function setAudioCuesEnabled(enabled: boolean): void {
  audioCuesEnabled = enabled
  logApp(`[AudioCues] Audio cues ${enabled ? "enabled" : "disabled"}`)
}

/**
 * Check if audio cues are currently enabled
 */
export function isAudioCuesEnabled(): boolean {
  return audioCuesEnabled
}

/**
 * Get the sound file path for a cue type
 */
function getSoundPath(type: AudioCueType): string | null {
  const primaryPath = SYSTEM_SOUNDS[type]
  const fallbackPath = FALLBACK_SOUNDS[type]

  if (fs.existsSync(primaryPath)) {
    return primaryPath
  }

  if (fs.existsSync(fallbackPath)) {
    logApp(`[AudioCues] Using fallback sound for ${type}`)
    return fallbackPath
  }

  logApp(`[AudioCues] No sound file found for ${type}`)
  return null
}

/**
 * Helper to delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Play a system sound using afplay (macOS)
 * Uses provided volume or respects system default
 */
function playSystemSound(soundPath: string, volume?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use provided volume, or DEFAULT_VOLUME to respect system volume
    const effectiveVolume = volume ?? DEFAULT_VOLUME
    // afplay -v takes a value where 1.0 = normal volume
    const afplayVolume = effectiveVolume

    exec(`afplay -v ${afplayVolume} "${soundPath}"`, (error) => {
      if (error) {
        logApp(`[AudioCues] Failed to play sound: ${error.message}`)
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Speak a message using TTS
 */
async function speakWithTTS(message: string): Promise<void> {
  if (!isLocalTTSAvailable()) {
    logApp("[AudioCues] TTS not available, skipping voice announcement")
    return
  }

  const config = configStore.get()
  if (!config.ttsEnabled) {
    logApp("[AudioCues] TTS disabled in config, skipping voice announcement")
    return
  }

  try {
    const audioBuffer = await synthesizeLocal(message, config.localTtsVoice || "expr-voice-2-f")
    
    // Write to temp file and play with afplay
    const tempWav = path.join(os.tmpdir(), `vibecode-cue-tts-${Date.now()}.wav`)
    fs.writeFileSync(tempWav, Buffer.from(audioBuffer))
    
    await new Promise<void>((resolve, reject) => {
      exec(`afplay "${tempWav}"`, (error) => {
        // Clean up temp file
        try { fs.unlinkSync(tempWav) } catch {}
        
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
    
    logApp(`[AudioCues] Spoke message: "${message}"`)
  } catch (error) {
    logApp(`[AudioCues] TTS error: ${error}`)
    // Don't throw - audio cue failures should not crash the app
  }
}

/**
 * Play an audio cue for an agent event
 *
 * @param type - The type of audio cue to play
 * @param options - Optional settings for volume, TTS message, and timing
 */
export async function playAudioCue(
  type: AudioCueType,
  options?: AudioCueOptions
): Promise<void> {
  // Check if audio cues are enabled (both runtime state and config)
  const config = configStore.get()
  if (!audioCuesEnabled || config.audioCuesEnabled === false) {
    logApp(`[AudioCues] Skipping ${type} cue - audio cues disabled`)
    return
  }

  // Only macOS is currently supported
  if (process.platform !== "darwin") {
    logApp(`[AudioCues] Skipping ${type} cue - platform not supported`)
    return
  }

  const volume = options?.volume
  const speakMessage = options?.speakMessage
  const ttsDelay = options?.ttsDelay ?? DEFAULT_TTS_DELAY_MS
  const skipCue = options?.skipCue ?? false

  try {
    // Play the system sound (unless skipped)
    if (!skipCue) {
      const soundPath = getSoundPath(type)
      if (soundPath) {
        await playSystemSound(soundPath, volume)
        logApp(`[AudioCues] Played ${type} cue`)
      }
    }

    // Optionally speak a message via TTS
    if (speakMessage) {
      // Add delay between cue and TTS to avoid overlap
      if (!skipCue && ttsDelay > 0) {
        await delay(ttsDelay)
      }
      await speakWithTTS(speakMessage)
    }
  } catch (error) {
    // Log but don't throw - audio cue failures should not affect app functionality
    logApp(`[AudioCues] Error playing ${type} cue: ${error}`)
  }
}

/**
 * Play a "thinking" sound to indicate agent is processing
 * Useful for longer operations to provide audio feedback
 */
export async function playThinkingCue(options?: Omit<AudioCueOptions, 'speakMessage'>): Promise<void> {
  return playAudioCue("thinking", options)
}

/**
 * Play a success confirmation sound
 */
export async function playSuccessCue(message?: string): Promise<void> {
  return playAudioCue("success", { speakMessage: message })
}

/**
 * Play an error sound
 */
export async function playErrorCue(message?: string): Promise<void> {
  return playAudioCue("error", { speakMessage: message })
}

/**
 * Play a navigation confirmation sound with optional spoken message
 */
export async function playNavigationCue(destination?: string): Promise<void> {
  const message = destination ? `Opening ${destination}` : undefined
  return playAudioCue("navigation", { speakMessage: message })
}

