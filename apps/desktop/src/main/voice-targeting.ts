/**
 * Voice Targeting System
 * 
 * Routes parsed voice commands to the correct project/agent by resolving
 * target information (name, number, current, or all) to actual IDs.
 */

import { agentSessionTracker, type AgentSession } from "./agent-session-tracker"
import { workspaceManager, type Workspace } from "./workspace-manager"
import { logApp } from "./debug"

// Input target from voice-command-parser
export interface VoiceTarget {
  type: "project" | "agent" | "all" | "current"
  name?: string  // For name-based targeting
  number?: number  // For number-based targeting (1-indexed)
}

// Output from resolving a voice target
export interface VoiceTargetResult {
  success: boolean
  
  // Resolved target
  projectId?: string
  projectName?: string
  agentSessionId?: string
  agentName?: string
  
  // For broadcast to all projects/agents
  broadcast?: boolean
  
  error?: string
}

// Context for resolving targets
export interface VoiceTargetContext {
  focusedProjectId?: string
  focusedAgentSessionId?: string
  activeProjectId?: string
}

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Fuzzy match a name against a target string
 * Returns a score from 0 (no match) to 1 (perfect match)
 */
function fuzzyMatchScore(target: string, query: string): number {
  const targetLower = target.toLowerCase()
  const queryLower = query.toLowerCase()
  
  // Exact match
  if (targetLower === queryLower) return 1.0
  
  // Target contains query as substring
  if (targetLower.includes(queryLower)) {
    // Score based on how much of target the query covers
    return 0.8 * (queryLower.length / targetLower.length) + 0.1
  }
  
  // Query contains target as substring (e.g., "backend api" matches "backend")
  if (queryLower.includes(targetLower)) {
    return 0.6
  }
  
  // Check if query matches start of any word in target
  const targetWords = targetLower.split(/\s+/)
  for (const word of targetWords) {
    if (word.startsWith(queryLower)) {
      return 0.7
    }
  }
  
  // Levenshtein distance-based matching for typos
  const distance = levenshteinDistance(targetLower, queryLower)
  const maxLen = Math.max(targetLower.length, queryLower.length)
  const similarity = 1 - distance / maxLen
  
  // Only consider it a match if similarity is above threshold
  if (similarity >= 0.6) {
    return similarity * 0.5 // Scale down since it's a fuzzy match
  }
  
  return 0
}

/**
 * Find best matching project by name
 */
function findProjectByName(name: string): { workspace: Workspace; score: number } | null {
  const workspaces = workspaceManager.getWorkspaces()
  let bestMatch: { workspace: Workspace; score: number } | null = null
  
  for (const workspace of workspaces) {
    const score = fuzzyMatchScore(workspace.name, name)
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { workspace, score }
    }
  }
  
  return bestMatch
}

/**
 * Find best matching agent session by name/title
 */
function findAgentByName(name: string): { session: AgentSession; score: number } | null {
  const sessions = agentSessionTracker.getActiveSessions()
  let bestMatch: { session: AgentSession; score: number } | null = null
  
  for (const session of sessions) {
    // Match against conversation title
    const title = session.conversationTitle || ""
    const score = fuzzyMatchScore(title, name)
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { session, score }
    }
  }
  
  return bestMatch
}

/**
 * Get agent sessions ordered by start time for number-based targeting
 * Returns sessions in order: oldest first (so Agent 1 is the first one started)
 */
function getOrderedAgentSessions(): AgentSession[] {
  return agentSessionTracker.getActiveSessions()
    .sort((a, b) => a.startTime - b.startTime)
}

/**
 * Resolve a voice target to actual project/agent IDs
 */
export function resolveVoiceTarget(
  target: VoiceTarget | undefined,
  context: VoiceTargetContext
): VoiceTargetResult {
  // No target specified - use current context
  if (!target) {
    return resolveCurrentTarget(context)
  }
  
  switch (target.type) {
    case "current":
      return resolveCurrentTarget(context)
      
    case "all":
      return {
        success: true,
        broadcast: true,
      }
      
    case "project":
      return resolveProjectTarget(target, context)
      
    case "agent":
      return resolveAgentTarget(target, context)
      
    default:
      return {
        success: false,
        error: `Unknown target type: ${(target as any).type}`,
      }
  }
}

/**
 * Resolve the current/focused target from context
 */
function resolveCurrentTarget(context: VoiceTargetContext): VoiceTargetResult {
  // Prefer focused agent session if available
  if (context.focusedAgentSessionId) {
    const session = agentSessionTracker.getSession(context.focusedAgentSessionId)
    if (session && session.status === "active") {
      logApp(`[VoiceTargeting] Resolved current target to focused agent: ${session.id}`)
      return {
        success: true,
        agentSessionId: session.id,
        agentName: session.conversationTitle,
      }
    }
  }

  // Next try focused project
  if (context.focusedProjectId) {
    const workspace = workspaceManager.getWorkspace(context.focusedProjectId)
    if (workspace) {
      logApp(`[VoiceTargeting] Resolved current target to focused project: ${workspace.name}`)
      return {
        success: true,
        projectId: workspace.id,
        projectName: workspace.name,
      }
    }
  }

  // Fall back to active project from config
  if (context.activeProjectId) {
    const workspace = workspaceManager.getWorkspace(context.activeProjectId)
    if (workspace) {
      logApp(`[VoiceTargeting] Resolved current target to active project: ${workspace.name}`)
      return {
        success: true,
        projectId: workspace.id,
        projectName: workspace.name,
      }
    }
  }

  // Check for any active agent sessions
  const activeSessions = agentSessionTracker.getActiveSessions()
  if (activeSessions.length === 1) {
    const session = activeSessions[0]
    logApp(`[VoiceTargeting] Resolved current target to only active agent: ${session.id}`)
    return {
      success: true,
      agentSessionId: session.id,
      agentName: session.conversationTitle,
    }
  }

  // Check workspace manager's focused workspace
  const focusedWorkspace = workspaceManager.getFocusedWorkspace()
  if (focusedWorkspace) {
    logApp(`[VoiceTargeting] Resolved current target to workspace manager focused: ${focusedWorkspace.name}`)
    return {
      success: true,
      projectId: focusedWorkspace.id,
      projectName: focusedWorkspace.name,
    }
  }

  // No target could be resolved
  logApp(`[VoiceTargeting] Could not resolve current target - no focused project or agent`)
  return {
    success: false,
    error: "No active project or agent session to target. Please specify a target or start a session.",
  }
}

