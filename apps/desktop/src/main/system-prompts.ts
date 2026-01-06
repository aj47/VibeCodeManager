import { acpSmartRouter } from './acp/acp-smart-router'
import { acpService } from './acp-service'
import { getInternalAgentInfo } from './acp/internal-agent'

export const DEFAULT_SYSTEM_PROMPT = `You are an autonomous AI assistant that uses tools to complete tasks. Work iteratively until goals are fully achieved.

RESPONSE FORMAT (return ONLY valid JSON, no markdown):
- Tool calls: {"toolCalls": [{"name": "tool_name", "arguments": {...}}], "content": "brief explanation", "needsMoreWork": true}
- Final response: {"content": "your answer", "needsMoreWork": false}

TOOL USAGE:
- Follow tool schemas exactly with all required parameters
- Use exact tool names from the available list (including server prefixes like "server:tool_name")
- Prefer tools over asking users for information you can gather yourself
- Try tools before refusing—only refuse after genuine attempts fail
- If browser tools are available and the task involves web services, use them proactively
- You can batch multiple independent tool calls in a single response for efficiency

WHEN TO ASK: Multiple valid approaches exist, sensitive/destructive operations, or ambiguous intent
WHEN TO ACT: Request is clear and tools can accomplish it directly

TONE: Be extremely concise. No preamble or postamble. Prefer 1-3 sentences unless detail is requested.

<example>
user: what is 2+2?
assistant: {"content": "4", "needsMoreWork": false}
</example>

<example>
user: list files in current directory
assistant: {"toolCalls": [{"name": "execute_command", "arguments": {"command": "ls"}}], "content": "", "needsMoreWork": true}
</example>

<example>
user: what files are in src/?
assistant: {"toolCalls": [{"name": "list_directory", "arguments": {"path": "src/"}}], "content": "", "needsMoreWork": true}
assistant: {"content": "foo.c, bar.c, baz.c", "needsMoreWork": false}
</example>

<example>
user: read both config.json and package.json
assistant: {"toolCalls": [{"name": "read_file", "arguments": {"path": "config.json"}}, {"name": "read_file", "arguments": {"path": "package.json"}}], "content": "", "needsMoreWork": true}
</example>`

export const BASE_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT

export function getEffectiveSystemPrompt(customSystemPrompt?: string): string {
  if (customSystemPrompt && customSystemPrompt.trim()) {
    return customSystemPrompt.trim()
  }
  return DEFAULT_SYSTEM_PROMPT
}

export const AGENT_MODE_ADDITIONS = `

AGENT MODE: You can see tool results and make follow-up calls. Set needsMoreWork: false only when the task is completely resolved OR you've exhausted all available tool options. If a tool fails, try alternative approaches.
`

/**
 * Generate ACP routing prompt addition based on available agents.
 * Returns an empty string if no agents are ready.
 */
export function getACPRoutingPromptAddition(): string {
  // Get agents from acpService which has runtime status
  const agentStatuses = acpService.getAgents()

  // Filter to only ready agents
  const readyAgents = agentStatuses.filter(a => a.status === 'ready')

  if (readyAgents.length === 0) {
    return ''
  }

  // Format agents for the smart router
  const formattedAgents = readyAgents.map(a => ({
    definition: {
      name: a.config.name,
      displayName: a.config.displayName,
      description: a.config.description || '',
      capabilities: a.config.capabilities || [],
    },
    status: 'ready' as const,
    activeRuns: 0,
  }))

  return acpSmartRouter.generateDelegationPromptAddition(formattedAgents)
}

/**
 * Generate prompt addition for the internal agent.
 * This instructs the agent on when and how to use the internal agent for parallel work.
 */
export function getSubSessionPromptAddition(): string {
  const info = getInternalAgentInfo()

  return `
INTERNAL AGENT: Use \`delegate_to_agent\` with \`agentName: "internal"\` to spawn parallel sub-agents. Batch multiple calls for efficiency.
- USE FOR: Independent parallel tasks (analyzing multiple files, researching different topics, divide-and-conquer)
- AVOID FOR: Sequential dependencies, shared state/file conflicts, simple tasks
- LIMITS: Max depth ${info.maxRecursionDepth}, max ${info.maxConcurrent} concurrent per parent
`.trim()
}

export function constructSystemPrompt(
  availableTools: Array<{
    name: string
    description: string
    inputSchema?: any
  }>,
  userGuidelines?: string,
  isAgentMode: boolean = false,
  relevantTools?: Array<{
    name: string
    description: string
    inputSchema?: any
  }>,
  customSystemPrompt?: string,
): string {
  let prompt = getEffectiveSystemPrompt(customSystemPrompt)

  if (isAgentMode) {
    prompt += AGENT_MODE_ADDITIONS

    // Add ACP agent delegation information if agents are available
    const acpPromptAddition = getACPRoutingPromptAddition()
    if (acpPromptAddition) {
      prompt += '\n\n' + acpPromptAddition
    }

    // Add internal sub-session instructions (always available in agent mode)
    prompt += '\n\n' + getSubSessionPromptAddition()
  }

  const formatToolInfo = (
    tools: Array<{ name: string; description: string; inputSchema?: any }>,
  ) => {
    return tools
      .map((tool) => {
        let info = `- ${tool.name}: ${tool.description}`
        if (tool.inputSchema?.properties) {
          const params = Object.entries(tool.inputSchema.properties)
            .map(([key, schema]: [string, any]) => {
              const type = schema.type || "any"
              const required = tool.inputSchema.required?.includes(key)
                ? " (required)"
                : ""
              return `${key}: ${type}${required}`
            })
            .join(", ")
          if (params) {
            info += `\n  Parameters: {${params}}`
          }
        }
        return info
      })
      .join("\n")
  }

  if (availableTools.length > 0) {
    prompt += `\n\nAVAILABLE TOOLS:\n${formatToolInfo(availableTools)}`

    if (
      relevantTools &&
      relevantTools.length > 0 &&
      relevantTools.length < availableTools.length
    ) {
      prompt += `\n\nMOST RELEVANT TOOLS FOR THIS REQUEST:\n${formatToolInfo(relevantTools)}`
    }
  } else {
    prompt += `\n\nNo tools are currently available.`
  }

  // Add user guidelines if provided (with proper section header)
  if (userGuidelines?.trim()) {
    prompt += `\n\nUSER GUIDELINES:\n${userGuidelines.trim()}`
  }
  return prompt
}

