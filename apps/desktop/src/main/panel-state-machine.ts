/**
 * Panel State Machine
 * 
 * Single source of truth for floating panel size and mode management.
 * Solves the problem of competing resize sources (main process, renderer, user manual resize)
 * that caused edge cases with panel sizing when switching between modes.
 * 
 * Key design principles:
 * 1. Waveform mode is a temporary "overlay" state that doesn't affect the user's preferred size
 * 2. When leaving waveform mode, the panel restores to the appropriate size for the next content
 * 3. All size changes go through this state machine to prevent race conditions
 */

import { BrowserWindow } from "electron"
import { logApp } from "./debug"
import { configStore } from "./config"
import { calculatePanelPosition } from "./panel-position"

// Size constants (must match values in window.ts and panel.tsx)
export const WAVEFORM_MIN_HEIGHT = 80
export const TEXT_INPUT_MIN_HEIGHT = 160
export const MIN_WAVEFORM_WIDTH = 312 // 70 bars * (2px + 2px gap) + 32px padding
const DEFAULT_AGENT_SIZE = { width: 600, height: 400 }
const DEFAULT_WAVEFORM_SIZE = { width: 312, height: WAVEFORM_MIN_HEIGHT }

/**
 * Content modes represent what the panel is displaying.
 * This is different from the focus mode (focusable vs non-focusable).
 */
export type PanelContentMode = "idle" | "waveform" | "agent" | "textInput"

interface PanelState {
  /** Current content being displayed */
  contentMode: PanelContentMode
  /** The user's preferred size (saved across sessions, restored after waveform) */
  userPreferredSize: { width: number; height: number }
  /** Size before entering waveform mode (used for immediate restoration) */
  preWaveformSize: { width: number; height: number } | null
  /** Whether we're in a temporary waveform shrink */
  isWaveformShrink: boolean
  /** Whether any agent sessions are currently active (non-snoozed, non-complete) */
  hasActiveAgentSessions: boolean
  /** Timestamp of last resize to prevent rapid successive resizes */
  lastResizeTs: number
}

// Global state
let panelState: PanelState = {
  contentMode: "idle",
  userPreferredSize: DEFAULT_AGENT_SIZE,
  preWaveformSize: null,
  isWaveformShrink: false,
  hasActiveAgentSessions: false,
  lastResizeTs: 0,
}

// Debounce threshold to prevent rapid resizes to the SAME size
const RESIZE_DEBOUNCE_MS = 50
// Track last resize target to allow different sizes through debounce
let lastResizeTarget: { width: number; height: number } | null = null

/**
 * Initialize the state machine with saved preferences
 */
export function initPanelStateMachine(): void {
  const config = configStore.get()
  if (config.panelCustomSize) {
    panelState.userPreferredSize = config.panelCustomSize
    logApp("[PanelStateMachine] Initialized with saved size:", config.panelCustomSize)
  } else {
    panelState.userPreferredSize = DEFAULT_AGENT_SIZE
    logApp("[PanelStateMachine] Initialized with default size:", DEFAULT_AGENT_SIZE)
  }
}

/**
 * Get the current panel state (for debugging/logging)
 */
export function getPanelState(): Readonly<PanelState> {
  return { ...panelState }
}

/**
 * Called when user manually resizes the panel.
 * Updates the preferred size (except during waveform mode).
 */
export function onUserResize(newSize: { width: number; height: number }): void {
  // Don't update preferred size during waveform mode
  if (panelState.isWaveformShrink) {
    logApp("[PanelStateMachine] Ignoring resize during waveform mode")
    return
  }

  panelState.userPreferredSize = newSize
  logApp("[PanelStateMachine] User preferred size updated:", newSize)
}

/**
 * Calculate the target size for a given content mode.
 */
function getTargetSizeForMode(mode: PanelContentMode, currentSize: { width: number; height: number }): { width: number; height: number } {
  switch (mode) {
    case "waveform":
      // Keep current width, shrink height
      return {
        width: Math.max(currentSize.width, MIN_WAVEFORM_WIDTH),
        height: WAVEFORM_MIN_HEIGHT,
      }
    case "textInput":
      // Ensure minimum height for text input
      return {
        width: Math.max(currentSize.width, panelState.userPreferredSize.width, 380),
        height: Math.max(panelState.userPreferredSize.height, TEXT_INPUT_MIN_HEIGHT),
      }
    case "agent":
      // Use saved preferred size, but ensure reasonable minimums
      return {
        width: Math.max(panelState.userPreferredSize.width, MIN_WAVEFORM_WIDTH),
        height: Math.max(panelState.userPreferredSize.height, 200),
      }
    case "idle":
    default:
      // Use saved preferred size
      return panelState.userPreferredSize
  }
}

/**
 * Apply a size change to the panel window.
 */
