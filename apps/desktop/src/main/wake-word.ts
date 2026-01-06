/**
 * Wake Word Detection Module
 * 
 * Provides infrastructure for wake word detection to enable hands-free voice control.
 * 
 * Current implementation is a stub/placeholder that sets up the configuration and
 * event infrastructure. Actual wake word detection can be implemented later using:
 * - Porcupine (Picovoice) - commercial but high quality
 * - Snowboy - open source but deprecated
 * - Web Speech API continuous listening (browser-based)
 * - Whisper-based custom solution
 */

import { configStore } from "./config"

// ============================================================================
// Types
// ============================================================================

export interface WakeWordConfig {
  enabled: boolean
  wakePhrase: string // e.g., "hey vibe", "computer"
  sensitivity: "low" | "medium" | "high"
}

// ============================================================================
// State
// ============================================================================

let detectionActive = false
const listeners: Set<() => void> = new Set()

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize wake word detection.
 * In the current stub implementation, this just logs that it would start detection.
 * 
 * Future implementation could:
 * 1. Load the wake word model
 * 2. Start continuous audio capture
 * 3. Run detection on audio frames
 */
export function initWakeWordDetection(): void {
  const config = configStore.get()
  
  if (!config.wakeWordEnabled) {
    console.log("[wake-word] Wake word detection is disabled in config")
    return
  }
  
  if (detectionActive) {
    console.log("[wake-word] Detection already active")
    return
  }

  detectionActive = true
  const phrase = config.wakePhrase || "hey vibe"
  const sensitivity = config.wakeWordSensitivity || "medium"
  
  console.log(`[wake-word] Wake word detection initialized (stub)`)
  console.log(`[wake-word] Wake phrase: "${phrase}"`)
  console.log(`[wake-word] Sensitivity: ${sensitivity}`)
  console.log(`[wake-word] NOTE: This is a placeholder. Actual detection not yet implemented.`)
}

/**
 * Stop wake word detection.
 * Releases any audio resources and stops listening.
 */
export function stopWakeWordDetection(): void {
  if (!detectionActive) {
    console.log("[wake-word] Detection not active, nothing to stop")
    return
  }

  detectionActive = false
  console.log("[wake-word] Wake word detection stopped")
}

/**
 * Check if wake word detection is enabled in configuration.
 */
export function isWakeWordEnabled(): boolean {
  const config = configStore.get()
  return config.wakeWordEnabled ?? false
}

/**
 * Enable or disable wake word detection.
 * Updates the configuration and starts/stops detection accordingly.
 */
export function setWakeWordEnabled(enabled: boolean): void {
  const config = configStore.get()
  configStore.save({ ...config, wakeWordEnabled: enabled })
  
  if (enabled) {
    initWakeWordDetection()
  } else {
    stopWakeWordDetection()
  }
  
  console.log(`[wake-word] Wake word detection ${enabled ? "enabled" : "disabled"}`)
}

/**
 * Register a callback to be called when the wake word is detected.
 * Returns an unsubscribe function.
 * 
 * @param callback Function to call when wake word is detected
 * @returns Unsubscribe function
 */
export function onWakeWordDetected(callback: () => void): () => void {
  listeners.add(callback)
  
  return () => {
    listeners.delete(callback)
  }
}

/**
 * Get the current wake word configuration.
 */
export function getWakeWordConfig(): WakeWordConfig {
  const config = configStore.get()
  return {
    enabled: config.wakeWordEnabled ?? false,
    wakePhrase: config.wakePhrase ?? "hey vibe",
    sensitivity: config.wakeWordSensitivity ?? "medium",
  }
}

/**
 * Update wake word configuration.
 */
export function setWakeWordConfig(wakeWordConfig: Partial<WakeWordConfig>): void {
  const config = configStore.get()

  const updatedConfig = { ...config }
  if (wakeWordConfig.enabled !== undefined) {
    updatedConfig.wakeWordEnabled = wakeWordConfig.enabled
  }
  if (wakeWordConfig.wakePhrase !== undefined) {
    updatedConfig.wakePhrase = wakeWordConfig.wakePhrase
  }
  if (wakeWordConfig.sensitivity !== undefined) {
    updatedConfig.wakeWordSensitivity = wakeWordConfig.sensitivity
  }

  configStore.save(updatedConfig)
  
  // Restart detection if active to pick up new settings
  if (detectionActive) {
    stopWakeWordDetection()
    initWakeWordDetection()
  }
}

// ============================================================================
// Internal (for testing or future implementation)
// ============================================================================

/**
 * Simulate a wake word detection event.
 * Used for testing the event infrastructure.
 */
export function _simulateWakeWordDetected(): void {
  if (!detectionActive) {
    console.log("[wake-word] Cannot simulate - detection not active")
    return
  }
  
  console.log("[wake-word] Wake word detected! (simulated)")
  
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error("[wake-word] Error in listener:", error)
    }
  }
}

/**
 * Check if detection is currently active.
 */
export function isDetectionActive(): boolean {
  return detectionActive
}

