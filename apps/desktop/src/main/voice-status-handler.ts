/**
 * Voice Status Handler
 * 
 * Handles status query voice commands by gathering agent/project status
 * and speaking a summary via TTS.
 * 
 * Status commands:
 * - "What's everyone working on?" → Summary of all active agents
 * - "Status" / "What's the status?" → Current overall status
 * - "What is [name] doing?" → Status of specific project/agent
 * - "Any agents need help?" → List agents that need approval or have errors
 */

import type { ParsedVoiceCommand } from "./voice-command-parser"
import {
  resolveVoiceTarget,
  getCurrentTargetContext,
} from "./voice-targeting"
import { agentSessionTracker, type AgentSession } from "./agent-session-tracker"
import { synthesizeLocal, isLocalTTSAvailable } from "./local-audio"
import { configStore } from "./config"
import { logApp } from "./debug"

// Maximum sentences for TTS summary (keep it brief)
const MAX_TTS_SENTENCES = 4

// TTS verbosity modes
export type TTSVerbosity = "brief" | "verbose"

// Module-level verbosity setting (can be toggled at runtime)
let ttsVerbosity: TTSVerbosity = "brief"

/**
 * Set TTS verbosity mode
 */
export function setTTSVerbosity(mode: TTSVerbosity): void {
  ttsVerbosity = mode
  logApp(`[VoiceStatus] TTS verbosity set to: ${mode}`)
}

/**
 * Get current TTS verbosity mode
 */
export function getTTSVerbosity(): TTSVerbosity {
  return ttsVerbosity
}

export interface StatusResult {
  success: boolean
  spokenSummary: string
  detailedStatus?: {
    activeCount: number
    waitingCount: number
    errorCount: number
    agents: Array<{
      name: string
      projectName?: string
      status: 'working' | 'waiting' | 'error' | 'completed' | 'idle'
      currentTask?: string
    }>
  }
  error?: string
}

/**
 * Map AgentSession status to a user-friendly status string
 */
function mapSessionStatus(session: AgentSession): 'working' | 'waiting' | 'error' | 'completed' | 'idle' {
  switch (session.status) {
    case 'active':
      // Check if waiting for approval (indicated by lastActivity containing approval-related text)
      if (session.lastActivity?.toLowerCase().includes('waiting') ||
          session.lastActivity?.toLowerCase().includes('approval')) {
        return 'waiting'
      }
      return 'working'
    case 'completed':
      return 'completed'
    case 'error':
      return 'error'
    case 'stopped':
      return 'idle'
    default:
      return 'idle'
  }
}

/**
 * Speak a message via TTS if enabled
 */
async function speakMessage(message: string): Promise<void> {
  const config = configStore.get()
  
  if (!config.ttsEnabled || !config.ttsAutoPlay) {
    logApp("[VoiceStatus] TTS disabled, skipping speech")
    return
  }
  
  if (!isLocalTTSAvailable()) {
    logApp("[VoiceStatus] TTS not available")
    return
  }
  
  try {
    await synthesizeLocal(message)
    logApp(`[VoiceStatus] Spoke: "${message}"`)
  } catch (error) {
    logApp(`[VoiceStatus] TTS error: ${error}`)
    // Don't fail status if TTS fails
  }
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(startTimeMs: number): string {
  const durationMs = Date.now() - startTimeMs
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `for ${hours} hour${hours === 1 ? '' : 's'}`
  } else if (minutes > 0) {
    return `for ${minutes} minute${minutes === 1 ? '' : 's'}`
  } else if (seconds > 30) {
    return `for about a minute`
  }
  return 'just started'
}

/**
 * Build natural-sounding status description for an agent
 */
function buildAgentDescription(
  agent: { name: string; status: 'working' | 'waiting' | 'error' | 'completed' | 'idle'; currentTask?: string },
  session?: AgentSession
): string {
  const name = agent.name
  const timeContext = session?.startedAt ? formatDuration(session.startedAt) : ''

  switch (agent.status) {
    case 'working':
      if (agent.currentTask && ttsVerbosity === 'verbose') {
        return `${name} has been working ${timeContext} on ${truncateTask(agent.currentTask)}`
      }
      return `${name} is working${timeContext ? ' ' + timeContext : ''}`
    case 'waiting':
      return `${name} is waiting for your approval`
    case 'error':
      return `${name} ran into an error`
    case 'completed':
      return `${name} finished${timeContext ? ' ' + timeContext + ' ago' : ''}`
    case 'idle':
      return `${name} is idle`
    default:
      return `${name} is ${agent.status}`
  }
}

/**
 * Truncate task description for TTS
 */
function truncateTask(task: string): string {
  // Remove newlines and extra whitespace
  const cleaned = task.replace(/\s+/g, ' ').trim()
  // Limit length
  if (cleaned.length > 50) {
    return cleaned.substring(0, 50).trim() + '...'
  }
  return cleaned
}