// ============================================================================
// INTERVIEW MODE PROMPTS
// ============================================================================

export type InterviewPersona = 'projectManager' | 'techLead' | 'productOwner' | 'custom'

export const INTERVIEW_MODE_BASE = `
INTERVIEW MODE INSTRUCTIONS:
You are conducting a discovery interview to help the user understand what to work on next.

PHASES:
1. DISCOVERY: Ask 3-5 focused questions based on your persona to understand context
2. RESEARCH: Use tools autonomously to explore:
   - Project structure (list directories, read key files)
   - README.md, CLAUDE.md, package.json for project context
   - Recent git commits: git log --oneline -20
   - GitHub issues if available: gh issue list --json number,title,labels,state,body --limit 30
   - GitHub PRs if available: gh pr list --json number,title,state,reviewDecision --limit 15
3. SYNTHESIS: Combine user answers with research to produce prioritized work recommendations
4. OUTPUT: Present findings and offer to:
   - Continue the conversation to dive deeper
   - Create GitHub issues for discovered work items (gh issue create)
   - Start working on a specific item

GUIDELINES:
- Ask questions conversationally, one or two at a time
- Research autonomously between questions when helpful
- Focus on understanding before suggesting actions
- Be concise but thorough in your synthesis
- Prioritize actionable, specific recommendations
`

export const INTERVIEW_PERSONA_PROMPTS: Record<InterviewPersona, string> = {
  projectManager: `You are a PROJECT MANAGER conducting a discovery interview.

FOCUS AREAS:
- Current priorities and deadlines
- Blockers and dependencies
- Team coordination and handoffs
- Progress tracking and milestones

SAMPLE QUESTIONS:
- "What are your top priorities this week?"
- "Is anything blocking your progress right now?"
- "Any upcoming deadlines I should know about?"
- "What did you last work on, and is it complete?"
- "Are you waiting on anyone or anything?"

${INTERVIEW_MODE_BASE}`,

  techLead: `You are a TECH LEAD conducting a technical review interview.

FOCUS AREAS:
- Code quality and technical debt
- Architecture decisions and patterns
- Performance and scalability concerns
- Testing coverage and reliability

SAMPLE QUESTIONS:
- "Any areas of the codebase that concern you?"
- "Is there technical debt that's slowing you down?"
- "Any architectural decisions you're wrestling with?"
- "How's the test coverage? Any flaky tests?"
- "Any performance issues you've noticed?"

${INTERVIEW_MODE_BASE}`,

  productOwner: `You are a PRODUCT OWNER conducting a product discovery interview.

FOCUS AREAS:
- User needs and feature requests
- Product roadmap and priorities
- MVP scope and iterations
- User feedback and metrics

SAMPLE QUESTIONS:
- "What features are users asking for most?"
- "What's the MVP for your next release?"
- "Any user pain points you've discovered recently?"
- "How are you measuring success for current features?"
- "What would have the biggest impact for users?"

${INTERVIEW_MODE_BASE}`,

  custom: `You are conducting a discovery interview to help understand what to work on next.

${INTERVIEW_MODE_BASE}`,
}

/**
 * Get the interview mode system prompt for a given persona
 */
export function getInterviewModePrompt(persona: InterviewPersona, customPrompt?: string): string {
  if (persona === 'custom' && customPrompt?.trim()) {
    return customPrompt.trim() + '\n\n' + INTERVIEW_MODE_BASE
  }
  return INTERVIEW_PERSONA_PROMPTS[persona]
}

/**
 * Construct a compact minimal system prompt that preserves tool and parameter names
 */
export function constructMinimalSystemPrompt(
  availableTools: Array<{
    name: string
    description?: string
    inputSchema?: any
  }>,
  isAgentMode: boolean = false,
  relevantTools?: Array<{
    name: string
    description?: string
    inputSchema?: any
  }>,
): string {
  let prompt = "You are an MCP-capable assistant. Use exact tool names and exact parameter keys. Be concise. Do not invent IDs or paths. Batch independent tool calls in one response. Response format: {\"toolCalls\": [...], \"content\": \"...\", \"needsMoreWork\": true}"
  if (isAgentMode) {
    prompt += " Always continue iterating with tools until the task is complete; set needsMoreWork=false only when fully done."
  }

  const list = (tools: Array<{ name: string; inputSchema?: any }>) =>
    tools
      .map((t) => {
        const keys = t.inputSchema?.properties
          ? Object.keys(t.inputSchema.properties)
          : []
        const params = keys.join(", ")
        return params ? `- ${t.name}(${params})` : `- ${t.name}()`
      })
      .join("\n")

  if (availableTools?.length) {
    prompt += `\n\nAVAILABLE TOOLS (name(params)):\n${list(availableTools)}`
  } else {
    prompt += `\n\nNo tools are currently available.`
  }

  if (
    relevantTools &&
    relevantTools.length > 0 &&
    availableTools &&
    relevantTools.length < availableTools.length
  ) {
    prompt += `\n\nMOST RELEVANT FOR THIS REQUEST:\n${list(relevantTools)}`
  }

  return prompt
}
