/**
 * Voice Agent Pipeline
 * 
 * Routes voice input directly to Claude Code via ACP, then synthesizes response with local TTS.
 * This replaces the built-in LLM with Claude Code as the brain.
 * 
 * Flow: Voice → Local STT → Claude Code (via ACP) → Response → Local TTS → Audio
 */

import { transcribeLocal, synthesizeLocal, isLocalSTTAvailable, isLocalTTSAvailable } from "./local-audio"
import { acpService } from "./acp-service"
import { configStore } from "./config"
import { logApp } from "./debug"
import { emitAgentProgress } from "./emit-agent-progress"
import { agentSessionTracker } from "./agent-session-tracker"

export interface VoiceCommandResult {
  success: boolean
  transcript?: string
  response?: string
  error?: string
  sessionId?: string
}

export interface VoiceCommandOptions {
  /** Name of the ACP agent to use (defaults to first available Claude Code agent) */
  agentName?: string
  /** Working directory context for the agent */
  workingDirectory?: string
  /** Whether to speak the response via TTS */
  speakResponse?: boolean
  /** Optional existing session ID to continue conversation */
  sessionId?: string
}

/**
 * Find the best available Claude Code agent (excludes internal agents)
 */
function findClaudeCodeAgent(): string | null {
  const config = configStore.get()
  const agents = config.acpAgents || []
  
  // Filter to only external agents (stdio or remote, not internal)
  const externalAgents = agents.filter(a => 
    a.enabled !== false && 
    !a.isInternal && 
    a.connection?.type !== 'internal'
  )
  
  // Look for Claude Code agent (by name pattern)
  const claudeAgent = externalAgents.find(a => 
    a.name.toLowerCase().includes('claude') ||
    a.name.toLowerCase().includes('code') ||
    a.connection?.command?.includes('claude')
  )
  
  if (claudeAgent) {
    return claudeAgent.name
  }
  
  // Fall back to first enabled external agent
  return externalAgents[0]?.name || null
}

/**
 * Process a voice command through the pipeline:
 * 1. Transcribe audio with local STT
 * 2. Send to Claude Code via ACP
 * 3. Synthesize response with local TTS
 * 4. Return result
 */