/**
 * Limit summary to max sentences
 */
function limitSentences(text: string, maxSentences: number = MAX_TTS_SENTENCES): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  if (sentences.length <= maxSentences) {
    return text
  }
  return sentences.slice(0, maxSentences).join(' ')
}

/**
 * Build a concise, natural spoken summary from agent sessions
 */
function buildSpokenSummary(
  agents: Array<{
    name: string
    status: 'working' | 'waiting' | 'error' | 'completed' | 'idle'
    currentTask?: string
  }>,
  sessions?: AgentSession[]
): string {
  if (agents.length === 0) {
    return "No agents are currently active. Everything is quiet."
  }

  const working = agents.filter(a => a.status === 'working')
  const waiting = agents.filter(a => a.status === 'waiting')
  const errors = agents.filter(a => a.status === 'error')

  const parts: string[] = []

  // Natural opening based on count
  if (agents.length === 1) {
    parts.push(`You have 1 agent working.`)
  } else {
    parts.push(`You have ${agents.length} agents working.`)
  }

  // Find matching sessions for time context
  const findSession = (agentName: string) =>
    sessions?.find(s => s.conversationTitle === agentName || s.id === agentName)

  // Describe up to 2-3 agents naturally (brief mode = 2, verbose = 3)
  const maxAgents = ttsVerbosity === 'verbose' ? 3 : 2
  const agentsToDescribe = agents.slice(0, maxAgents)

  for (const agent of agentsToDescribe) {
    const session = findSession(agent.name)
    parts.push(buildAgentDescription(agent, session) + '.')
  }

  if (agents.length > maxAgents) {
    parts.push(`Plus ${agents.length - maxAgents} more.`)
  }

  // Highlight actionable items naturally
  if (waiting.length > 0) {
    const waitingNames = waiting.slice(0, 2).map(a => a.name).join(' and ')
    if (waiting.length === 1) {
      parts.push(`${waitingNames} needs your approval.`)
    } else if (waiting.length === 2) {
      parts.push(`${waitingNames} need your approval.`)
    } else {
      parts.push(`${waiting.length} agents need your approval.`)
    }
  }

  if (errors.length > 0) {
    if (errors.length === 1) {
      parts.push(`${errors[0].name} has an error you should check.`)
    } else {
      parts.push(`${errors.length} agents have errors to check.`)
    }
  }

  // Combine and limit
  const fullSummary = parts.join(' ')
  return limitSentences(fullSummary)
}

/**
 * Get human-readable status text
 */
function getStatusText(status: 'working' | 'waiting' | 'error' | 'completed' | 'idle'): string {
  switch (status) {
    case 'working': return 'working'
    case 'waiting': return 'waiting for your approval'
    case 'error': return 'stopped with an error'
    case 'completed': return 'finished'
    case 'idle': return 'idle'
  }
}

/**
 * Get detailed status for all active agents
 * Returns both the status data and the underlying sessions for time context
 */
function getAllAgentStatus(): { detailedStatus: StatusResult['detailedStatus']; sessions: AgentSession[] } {
  const sessions = agentSessionTracker.getActiveSessions()

  const agents = sessions.map(session => ({
    name: session.conversationTitle || 'Untitled',
    projectName: undefined, // Agent sessions don't track workspace directly
    status: mapSessionStatus(session),
    currentTask: session.lastActivity,
  }))

  return {
    detailedStatus: {
      activeCount: agents.filter(a => a.status === 'working').length,
      waitingCount: agents.filter(a => a.status === 'waiting').length,
      errorCount: agents.filter(a => a.status === 'error').length,
      agents,
    },
    sessions,
  }
}

/**
 * Handle status voice command
 */
export async function handleVoiceStatus(
  command: ParsedVoiceCommand
): Promise<StatusResult> {
  if (command.type !== 'status' || !command.statusQuery) {
    return {
      success: false,
      spokenSummary: '',
      error: 'Not a status command',
    }
  }

  logApp(`[VoiceStatus] Handling status query: ${command.statusQuery}`, {
    target: command.target,
    content: command.content
  })

  switch (command.statusQuery) {
    case 'all':
      return handleAllStatus()
    case 'specific':
      return handleSpecificStatus(command)
    case 'needsHelp':
      return handleNeedsHelpStatus()
    default:
      return {
        success: false,
        spokenSummary: '',
        error: `Unknown status query type: ${command.statusQuery}`,
      }
  }
}

/**
 * Handle "What's everyone working on?" / "Status" / "What's the status?"
 */
async function handleAllStatus(): Promise<StatusResult> {
  const { detailedStatus, sessions } = getAllAgentStatus()
  const spokenSummary = buildSpokenSummary(detailedStatus?.agents ?? [], sessions)

  // Speak the summary
  await speakMessage(spokenSummary)

  return {
    success: true,
    spokenSummary,
    detailedStatus,
  }
}

