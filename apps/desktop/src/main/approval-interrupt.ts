/**
 * Approval Interrupt System
 * 
 * When an agent needs approval, interrupts the user with an audio cue and voice announcement,
 * then listens for voice approval/denial.
 * 
 * Voice responses supported:
 * - Approve: "Yes", "Approve", "Do it", "Okay", "Go ahead"
 * - Deny: "No", "Deny", "Cancel", "Stop"
 * - Show more: "Show me more", "More details", "Explain"
 */

import { EventEmitter } from "events"
import { playAudioCue, isAudioCuesEnabled } from "./audio-cues"
import { synthesizeLocal, isLocalTTSAvailable } from "./local-audio"
import { parseVoiceCommand, ParsedVoiceCommand } from "./voice-command-parser"
import { toolApprovalManager } from "./state"
import { logApp } from "./debug"
import { configStore } from "./config"
import { exec } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// ============================================================================
// Types
// ============================================================================

export interface ApprovalRequest {
  sessionId: string
  agentName: string
  projectName?: string
  toolName: string
  description: string
  details?: string
}

export interface ApprovalResult {
  approved: boolean
  showMore?: boolean
  cancelled?: boolean
  error?: string
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResult>

// ============================================================================
// Constants
// ============================================================================

const APPROVAL_TIMEOUT_MS = 30000 // 30 seconds
const VOICE_LISTEN_TIMEOUT_MS = 10000 // 10 seconds for voice response

// ============================================================================
// State
// ============================================================================

// Pending approvals being processed
const pendingApprovals: Map<string, ApprovalRequest> = new Map()

// Custom approval handler (for testing or alternative UI flows)
let customApprovalHandler: ApprovalHandler | null = null

// Event emitter for approval events
export const approvalEvents = new EventEmitter()

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Speak a message using TTS and play it via afplay
 */
async function speakMessage(message: string): Promise<void> {
  if (!isLocalTTSAvailable()) {
    logApp("[ApprovalInterrupt] TTS not available, skipping voice announcement")
    return
  }

  const config = configStore.get()
  if (!config.ttsEnabled) {
    logApp("[ApprovalInterrupt] TTS disabled in config, skipping voice announcement")
    return
  }

  try {
    const audioBuffer = await synthesizeLocal(message, config.localTtsVoice || "expr-voice-2-f")
    
    // Write to temp file and play with afplay
    const tempWav = path.join(os.tmpdir(), `vibecode-approval-tts-${Date.now()}.wav`)
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
    
    logApp(`[ApprovalInterrupt] Spoke message: "${message}"`)
  } catch (error) {
    logApp(`[ApprovalInterrupt] TTS error: ${error}`)
  }
}

/**
 * Build the voice announcement message for an approval request
 */
function buildAnnouncementMessage(request: ApprovalRequest): string {
  const agentPart = request.agentName
  const toolPart = request.toolName.replace(/_/g, " ")
  const descPart = request.description
    .replace(/_/g, " ")
    .substring(0, 100) // Limit description length for TTS

  // Example: "Backend needs approval to modify database schema. Say approve or deny."
  return `${agentPart} needs approval to ${toolPart}: ${descPart}. Say approve or deny.`
}

/**
 * Parse voice response for approval commands
 */
function parseApprovalResponse(transcript: string): ApprovalResult | null {
  const parsed: ParsedVoiceCommand = parseVoiceCommand(transcript)
  
  if (parsed.type === "approval") {
    switch (parsed.approvalAction) {
      case "approve":
        return { approved: true }
      case "deny":
        return { approved: false }
      case "showMore":
        return { approved: false, showMore: true }
    }
  }
  
  return null
}

/**
 * Generate unique approval ID
 */
function generateApprovalId(request: ApprovalRequest): string {
  return `${request.sessionId}-${request.toolName}-${Date.now()}`
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Request voice approval for an agent action.
 *
 * Flow:
 * 1. Play audio cue (approval type)
 * 2. Speak the approval request via TTS
 * 3. Start listening for voice response
 * 4. Parse response using voice-command-parser
 * 5. Return result based on parsed command
 * 6. Handle timeout (30 seconds) - defaults to showing in UI
 */
export async function requestVoiceApproval(
  request: ApprovalRequest
): Promise<ApprovalResult> {
  const approvalId = generateApprovalId(request)
  logApp(`[ApprovalInterrupt] Starting approval request: ${approvalId}`)
  logApp(`[ApprovalInterrupt] Tool: ${request.toolName}, Agent: ${request.agentName}`)

  // Track as pending
  pendingApprovals.set(approvalId, request)

  // Emit event for UI to show approval dialog as backup
  approvalEvents.emit("approvalRequested", { approvalId, request })

  try {
    // If there's a custom handler (e.g., for testing or voice input), use it
    if (customApprovalHandler) {
      const result = await customApprovalHandler(request)
      pendingApprovals.delete(approvalId)
      approvalEvents.emit("approvalCompleted", { approvalId, result })
      return result
    }

    // Step 1: Play audio cue to get attention
    if (isAudioCuesEnabled()) {
      logApp("[ApprovalInterrupt] Playing approval audio cue")
      await playAudioCue("approval")
    }

    // Step 2: Speak the approval request via TTS
    const message = buildAnnouncementMessage(request)
    await speakMessage(message)

    // Step 3: Wait for voice response with timeout
    // For now, we'll rely on the UI for the actual response since
    // continuous voice listening requires additional infrastructure
    // that should be handled by the voice input system
    const result = await waitForApprovalWithTimeout(approvalId, request)

    // Clean up
    pendingApprovals.delete(approvalId)
    approvalEvents.emit("approvalCompleted", { approvalId, result })

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logApp(`[ApprovalInterrupt] Error: ${errorMessage}`)

    pendingApprovals.delete(approvalId)

    return {
      approved: false,
      cancelled: true,
      error: errorMessage,
    }
  }
}

/**
 * Wait for approval response with timeout.
 * Uses the tool approval manager to integrate with existing approval flow.
 */
async function waitForApprovalWithTimeout(
  approvalId: string,
  request: ApprovalRequest
): Promise<ApprovalResult> {
  // Create a promise that resolves when the user responds via UI or voice
  const { promise } = toolApprovalManager.requestApproval(
    request.sessionId,
    request.toolName,
    { description: request.description, details: request.details }
  )

  // Race against timeout
  const timeoutPromise = new Promise<ApprovalResult>((resolve) => {
    setTimeout(() => {
      logApp(`[ApprovalInterrupt] Approval timeout for ${approvalId}`)
      resolve({
        approved: false,
        cancelled: true,
        error: "Approval timed out - please respond via UI",
      })
    }, APPROVAL_TIMEOUT_MS)
  })

  // Also listen for voice response events
  const voicePromise = new Promise<ApprovalResult>((resolve) => {
    const handler = (event: { approvalId: string; result: ApprovalResult }) => {
      if (event.approvalId === approvalId) {
        approvalEvents.off("voiceResponse", handler)
        resolve(event.result)
      }
    }
    approvalEvents.on("voiceResponse", handler)

    // Clean up listener after timeout
    setTimeout(() => {
      approvalEvents.off("voiceResponse", handler)
    }, APPROVAL_TIMEOUT_MS + 1000)
  })

  // Wait for any response
  const result = await Promise.race([
    promise.then((approved) => ({
      approved,
      showMore: false,
      cancelled: false,
    })),
    voicePromise,
    timeoutPromise,
  ])

  return result
}

/**
 * Handle a voice transcript for pending approvals.
 * Called by the voice input system when audio is transcribed.
 */
export function handleVoiceTranscript(transcript: string): boolean {
  if (pendingApprovals.size === 0) {
    return false
  }

  const result = parseApprovalResponse(transcript)
  if (!result) {
    logApp(`[ApprovalInterrupt] Voice transcript not recognized as approval: "${transcript}"`)
    return false
  }

  // Get the most recent pending approval
  const entries = Array.from(pendingApprovals.entries())
  if (entries.length === 0) {
    return false
  }

  const [approvalId] = entries[entries.length - 1]

  logApp(`[ApprovalInterrupt] Voice response for ${approvalId}: ${result.approved ? "approved" : "denied"}`)

  // Emit voice response event
  approvalEvents.emit("voiceResponse", { approvalId, result })

  return true
}

/**
 * Register a custom approval handler for voice-based approval.
 * This allows the voice input system to provide approval responses.
 */
export function registerApprovalHandler(
  handler: ApprovalHandler
): void {
  customApprovalHandler = handler
  logApp("[ApprovalInterrupt] Custom approval handler registered")
}

/**
 * Unregister the custom approval handler.
 */
export function unregisterApprovalHandler(): void {
  customApprovalHandler = null
  logApp("[ApprovalInterrupt] Custom approval handler unregistered")
}

/**
 * Check if there are any pending approvals.
 */
export function hasPendingApproval(): boolean {
  return pendingApprovals.size > 0
}

/**
 * Get all pending approvals.
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return Array.from(pendingApprovals.values())
}

/**
 * Get the count of pending approvals.
 */
export function getPendingApprovalCount(): number {
  return pendingApprovals.size
}

/**
 * Cancel a specific pending approval.
 */
export function cancelApproval(approvalId: string): boolean {
  const request = pendingApprovals.get(approvalId)
  if (request) {
    pendingApprovals.delete(approvalId)
    approvalEvents.emit("approvalCompleted", {
      approvalId,
      result: { approved: false, cancelled: true },
    })
    logApp(`[ApprovalInterrupt] Cancelled approval: ${approvalId}`)
    return true
  }
  return false
}

/**
 * Cancel all pending approvals (e.g., on session stop).
 */
export function cancelAllApprovals(): void {
  const entries = Array.from(pendingApprovals.entries())
  for (const [approvalId] of entries) {
    approvalEvents.emit("approvalCompleted", {
      approvalId,
      result: { approved: false, cancelled: true },
    })
  }
  pendingApprovals.clear()
  logApp("[ApprovalInterrupt] Cancelled all pending approvals")
}

/**
 * Manually respond to an approval (for UI-based responses).
 */
export function respondToApproval(
  sessionId: string,
  approved: boolean,
  showMore?: boolean
): boolean {
  // Find the pending approval for this session
  const entries = Array.from(pendingApprovals.entries())
  for (const [approvalId, request] of entries) {
    if (request.sessionId === sessionId) {
      const result: ApprovalResult = { approved, showMore }
      approvalEvents.emit("voiceResponse", { approvalId, result })
      logApp(`[ApprovalInterrupt] Manual response for ${approvalId}: ${approved ? "approved" : "denied"}`)
      return true
    }
  }
  return false
}