function applyPanelSize(
  win: BrowserWindow,
  targetSize: { width: number; height: number },
  mode: PanelContentMode
): void {
  const now = Date.now()
  const timeSinceLastResize = now - panelState.lastResizeTs

  // Smart debounce: only debounce if we're trying to resize to the SAME target size
  // This allows rapid transitions between different sizes (e.g., waveform -> idle)
  const isSameTarget = lastResizeTarget &&
    lastResizeTarget.width === targetSize.width &&
    lastResizeTarget.height === targetSize.height

  if (timeSinceLastResize < RESIZE_DEBOUNCE_MS && isSameTarget) {
    logApp("[PanelStateMachine] Resize debounced (same target within threshold)")
    return
  }

  panelState.lastResizeTs = now
  lastResizeTarget = { ...targetSize }

  try {
    const [currentWidth, currentHeight] = win.getSize()

    // Only resize if size actually changed
    if (currentWidth === targetSize.width && currentHeight === targetSize.height) {
      logApp(`[PanelStateMachine] Size unchanged (${targetSize.width}x${targetSize.height}), skipping resize`)
      return
    }

    logApp(`[PanelStateMachine] Resizing from ${currentWidth}x${currentHeight} to ${targetSize.width}x${targetSize.height} for mode: ${mode}`)

    win.setSize(targetSize.width, targetSize.height)

    // Reposition to maintain anchor point
    const position = calculatePanelPosition(targetSize, mode === "textInput" ? "textInput" : mode === "agent" ? "agent" : "normal")
    win.setPosition(position.x, position.y)
  } catch (error) {
    logApp("[PanelStateMachine] Error applying panel size:", error)
  }
}

/**
 * Transition to a new content mode.
 * This is the main entry point for all mode changes.
 *
 * @param win - The panel BrowserWindow
 * @param newMode - The new content mode
 * @param options - Additional options for the transition
 */
export function transitionToMode(
  win: BrowserWindow,
  newMode: PanelContentMode,
  options: {
    /** If true, force resize even if mode is the same */
    force?: boolean
    /** Set when active agent sessions exist */
    hasActiveAgentSessions?: boolean
  } = {}
): void {
  const prevMode = panelState.contentMode
  const { force = false, hasActiveAgentSessions } = options

  // Update agent session state if provided
  if (hasActiveAgentSessions !== undefined) {
    panelState.hasActiveAgentSessions = hasActiveAgentSessions
  }

  // Skip if mode is unchanged (unless forced)
  if (newMode === prevMode && !force) {
    logApp(`[PanelStateMachine] Mode unchanged (${newMode}), skipping transition`)
    return
  }

  logApp(`[PanelStateMachine] Transitioning: ${prevMode} -> ${newMode}`)

  // Handle entering waveform mode - save current size for restoration
  if (newMode === "waveform" && !panelState.isWaveformShrink) {
    const [currentWidth, currentHeight] = win.getSize()
    panelState.preWaveformSize = { width: currentWidth, height: currentHeight }
    panelState.isWaveformShrink = true
    logApp("[PanelStateMachine] Saved pre-waveform size:", panelState.preWaveformSize)
  }

  // Handle leaving waveform mode
  if (prevMode === "waveform" && newMode !== "waveform") {
    panelState.isWaveformShrink = false
    panelState.preWaveformSize = null
    logApp("[PanelStateMachine] Cleared waveform shrink state")
  }

  panelState.contentMode = newMode

  // Calculate and apply target size
  const [currentWidth, currentHeight] = win.getSize()
  const targetSize = getTargetSizeForMode(newMode, { width: currentWidth, height: currentHeight })
  applyPanelSize(win, targetSize, newMode)
}

/**
 * Determine what mode the panel should be in based on current state.
 * Used after recording ends or when state changes.
 */
export function determineAppropriateMode(options: {
  isRecording: boolean
  hasActiveAgentSessions: boolean
  isTextInputActive: boolean
}): PanelContentMode {
  const { isRecording, hasActiveAgentSessions, isTextInputActive } = options

  if (isRecording) {
    return "waveform"
  }
  if (isTextInputActive) {
    return "textInput"
  }
  if (hasActiveAgentSessions) {
    return "agent"
  }
  return "idle"
}

/**
 * Called when recording ends. Determines appropriate mode and transitions.
 */
export function onRecordingEnd(
  win: BrowserWindow,
  options: {
    hasActiveAgentSessions: boolean
    isTextInputActive: boolean
  }
): void {
  const newMode = determineAppropriateMode({
    isRecording: false,
    ...options,
  })

  logApp(`[PanelStateMachine] Recording ended, transitioning to: ${newMode}`)
  transitionToMode(win, newMode, {
    hasActiveAgentSessions: options.hasActiveAgentSessions,
  })
}

/**
 * Called when an agent session becomes active.
 */
export function onAgentSessionStart(win: BrowserWindow): void {
  panelState.hasActiveAgentSessions = true

  // Only transition if not currently recording
  if (panelState.contentMode !== "waveform") {
    transitionToMode(win, "agent", { hasActiveAgentSessions: true })
  } else {
    logApp("[PanelStateMachine] Agent started during recording, will transition after recording ends")
  }
}

/**
 * Called when all agent sessions complete or are dismissed.
 */
export function onAllAgentSessionsEnd(win: BrowserWindow): void {
  panelState.hasActiveAgentSessions = false

  // Only transition if currently in agent mode
  if (panelState.contentMode === "agent") {
    transitionToMode(win, "idle")
  }
}

/**
 * Force restore to user's preferred size (used for emergency recovery).
 */
export function restoreUserPreferredSize(win: BrowserWindow): void {
  panelState.isWaveformShrink = false
  panelState.preWaveformSize = null

  const targetSize = panelState.userPreferredSize
  applyPanelSize(win, targetSize, panelState.contentMode)
}