/**
 * Handle "What is [name] doing?"
 */
async function handleSpecificStatus(command: ParsedVoiceCommand): Promise<StatusResult> {
  if (!command.target) {
    const spokenSummary = "Which agent would you like to check on?"
    await speakMessage(spokenSummary)
    return {
      success: false,
      spokenSummary,
      error: 'No target specified',
    }
  }

  const context = getCurrentTargetContext()
  const resolved = resolveVoiceTarget(command.target, context)

  if (!resolved.success) {
    const spokenSummary = resolved.error || "I couldn't find that agent."
    await speakMessage(spokenSummary)
    return {
      success: false,
      spokenSummary,
      error: resolved.error,
    }
  }

  // Get the specific agent session
  if (resolved.agentSessionId) {
    const session = agentSessionTracker.getSession(resolved.agentSessionId)
    if (session) {
      const status = mapSessionStatus(session)
      const name = session.conversationTitle || 'The agent'
      const agent = {
        name,
        status,
        currentTask: session.lastActivity,
      }

      // Build natural description with time context
      let spokenSummary = buildAgentDescription(agent, session) + '.'

      // Add task info for verbose mode
      if (session.lastActivity && status === 'working' && ttsVerbosity === 'verbose') {
        const task = truncateTask(session.lastActivity)
        spokenSummary += ` Currently working on: ${task}.`
      }

      // Add helpful context based on status
      if (status === 'waiting') {
        spokenSummary += ' Would you like to approve it?'
      } else if (status === 'error') {
        spokenSummary += ' You might want to take a look.'
      }

      await speakMessage(limitSentences(spokenSummary))

      return {
        success: true,
        spokenSummary,
        detailedStatus: {
          activeCount: status === 'working' ? 1 : 0,
          waitingCount: status === 'waiting' ? 1 : 0,
          errorCount: status === 'error' ? 1 : 0,
          agents: [{
            name: session.conversationTitle || 'Untitled',
            status,
            currentTask: session.lastActivity,
          }],
        },
      }
    }
  }

  // Agent not found in active sessions
  const name = resolved.agentName || command.content || 'That agent'
  const spokenSummary = `${name} isn't currently active. Would you like me to start a task for it?`
  await speakMessage(spokenSummary)

  return {
    success: true,
    spokenSummary,
    detailedStatus: {
      activeCount: 0,
      waitingCount: 0,
      errorCount: 0,
      agents: [],
    },
  }
}

/**
 * Handle "Any agents need help?" / "Who needs help?"
 */
async function handleNeedsHelpStatus(): Promise<StatusResult> {
  const sessions = agentSessionTracker.getActiveSessions()

  // Filter to agents that need attention (waiting for approval or have errors)
  const needsHelp = sessions.filter(session => {
    const status = mapSessionStatus(session)
    return status === 'waiting' || status === 'error'
  })

  const agents = needsHelp.map(session => ({
    name: session.conversationTitle || 'Untitled',
    projectName: undefined,
    status: mapSessionStatus(session),
    currentTask: session.lastActivity,
  }))

  let spokenSummary: string

  if (agents.length === 0) {
    spokenSummary = "All clear! No agents need your attention right now."
  } else {
    const waiting = agents.filter(a => a.status === 'waiting')
    const errors = agents.filter(a => a.status === 'error')

    const parts: string[] = []

    // Natural opening
    if (agents.length === 1) {
      parts.push(`Yes, 1 agent needs your attention.`)
    } else {
      parts.push(`Yes, ${agents.length} agents need your attention.`)
    }

    // Describe waiting agents naturally
    if (waiting.length > 0) {
      const waitingNames = waiting.slice(0, 2).map(a => a.name)
      if (waiting.length === 1) {
        parts.push(`${waitingNames[0]} is waiting for your approval.`)
      } else if (waiting.length === 2) {
        parts.push(`${waitingNames.join(' and ')} are waiting for approval.`)
      } else {
        parts.push(`${waitingNames.join(', ')} and ${waiting.length - 2} more are waiting for approval.`)
      }
    }

    // Describe errors naturally
    if (errors.length > 0) {
      const errorNames = errors.slice(0, 2).map(a => a.name)
      if (errors.length === 1) {
        parts.push(`${errorNames[0]} ran into an error.`)
      } else if (errors.length === 2) {
        parts.push(`${errorNames.join(' and ')} have errors.`)
      } else {
        parts.push(`${errorNames.join(', ')} and ${errors.length - 2} more have errors.`)
      }
    }

    spokenSummary = limitSentences(parts.join(' '))
  }

  await speakMessage(spokenSummary)

  return {
    success: true,
    spokenSummary,
    detailedStatus: {
      activeCount: 0, // Not relevant for this query
      waitingCount: agents.filter(a => a.status === 'waiting').length,
      errorCount: agents.filter(a => a.status === 'error').length,
      agents,
    },
  }
}