/**
 * Resolve a project target by name or number
 */
function resolveProjectTarget(
  target: VoiceTarget,
  _context: VoiceTargetContext
): VoiceTargetResult {
  const workspaces = workspaceManager.getWorkspaces()

  // Number-based targeting
  if (target.number !== undefined) {
    const index = target.number - 1 // Convert to 0-indexed
    if (index < 0 || index >= workspaces.length) {
      return {
        success: false,
        error: `Project ${target.number} not found. You have ${workspaces.length} project(s) configured.`,
      }
    }
    const workspace = workspaces[index]
    logApp(`[VoiceTargeting] Resolved project ${target.number} to: ${workspace.name}`)
    return {
      success: true,
      projectId: workspace.id,
      projectName: workspace.name,
    }
  }

  // Name-based targeting
  if (target.name) {
    const match = findProjectByName(target.name)
    if (match && match.score >= 0.3) {
      logApp(`[VoiceTargeting] Resolved project "${target.name}" to: ${match.workspace.name} (score: ${match.score.toFixed(2)})`)
      return {
        success: true,
        projectId: match.workspace.id,
        projectName: match.workspace.name,
      }
    }
    return {
      success: false,
      error: `Could not find project matching "${target.name}". Available projects: ${workspaces.map(w => w.name).join(", ") || "none"}`,
    }
  }

  return {
    success: false,
    error: "Project target requires a name or number.",
  }
}

/**
 * Resolve an agent target by name or number
 */
function resolveAgentTarget(
  target: VoiceTarget,
  _context: VoiceTargetContext
): VoiceTargetResult {
  const sessions = getOrderedAgentSessions()

  // Number-based targeting (Agent 1, Agent 2, etc.)
  if (target.number !== undefined) {
    const index = target.number - 1 // Convert to 0-indexed
    if (index < 0 || index >= sessions.length) {
      return {
        success: false,
        error: `Agent ${target.number} not found. You have ${sessions.length} active agent session(s).`,
      }
    }
    const session = sessions[index]
    logApp(`[VoiceTargeting] Resolved agent ${target.number} to: ${session.id} (${session.conversationTitle})`)
    return {
      success: true,
      agentSessionId: session.id,
      agentName: session.conversationTitle,
    }
  }

  // Name-based targeting
  if (target.name) {
    const match = findAgentByName(target.name)
    if (match && match.score >= 0.3) {
      logApp(`[VoiceTargeting] Resolved agent "${target.name}" to: ${match.session.id} (score: ${match.score.toFixed(2)})`)
      return {
        success: true,
        agentSessionId: match.session.id,
        agentName: match.session.conversationTitle,
      }
    }
    return {
      success: false,
      error: `Could not find agent session matching "${target.name}". Active sessions: ${sessions.map(s => s.conversationTitle).join(", ") || "none"}`,
    }
  }

  return {
    success: false,
    error: "Agent target requires a name or number.",
  }
}

/**
 * Get current target context from application state
 * Useful for callers who don't have context available
 */
export function getCurrentTargetContext(): VoiceTargetContext {
  const focusedWorkspace = workspaceManager.getFocusedWorkspace()
  const activeSessions = agentSessionTracker.getActiveSessions()

  return {
    focusedProjectId: focusedWorkspace?.id,
    // If there's only one active session, treat it as focused
    focusedAgentSessionId: activeSessions.length === 1 ? activeSessions[0].id : undefined,
    activeProjectId: focusedWorkspace?.id,
  }
}

/**
 * Convenience function to resolve a target using current application state
 */
export function resolveVoiceTargetWithCurrentContext(
  target: VoiceTarget | undefined
): VoiceTargetResult {
  return resolveVoiceTarget(target, getCurrentTargetContext())
}

/**
 * Get all available targets for displaying to user
 */
export function getAvailableTargets(): {
  projects: Array<{ id: string; name: string; number: number }>
  agents: Array<{ id: string; name: string; number: number }>
} {
  const workspaces = workspaceManager.getWorkspaces()
  const sessions = getOrderedAgentSessions()

  return {
    projects: workspaces.map((w, index) => ({
      id: w.id,
      name: w.name,
      number: index + 1,
    })),
    agents: sessions.map((s, index) => ({
      id: s.id,
      name: s.conversationTitle || "Untitled",
      number: index + 1,
    })),
  }
}

