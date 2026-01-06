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
import { parseVoiceCommand, type ParsedVoiceCommand, type VoiceCommandContext } from "./voice-command-parser"
import { handleVoiceNavigation } from "./voice-navigation-handler"
import { handleVoiceStatus } from "./voice-status-handler"
import { resolveVoiceTarget, getCurrentTargetContext } from "./voice-targeting"
import { playAudioCue, playThinkingCue, playSuccessCue, playErrorCue, playNavigationCue } from "./audio-cues"

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
  /** Optional project ID for command context */
  projectId?: string
  /** Optional agent session ID for command context */
  agentSessionId?: string
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
 * Get the working directory for the active project
 * Returns the default directory of the active project, or undefined if no project is active
 */
function getActiveProjectCwd(): string | undefined {
  const config = configStore.get()
  const activeProjectId = config.activeProjectId

  if (!activeProjectId) {
    return undefined
  }

  const projects = config.projects || []
  const activeProject = projects.find(p => p.id === activeProjectId)

  if (!activeProject || activeProject.directories.length === 0) {
    return undefined
  }

  // Find the default directory, or use the first one
  const defaultDir = activeProject.directories.find(d => d.isDefault) || activeProject.directories[0]
  return defaultDir?.path
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

  // Build conversation history for progress updates
  const conversationHistory: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: number
    isComplete?: boolean
  }> = []

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
      conversationHistory,
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
        conversationHistory,
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

    // Add user message to conversation history
    conversationHistory.push({
      role: "user",
      content: transcript,
      timestamp: Date.now(),
      isComplete: true,
    })

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
      conversationHistory,
      isComplete: false,
    })

    // Parse the voice command to determine type and target
    const commandContext: VoiceCommandContext = {
      focusedProject: options.projectId,
      focusedAgent: options.agentSessionId,
      // Get current UI focus from the main process state if available
    }

    const parsedCommand = parseVoiceCommand(transcript, commandContext)
    logApp(`[VoicePipeline] Parsed command type: ${parsedCommand.type}`, {
      target: parsedCommand.target,
      navigation: parsedCommand.navigation,
      statusQuery: parsedCommand.statusQuery,
      controlAction: parsedCommand.controlAction,
      approvalAction: parsedCommand.approvalAction,
    })

    // Handle different command types
    switch (parsedCommand.type) {
      case 'navigation': {
        await emitAgentProgress({
          sessionId,
          currentIteration: 2,
          maxIterations: 3,
          steps: [{
            id: `navigation_${Date.now()}`,
            type: "thinking",
            title: "Navigating...",
            description: `Processing navigation: ${parsedCommand.navigation}`,
            status: "in_progress",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: false,
        })

        const navResult = await handleVoiceNavigation(parsedCommand)

        conversationHistory.push({
          role: "assistant",
          content: navResult.success
            ? `Navigated to ${navResult.navigatedTo || 'destination'}`
            : `Navigation failed: ${navResult.error}`,
          timestamp: Date.now(),
          isComplete: true,
        })

        // Play audio feedback for navigation result
        if (navResult.success) {
          // Play navigation sound with spoken confirmation
          await playNavigationCue(navResult.navigatedTo)
        } else {
          // Play error sound for failed navigation
          await playErrorCue(`Could not navigate: ${navResult.error || 'unknown error'}`)
        }

        await emitAgentProgress({
          sessionId,
          currentIteration: 3,
          maxIterations: 3,
          steps: [{
            id: `navigation_done_${Date.now()}`,
            type: "thinking",
            title: navResult.success ? "Navigated" : "Navigation failed",
            description: navResult.success
              ? `Navigated to ${navResult.navigatedTo || 'destination'}`
              : navResult.error || "Navigation failed",
            status: navResult.success ? "completed" : "error",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: true,
        })

        agentSessionTracker.completeSession(sessionId, "Navigation command completed")

        return {
          success: navResult.success,
          transcript,
          response: navResult.success
            ? `Navigated to ${navResult.navigatedTo}`
            : navResult.error,
          error: navResult.success ? undefined : navResult.error,
          sessionId,
        }
      }

      case 'status': {
        await emitAgentProgress({
          sessionId,
          currentIteration: 2,
          maxIterations: 3,
          steps: [{
            id: `status_${Date.now()}`,
            type: "thinking",
            title: "Checking status...",
            description: `Gathering ${parsedCommand.statusQuery} status`,
            status: "in_progress",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: false,
        })

        const statusResult = await handleVoiceStatus(parsedCommand)

        conversationHistory.push({
          role: "assistant",
          content: statusResult.spokenSummary,
          timestamp: Date.now(),
          isComplete: true,
        })

        await emitAgentProgress({
          sessionId,
          currentIteration: 3,
          maxIterations: 3,
          steps: [{
            id: `status_done_${Date.now()}`,
            type: "thinking",
            title: statusResult.success ? "Status retrieved" : "Status check failed",
            description: statusResult.spokenSummary || statusResult.error || "Status check complete",
            status: statusResult.success ? "completed" : "error",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: true,
        })

        agentSessionTracker.completeSession(sessionId, "Status command completed")

        return {
          success: statusResult.success,
          transcript,
          response: statusResult.spokenSummary,
          error: statusResult.success ? undefined : statusResult.error,
          sessionId,
        }
      }

      case 'approval': {
        // Handle approval commands (approve/deny pending tool calls)
        // TODO: Implement approval handler when tool call approval system is ready
        const approvalMessage = parsedCommand.approvalAction === 'approve'
          ? "Approval noted. Approval system integration pending."
          : parsedCommand.approvalAction === 'deny'
          ? "Denial noted. Approval system integration pending."
          : "More details requested. Approval system integration pending."

        conversationHistory.push({
          role: "assistant",
          content: approvalMessage,
          timestamp: Date.now(),
          isComplete: true,
        })

        await emitAgentProgress({
          sessionId,
          currentIteration: 3,
          maxIterations: 3,
          steps: [{
            id: `approval_${Date.now()}`,
            type: "thinking",
            title: "Approval command",
            description: approvalMessage,
            status: "completed",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: true,
        })

        agentSessionTracker.completeSession(sessionId, "Approval command completed")

        return {
          success: true,
          transcript,
          response: approvalMessage,
          sessionId,
        }
      }

      case 'control': {
        // Handle control commands (stop/pause/resume)
        // TODO: Implement control handler when agent control system is ready
        const controlMessage = `Control action "${parsedCommand.controlAction}" noted. Control system integration pending.`

        conversationHistory.push({
          role: "assistant",
          content: controlMessage,
          timestamp: Date.now(),
          isComplete: true,
        })

        await emitAgentProgress({
          sessionId,
          currentIteration: 3,
          maxIterations: 3,
          steps: [{
            id: `control_${Date.now()}`,
            type: "thinking",
            title: "Control command",
            description: controlMessage,
            status: "completed",
            timestamp: Date.now(),
          }],
          conversationHistory,
          isComplete: true,
        })

        agentSessionTracker.completeSession(sessionId, "Control command completed")

        return {
          success: true,
          transcript,
          response: controlMessage,
          sessionId,
        }
      }

      case 'prompt':
      default:
        // Continue with existing Claude Code routing
        // Resolve target if specified, otherwise use default
        break
    }

    // For 'prompt' type commands, resolve the target and send to Claude Code
    const targetContext = getCurrentTargetContext()
    if (parsedCommand.target) {
      const resolvedTarget = resolveVoiceTarget(parsedCommand.target, targetContext)
      if (resolvedTarget.success) {
        logApp(`[VoicePipeline] Resolved voice target: projectId=${resolvedTarget.projectId}, agentSessionId=${resolvedTarget.agentSessionId}`)
      } else {
        logApp(`[VoicePipeline] Could not resolve voice target: ${resolvedTarget.error}`)
      }
    }

    // Step 2: Send to Claude Code via ACP
    logApp(`[VoicePipeline] Sending to agent: ${agentName}`)

    // Play thinking sound to indicate processing
    await playThinkingCue()

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
      conversationHistory,
      isComplete: false,
    })

    // Use provided workingDirectory or get from active project
    const cwd = workingDirectory || getActiveProjectCwd()

    // Track accumulated streaming content for UI updates
    let streamingText = ""
    let lastEmitTime = 0
    const STREAM_EMIT_THROTTLE_MS = 100

    // Set up listener for ACP session updates to enable streaming
    const sessionUpdateHandler = (event: {
      agentName: string
      sessionId: string
      content?: Array<{ type: string; text?: string; name?: string }>
      isComplete?: boolean
    }) => {
      // Only handle updates from the agent we're calling
      if (event.agentName !== agentName) return

      // Extract text content from the update
      if (event.content && Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === "text" && block.text) {
            streamingText += block.text
          }
        }
      }

      // Throttle UI updates to avoid spam
      const now = Date.now()
      if (now - lastEmitTime < STREAM_EMIT_THROTTLE_MS && !event.isComplete) {
        return
      }
      lastEmitTime = now

      // Emit streaming progress to UI
      if (streamingText) {
        emitAgentProgress({
          sessionId,
          currentIteration: 1,
          maxIterations: 3,
          steps: [{
            id: `agent_streaming_${Date.now()}`,
            type: "tool_call",
            title: "Claude Code responding",
            description: "Streaming response...",
            status: "in_progress",
            timestamp: Date.now(),
          }],
          conversationHistory: [
            ...conversationHistory,
            {
              role: "assistant" as const,
              content: streamingText,
              timestamp: Date.now(),
              isComplete: false,
            }
          ],
          streamingContent: {
            text: streamingText,
            isStreaming: !event.isComplete,
          },
          isComplete: false,
        }).catch(err => {
          logApp(`[VoicePipeline] Failed to emit streaming progress: ${err}`)
        })
      }
    }

    // Register the listener
    acpService.on("sessionUpdate", sessionUpdateHandler)

    let agentResponse: { success: boolean; result?: string; error?: string }
    try {
      agentResponse = await acpService.runTask({
        agentName,
        input: transcript,
        cwd,
        context: cwd ? `Working directory: ${cwd}` : undefined,
      })
    } finally {
      // Always clean up the listener
      acpService.off("sessionUpdate", sessionUpdateHandler)
    }

    if (!agentResponse.success) {
      conversationHistory.push({
        role: "assistant",
        content: `Error: ${agentResponse.error || "Agent did not respond"}`,
        timestamp: Date.now(),
        isComplete: true,
      })

      // Play error sound
      await playErrorCue("Something went wrong with the agent")

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
        conversationHistory,
        isComplete: true,
      })

      return {
        success: false,
        transcript,
        error: agentResponse.error || "Agent failed to respond",
        sessionId,
      }
    }

    // Use accumulated streaming content if available, otherwise use final response
    const response = streamingText || agentResponse.result || "Task completed."
    logApp(`[VoicePipeline] Agent response: "${response.substring(0, 200)}..."`)

    // Add assistant response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: response,
      timestamp: Date.now(),
      isComplete: true,
    })

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
      conversationHistory,
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
        conversationHistory,
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

    // Play success sound for completed command
    await playSuccessCue()

    // Mark complete with full conversation history
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
      conversationHistory,
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

    // Add error message to conversation history if we have content
    if (conversationHistory.length > 0) {
      conversationHistory.push({
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        isComplete: true,
      })
    }

    // Play error sound for failed command
    await playErrorCue()

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
      conversationHistory,
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

export interface TextCommandOptions {
  /** Name of the ACP agent to use (defaults to first available Claude Code agent) */
  agentName?: string
  /** Working directory context for the agent */
  workingDirectory?: string
  /** Whether to speak the response via TTS */
  speakResponse?: boolean
  /** Optional existing session ID to continue conversation */
  sessionId?: string
}

export interface TextCommandResult {
  success: boolean
  response?: string
  error?: string
  sessionId?: string
}

/**
 * Process a text command through Claude Code via ACP.
 * Similar to processVoiceCommand but without STT step.
 * Used when voiceToClaudeCodeEnabled is true for text input.
 */
export async function processTextCommand(
  text: string,
  options: TextCommandOptions = {}
): Promise<TextCommandResult> {
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
    "Text Command",
    false // not snoozed, show panel
  )

  // Build conversation history for progress updates
  const conversationHistory: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: number
    isComplete?: boolean
  }> = []

  const userTimestamp = Date.now()

  try {
    logApp(`[TextPipeline] Processing text: ${text.substring(0, 50)}...`)

    // Add user message to conversation history
    conversationHistory.push({
      role: "user",
      content: text,
      timestamp: userTimestamp,
      isComplete: true,
    })

    // Play thinking sound to indicate processing
    await playThinkingCue()

    await emitAgentProgress({
      sessionId,
      currentIteration: 1,
      maxIterations: 2,
      steps: [{
        id: `agent_${Date.now()}`,
        type: "tool_call",
        title: "Processing with Claude Code",
        description: `Sending to ${agentName}...`,
        status: "in_progress",
        timestamp: Date.now(),
      }],
      conversationHistory,
      isComplete: false,
    })

    // Use provided workingDirectory or get from active project
    const cwd = workingDirectory || getActiveProjectCwd()

    // Track accumulated streaming content for UI updates
    let streamingText = ""
    let lastEmitTime = 0
    const STREAM_EMIT_THROTTLE_MS = 100

    // Set up listener for ACP session updates to enable streaming
    // We listen to the agent we're about to call and forward updates to our UI session
    const sessionUpdateHandler = (event: {
      agentName: string
      sessionId: string
      content?: Array<{ type: string; text?: string; name?: string }>
      isComplete?: boolean
    }) => {
      // Only handle updates from the agent we're calling
      if (event.agentName !== agentName) return

      // Extract text content from the update
      if (event.content && Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === "text" && block.text) {
            streamingText += block.text
          }
        }
      }

      // Throttle UI updates to avoid spam
      const now = Date.now()
      if (now - lastEmitTime < STREAM_EMIT_THROTTLE_MS && !event.isComplete) {
        return
      }
      lastEmitTime = now

      // Emit streaming progress to UI
      if (streamingText) {
        emitAgentProgress({
          sessionId,
          currentIteration: 1,
          maxIterations: 2,
          steps: [{
            id: `agent_streaming_${Date.now()}`,
            type: "tool_call",
            title: "Claude Code responding",
            description: "Streaming response...",
            status: "in_progress",
            timestamp: Date.now(),
          }],
          conversationHistory: [
            ...conversationHistory,
            {
              role: "assistant" as const,
              content: streamingText,
              timestamp: Date.now(),
              isComplete: false,
            }
          ],
          streamingContent: {
            text: streamingText,
            isStreaming: !event.isComplete,
          },
          isComplete: false,
        }).catch(err => {
          logApp(`[TextPipeline] Failed to emit streaming progress: ${err}`)
        })
      }
    }

    // Register the listener
    acpService.on("sessionUpdate", sessionUpdateHandler)

    let response: string
    try {
      const agentResponse = await acpService.runTask({
        agentName,
        input: text,
        cwd,
        context: cwd ? `Working directory: ${cwd}` : undefined,
      })

      if (!agentResponse.success) {
        throw new Error(agentResponse.error || "Agent returned unsuccessful response")
      }

      // Use accumulated streaming content if available, otherwise use final response
      response = streamingText || agentResponse.result || "No response from agent"
      logApp(`[TextPipeline] Got response: ${response.substring(0, 100)}...`)
    } finally {
      // Always clean up the listener
      acpService.off("sessionUpdate", sessionUpdateHandler)
    }

    // Add assistant response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: response,
      timestamp: Date.now(),
      isComplete: true,
    })

    // Step 2: Optional TTS
    const config = configStore.get()
    const hasTTS = isLocalTTSAvailable()

    if (speakResponse && config.ttsEnabled && hasTTS) {
      logApp(`[TextPipeline] Synthesizing TTS response`)

      await emitAgentProgress({
        sessionId,
        currentIteration: 2,
        maxIterations: 2,
        steps: [{
          id: `tts_${Date.now()}`,
          type: "thinking",
          title: "Speaking response...",
          description: "Synthesizing speech",
          status: "in_progress",
          timestamp: Date.now(),
        }],
        conversationHistory,
        isComplete: false,
      })

      const ttsText = extractSummaryForTTS(response)

      try {
        await synthesizeLocal(ttsText)
        logApp(`[TextPipeline] TTS complete`)
      } catch (ttsError) {
        logApp(`[TextPipeline] TTS failed: ${ttsError}`)
      }
    }

    // Play success sound for completed command
    await playSuccessCue()

    // Mark complete with full conversation history
    await emitAgentProgress({
      sessionId,
      currentIteration: 2,
      maxIterations: 2,
      steps: [{
        id: `complete_${Date.now()}`,
        type: "thinking",
        title: "Complete",
        description: "Text command processed successfully",
        status: "completed",
        timestamp: Date.now(),
      }],
      conversationHistory,
      isComplete: true,
    })

    agentSessionTracker.completeSession(sessionId, "Text command completed")

    return {
      success: true,
      response,
      sessionId,
    }

  } catch (error) {
    logApp(`[TextPipeline] Error: ${error}`)

    // Add error message to conversation history if we have a user message
    if (conversationHistory.length > 0) {
      conversationHistory.push({
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        isComplete: true,
      })
    }

    // Play error sound for failed command
    await playErrorCue()

    await emitAgentProgress({
      sessionId,
      currentIteration: 0,
      maxIterations: 2,
      steps: [{
        id: `error_${Date.now()}`,
        type: "thinking",
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        status: "error",
        timestamp: Date.now(),
      }],
      conversationHistory,
      isComplete: true,
    })

    agentSessionTracker.completeSession(sessionId, "Text command failed")

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    }
  }
}
