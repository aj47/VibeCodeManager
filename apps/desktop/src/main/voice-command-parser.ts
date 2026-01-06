/**
 * Voice Command Parser
 * 
 * Parses transcribed voice commands to extract targeting information and command types.
 * Supports name-based, number-based, and context-aware targeting methods.
 * 
 * Command Types:
 * - prompt: Sending tasks to agents (default fallback)
 * - navigation: Switching projects, focusing agents, going back
 * - status: Checking what agents are working on
 * - control: Stop, pause, resume, cancel commands
 * - approval: Yes/No, approve/deny responses
 */

export interface VoiceCommandContext {
  /** Currently focused project name, if any */
  focusedProject?: string
  /** Currently focused agent name, if any */
  focusedAgent?: string
  /** List of known agent names for matching */
  knownAgentNames?: string[]
  /** List of known project names for matching */
  knownProjectNames?: string[]
}

export interface ParsedVoiceCommand {
  type: 'prompt' | 'navigation' | 'status' | 'control' | 'approval'
  
  /** Target information for the command */
  target?: {
    type: 'project' | 'agent' | 'all' | 'current'
    name?: string
    number?: number
  }
  
  /** The actual command/task after extracting target */
  content: string
  
  /** For navigation commands */
  navigation?: 'back' | 'dashboard' | 'project' | 'agent'
  
  /** For status commands */
  statusQuery?: 'all' | 'specific' | 'needsHelp'
  
  /** For control commands */
  controlAction?: 'stop' | 'pause' | 'resume' | 'cancel'
  
  /** For approval commands */
  approvalAction?: 'approve' | 'deny' | 'showMore'
  
  /** Original transcript before parsing */
  originalTranscript: string
}

// ============================================================================
// Pattern Definitions
// ============================================================================

// Targeting patterns
const NAME_PREFIX_PATTERN = /^(?:hey\s+)?([a-z][a-z0-9_-]*),?\s+/i
const AGENT_NUMBER_PATTERN = /^agent\s+(\d+),?\s+/i
const TELL_PATTERN = /^tell\s+(?:agent\s+)?(\d+|[a-z][a-z0-9_-]*)\s+to\s+/i

// Navigation patterns
const SWITCH_PROJECT_PATTERN = /^(?:switch\s+to|open)\s+(.+)$/i
const FOCUS_AGENT_PATTERN = /^focus\s+(?:on\s+)?(?:agent\s+)?(\d+|[a-z][a-z0-9_-]*)$/i
const GO_BACK_PATTERN = /^(?:go\s*back|zoom\s*out)$/i
const SHOW_ALL_PATTERN = /^(?:show\s+all\s+projects|show\s+dashboard)$/i

// Status patterns
const STATUS_ALL_PATTERN = /^(?:what(?:'s|s)?\s+everyone\s+working\s+on|status|what(?:'s|s)?\s+the\s+status)(?:\?)?$/i
const STATUS_SPECIFIC_PATTERN = /^what\s+(?:is|are)\s+([a-z][a-z0-9_-]*)\s+doing(?:\?)?$/i
const NEEDS_HELP_PATTERN = /^(?:any\s+agents?\s+need\s+help|who\s+needs\s+help)(?:\?)?$/i

// Control patterns
const STOP_PATTERN = /^(?:stop|pause)\s+(?:agent\s+)?(\d+|[a-z][a-z0-9_-]*)$/i
const RESUME_PATTERN = /^resume\s+(?:agent\s+)?(\d+|[a-z][a-z0-9_-]*)$/i
const CANCEL_PATTERN = /^cancel\s+(?:that|this|it)$/i