export async function processVoiceCommand(
  audioBuffer: ArrayBuffer,
  options: VoiceCommandOptions = {}
): Promise<VoiceCommandResult> {
  const { 
    agentName = findClaudeCodeAgent(),
    workingDirectory,
    speakResponse = true,
    sessionId: existingSessionId
  } = options

  if (!agentName) {
    return {
      success: false,
      error: "No Claude Code agent configured. Please add an ACP agent in settings."
    }
  }

  // Create session for tracking
  const sessionId = existingSessionId || agentSessionTracker.startSession(
    undefined, // conversationId
    "Voice Command",
    false // not snoozed, show panel
  )

  try {
    // Step 1: Transcribe with local STT
    logApp(`[VoicePipeline] Starting transcription for session ${sessionId}`)
    
    await emitAgentProgress({
      sessionId,
      currentIteration: 0,
      maxIterations: 3,
      steps: [{
        id: `transcribe_${Date.now()}`,
        type: "thinking",
        title: "Listening...",
        description: "Transcribing your voice input",
        status: "in_progress",
        timestamp: Date.now(),
      }],
      isComplete: false,
    })

    const transcriptResult = await transcribeLocal(audioBuffer)
    
    if (!transcriptResult.success || !transcriptResult.text) {
      await emitAgentProgress({
        sessionId,
        currentIteration: 1,
        maxIterations: 3,
        steps: [{
          id: `transcribe_error_${Date.now()}`,
          type: "thinking",
          title: "Transcription failed",
          description: transcriptResult.error || "Could not transcribe audio",
          status: "error",
          timestamp: Date.now(),
        }],
        isComplete: true,
      })
      
      return {
        success: false,
        error: transcriptResult.error || "Transcription failed",
        sessionId,
      }
    }

    const transcript = transcriptResult.text
    logApp(`[VoicePipeline] Transcribed: "${transcript}"`)

    await emitAgentProgress({
      sessionId,
      currentIteration: 1,
      maxIterations: 3,
      steps: [{
        id: `transcribe_done_${Date.now()}`,
        type: "thinking",
        title: "Transcribed",
        description: transcript,
        status: "completed",
        timestamp: Date.now(),
      }],
      isComplete: false,
    })

    // Notify renderer of transcript via agent progress
    // (voiceTranscript handler not yet implemented, using progress events instead)

    // Step 2: Send to Claude Code via ACP
    logApp(`[VoicePipeline] Sending to agent: ${agentName}`)
    
    await emitAgentProgress({
      sessionId,
      currentIteration: 1,
      maxIterations: 3,
      steps: [{
        id: `agent_${Date.now()}`,
        type: "tool_call",
        title: "Processing with Claude Code",
        description: `Sending to ${agentName}...`,
        status: "in_progress",
        timestamp: Date.now(),
      }],
      isComplete: false,
    })

    const agentResponse = await acpService.runTask({
      agentName,
      input: transcript,
      context: workingDirectory ? `Working directory: ${workingDirectory}` : undefined,
    })

    if (!agentResponse.success) {
      await emitAgentProgress({
        sessionId,
        currentIteration: 2,
        maxIterations: 3,
        steps: [{
          id: `agent_error_${Date.now()}`,
          type: "tool_call",
          title: "Agent failed",
          description: agentResponse.error || "Agent did not respond",
          status: "error",
          timestamp: Date.now(),
        }],
        isComplete: true,
      })
      
      return {
        success: false,
        transcript,
        error: agentResponse.error || "Agent failed to respond",
        sessionId,
      }
    }

    const response = agentResponse.result || "Task completed."
    logApp(`[VoicePipeline] Agent response: "${response.substring(0, 200)}..."`)

    await emitAgentProgress({
      sessionId,
      currentIteration: 2,
      maxIterations: 3,
      steps: [{
        id: `agent_done_${Date.now()}`,
        type: "tool_call",
        title: "Claude Code responded",
        description: response.length > 200 ? response.substring(0, 200) + "..." : response,
        status: "completed",
        timestamp: Date.now(),
      }],
      isComplete: false,
    })

    // Step 3: Synthesize and speak response with local TTS
    if (speakResponse && isLocalTTSAvailable()) {
      logApp(`[VoicePipeline] Synthesizing TTS response`)
      
      await emitAgentProgress({
        sessionId,
        currentIteration: 2,
        maxIterations: 3,
        steps: [{
          id: `tts_${Date.now()}`,
          type: "thinking",
          title: "Speaking response...",
          description: "Synthesizing speech",
          status: "in_progress",
          timestamp: Date.now(),
        }],
        isComplete: false,
      })

      // Extract a summary for TTS (don't speak entire response if it's long)
      const ttsText = extractSummaryForTTS(response)
      
      try {
        await synthesizeLocal(ttsText)
        logApp(`[VoicePipeline] TTS complete`)
      } catch (ttsError) {
        logApp(`[VoicePipeline] TTS failed: ${ttsError}`)
        // Don't fail the whole operation if TTS fails
      }
    }

    // Mark complete
    await emitAgentProgress({
      sessionId,
      currentIteration: 3,
      maxIterations: 3,
      steps: [{
        id: `complete_${Date.now()}`,
        type: "thinking",
        title: "Complete",
        description: "Voice command processed successfully",
        status: "completed",
        timestamp: Date.now(),
      }],
      isComplete: true,
    })

    agentSessionTracker.completeSession(sessionId, "Voice command completed")

    return {
      success: true,
      transcript,
      response,
      sessionId,
    }

  } catch (error) {
    logApp(`[VoicePipeline] Error: ${error}`)
    
    await emitAgentProgress({
      sessionId,
      currentIteration: 0,
      maxIterations: 3,
      steps: [{
        id: `error_${Date.now()}`,
        type: "thinking",
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        status: "error",
        timestamp: Date.now(),
      }],
      isComplete: true,
    })

    agentSessionTracker.completeSession(sessionId, "Voice command failed")

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    }
  }
}

/**
 * Extract a concise summary suitable for TTS from a potentially long response.
 * Claude Code responses can be verbose with code snippets, etc.
 */
function extractSummaryForTTS(response: string): string {
  // If response is short, use it directly
  if (response.length <= 300) {
    return response
  }

  // Try to find a summary-like first sentence
  const lines = response.split('\n').filter(l => l.trim())
  const firstMeaningfulLine = lines.find(l => 
    !l.startsWith('```') && 
    !l.startsWith('#') && 
    !l.startsWith('-') &&
    l.length > 20
  )

  if (firstMeaningfulLine && firstMeaningfulLine.length <= 300) {
    return firstMeaningfulLine
  }

  // Truncate to first 300 chars at word boundary
  const truncated = response.substring(0, 300)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 200 ? truncated.substring(0, lastSpace) : truncated) + "..."
}

/**
 * Check if voice pipeline is available
 */
export function isVoicePipelineAvailable(): {
  available: boolean
  hasSTT: boolean
  hasTTS: boolean
  hasAgent: boolean
  agentName?: string
} {
  const hasSTT = isLocalSTTAvailable()
  const hasTTS = isLocalTTSAvailable()
  const agentName = findClaudeCodeAgent()
  const hasAgent = !!agentName

  return {
    available: hasSTT && hasAgent,
    hasSTT,
    hasTTS,
    hasAgent,
    agentName: agentName || undefined,
  }
}