// Approval patterns - match exactly these phrases
const APPROVE_PATTERN = /^(?:yes|approve|do\s+it|okay|ok|go\s+ahead|confirmed?|yep|yeah)$/i
const DENY_PATTERN = /^(?:no|deny|cancel|stop|don(?:'t|t)|nope|negative)$/i
const SHOW_MORE_PATTERN = /^(?:show\s+(?:me\s+)?more|more\s+details?|explain)$/i

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize transcript for consistent parsing
 * Handles common voice transcription variations
 */
function normalizeTranscript(transcript: string): string {
  return transcript
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/go\s*back/gi, 'go back')  // Handle "goback" variation
    .replace(/zoom\s*out/gi, 'zoom out')
}

/**
 * Extract target from "Agent N" or name prefix patterns
 */
function extractTarget(
  transcript: string,
  context: VoiceCommandContext
): { target?: ParsedVoiceCommand['target']; remainingContent: string } {
  // Check for "tell X to" pattern
  const tellMatch = transcript.match(TELL_PATTERN)
  if (tellMatch) {
    const identifier = tellMatch[1]
    const remaining = transcript.slice(tellMatch[0].length)
    const num = parseInt(identifier, 10)
    if (!isNaN(num)) {
      return { target: { type: 'agent', number: num }, remainingContent: remaining }
    }
    return { target: { type: 'agent', name: identifier }, remainingContent: remaining }
  }

  // Check for "Agent N," pattern
  const agentNumMatch = transcript.match(AGENT_NUMBER_PATTERN)
  if (agentNumMatch) {
    const num = parseInt(agentNumMatch[1], 10)
    const remaining = transcript.slice(agentNumMatch[0].length)
    return { target: { type: 'agent', number: num }, remainingContent: remaining }
  }

  // Check for "Hey Name," or "Name," pattern
  const nameMatch = transcript.match(NAME_PREFIX_PATTERN)
  if (nameMatch) {
    const name = nameMatch[1]
    const remaining = transcript.slice(nameMatch[0].length)
    return { target: { type: 'agent', name: name }, remainingContent: remaining }
  }

  // No explicit target - use current focus from context
  if (context.focusedAgent) {
    return { 
      target: { type: 'current', name: context.focusedAgent }, 
      remainingContent: transcript 
    }
  }

  return { remainingContent: transcript }
}

/**
 * Parse a navigation command
 */
function parseNavigationCommand(
  transcript: string,
  _context: VoiceCommandContext
): ParsedVoiceCommand | null {
  // Go back / zoom out
  if (GO_BACK_PATTERN.test(transcript)) {
    return {
      type: 'navigation',
      navigation: 'back',
      content: '',
      originalTranscript: transcript
    }
  }

  // Show all projects / dashboard
  if (SHOW_ALL_PATTERN.test(transcript)) {
    return {
      type: 'navigation',
      navigation: 'dashboard',
      target: { type: 'all' },
      content: '',
      originalTranscript: transcript
    }
  }

  // Switch to / open project
  const switchMatch = transcript.match(SWITCH_PROJECT_PATTERN)
  if (switchMatch) {
    return {
      type: 'navigation',
      navigation: 'project',
      target: { type: 'project', name: switchMatch[1].trim() },
      content: switchMatch[1].trim(),
      originalTranscript: transcript
    }
  }

  // Focus on agent
  const focusMatch = transcript.match(FOCUS_AGENT_PATTERN)
  if (focusMatch) {
    const identifier = focusMatch[1]
    const num = parseInt(identifier, 10)
    return {
      type: 'navigation',
      navigation: 'agent',
      target: !isNaN(num)
        ? { type: 'agent', number: num }
        : { type: 'agent', name: identifier },
      content: identifier,
      originalTranscript: transcript
    }
  }

  return null
}

/**
 * Parse a status query command
 */
function parseStatusCommand(
  transcript: string,
  _context: VoiceCommandContext
): ParsedVoiceCommand | null {
  // "What's everyone working on?" / "Status" / "What's the status?"
  if (STATUS_ALL_PATTERN.test(transcript)) {
    return {
      type: 'status',
      statusQuery: 'all',
      target: { type: 'all' },
      content: '',
      originalTranscript: transcript
    }
  }

  // "What is [name] doing?"
  const specificMatch = transcript.match(STATUS_SPECIFIC_PATTERN)
  if (specificMatch) {
    return {
      type: 'status',
      statusQuery: 'specific',
      target: { type: 'agent', name: specificMatch[1] },
      content: specificMatch[1],
      originalTranscript: transcript
    }
  }

  // "Any agents need help?"
  if (NEEDS_HELP_PATTERN.test(transcript)) {
    return {
      type: 'status',
      statusQuery: 'needsHelp',
      target: { type: 'all' },
      content: '',
      originalTranscript: transcript
    }
  }

  return null
}

/**
 * Parse a control command (stop, pause, resume, cancel)
 */
function parseControlCommand(
  transcript: string,
  _context: VoiceCommandContext
): ParsedVoiceCommand | null {
  // Stop/Pause agent
  const stopMatch = transcript.match(STOP_PATTERN)
  if (stopMatch) {
    const identifier = stopMatch[1]
    const num = parseInt(identifier, 10)
    const action = transcript.toLowerCase().startsWith('pause') ? 'pause' : 'stop'
    return {
      type: 'control',
      controlAction: action,
      target: !isNaN(num)
        ? { type: 'agent', number: num }
        : { type: 'agent', name: identifier },
      content: identifier,
      originalTranscript: transcript
    }
  }

  // Resume agent
  const resumeMatch = transcript.match(RESUME_PATTERN)
  if (resumeMatch) {
    const identifier = resumeMatch[1]
    const num = parseInt(identifier, 10)
    return {
      type: 'control',
      controlAction: 'resume',
      target: !isNaN(num)
        ? { type: 'agent', number: num }
        : { type: 'agent', name: identifier },
      content: identifier,
      originalTranscript: transcript
    }
  }

  // Cancel that
  if (CANCEL_PATTERN.test(transcript)) {
    return {
      type: 'control',
      controlAction: 'cancel',
      target: { type: 'current' },
      content: '',
      originalTranscript: transcript
    }
  }

  return null
}

/**
 * Parse an approval command (yes/no, approve/deny)
 */
function parseApprovalCommand(
  transcript: string,
  _context: VoiceCommandContext
): ParsedVoiceCommand | null {
  if (APPROVE_PATTERN.test(transcript)) {
    return {
      type: 'approval',
      approvalAction: 'approve',
      content: '',
      originalTranscript: transcript
    }
  }

  if (DENY_PATTERN.test(transcript)) {
    return {
      type: 'approval',
      approvalAction: 'deny',
      content: '',
      originalTranscript: transcript
    }
  }

  if (SHOW_MORE_PATTERN.test(transcript)) {
    return {
      type: 'approval',
      approvalAction: 'showMore',
      content: '',
      originalTranscript: transcript
    }
  }

  return null
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse a voice command transcript to extract targeting and command type.
 *
 * @param transcript The raw voice transcript
 * @param context Current UI context (focused project/agent)
 * @returns Parsed command with type, target, and content
 *
 * @example
 * // Name-based targeting
 * parseVoiceCommand("Hey Backend, fix the auth bug", {})
 * // → { type: 'prompt', target: { type: 'agent', name: 'Backend' }, content: 'fix the auth bug' }
 *
 * @example
 * // Number-based targeting
 * parseVoiceCommand("Agent 2, run the tests", {})
 * // → { type: 'prompt', target: { type: 'agent', number: 2 }, content: 'run the tests' }
 *
 * @example
 * // Navigation command
 * parseVoiceCommand("switch to my-project", {})
 * // → { type: 'navigation', navigation: 'project', target: { type: 'project', name: 'my-project' } }
 */
export function parseVoiceCommand(
  transcript: string,
  context: VoiceCommandContext = {}
): ParsedVoiceCommand {
  const originalTranscript = transcript
  const normalized = normalizeTranscript(transcript)

  // Try parsing as approval first (short commands that shouldn't have targets)
  const approvalResult = parseApprovalCommand(normalized, context)
  if (approvalResult) {
    approvalResult.originalTranscript = originalTranscript
    return approvalResult
  }

  // Try parsing as navigation (may have targets in content)
  const navigationResult = parseNavigationCommand(normalized, context)
  if (navigationResult) {
    navigationResult.originalTranscript = originalTranscript
    return navigationResult
  }

  // Try parsing as status
  const statusResult = parseStatusCommand(normalized, context)
  if (statusResult) {
    statusResult.originalTranscript = originalTranscript
    return statusResult
  }

  // Try parsing as control
  const controlResult = parseControlCommand(normalized, context)
  if (controlResult) {
    controlResult.originalTranscript = originalTranscript
    return controlResult
  }

  // Default: treat as prompt command with optional target extraction
  const { target, remainingContent } = extractTarget(normalized, context)

  return {
    type: 'prompt',
    target,
    content: remainingContent.trim(),
    originalTranscript
  }
}

