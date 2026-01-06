import React, { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { tipcClient, rendererHandlers } from "@renderer/lib/tipc-client"
import { ChevronDown, ChevronRight, X, Minimize2, Maximize2, Pin, FolderOpen, GitBranch } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import { useAgentStore, useNavigationStore } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"
import { logUI, logStateChange, logExpand } from "@renderer/lib/debug"
import { ProjectConfig, AgentProgressUpdate } from "@shared/types"

interface AgentSession {
  id: string
  conversationId?: string
  conversationTitle?: string
  status: "active" | "completed" | "error" | "stopped"
  startTime: number
  endTime?: number
  currentIteration?: number
  maxIterations?: number
  lastActivity?: string
  errorMessage?: string
  isSnoozed?: boolean
  projectId?: string // Optional association with a project
  parentSessionId?: string // Parent session ID if this is a sub-agent
  depth?: number // Depth level in the agent hierarchy
}

interface AgentSessionsResponse {
  activeSessions: AgentSession[]
  recentSessions: AgentSession[]
}

// Agent status types matching UI_UX_SPEC.md
type AgentStatus = "active" | "waiting" | "error" | "idle"

// Status indicator component with emoji-style indicators
function StatusIndicator({ status }: { status: AgentStatus }) {
  const statusConfig = {
    active: { color: "bg-green-500", title: "Active/working", emoji: "🟢" },
    waiting: { color: "bg-yellow-500", title: "Waiting for input/approval", emoji: "🟡" },
    error: { color: "bg-red-500", title: "Error/stopped", emoji: "🔴" },
    idle: { color: "bg-gray-400", title: "Idle", emoji: "⚪" },
  }
  const config = statusConfig[status]
  return (
    <span
      className={cn("w-2 h-2 rounded-full shrink-0", config.color)}
      title={config.title}
    />
  )
}

// Get agent status from progress data
function getAgentStatus(session: AgentSession, progress?: AgentProgressUpdate): AgentStatus {
  if (session.status === "error" || progress?.steps?.some((s) => s.status === "error")) {
    return "error"
  }
  if (progress?.pendingToolApproval) {
    return "waiting"
  }
  if (session.status === "active" && !session.isSnoozed && !progress?.isComplete) {
    return "active"
  }
  return "idle"
}

const STORAGE_KEY = 'active-agents-sidebar-expanded'
const PROJECT_COLLAPSE_KEY = 'active-agents-sidebar-collapsed-projects'
const SUBAGENT_COLLAPSE_KEY = 'active-agents-sidebar-collapsed-subagents'

export function ActiveAgentsSidebar() {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const initial = stored !== null ? stored === 'true' : true
    logExpand("ActiveAgentsSidebar", "init", { key: STORAGE_KEY, raw: stored, parsed: initial })
    return initial
  })

  // Track collapsed state per project
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(PROJECT_COLLAPSE_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Track collapsed state per parent session (for sub-agent trees)
  const [collapsedSubAgents, setCollapsedSubAgents] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(SUBAGENT_COLLAPSE_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  const focusedSessionId = useAgentStore((s) => s.focusedSessionId)
  const setFocusedSessionId = useAgentStore((s) => s.setFocusedSessionId)
  const setScrollToSessionId = useAgentStore((s) => s.setScrollToSessionId)
  const setSessionSnoozed = useAgentStore((s) => s.setSessionSnoozed)
  const agentProgressById = useAgentStore((s) => s.agentProgressById)
  const pinnedSessionIds = useAgentStore((s) => s.pinnedSessionIds)
  const togglePinSession = useAgentStore((s) => s.togglePinSession)

  const navigateToAgent = useNavigationStore((s) => s.navigateToAgent)
  const navigateToProject = useNavigationStore((s) => s.navigateToProject)

  const configQuery = useConfigQuery()
  const projects = configQuery.data?.projects || []

  const { data, refetch } = useQuery<AgentSessionsResponse>({
    queryKey: ["agentSessions"],
    queryFn: async () => {
      return await tipcClient.getAgentSessions()
    },
  })

  useEffect(() => {
    const unlisten = rendererHandlers.agentSessionsUpdated.listen(() => {
      refetch()
    })
    return unlisten
  }, [refetch])

  const activeSessions = data?.activeSessions || []
  const recentSessions = data?.recentSessions || []
  const totalAgentCount = activeSessions.length

  // Save collapsed projects to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PROJECT_COLLAPSE_KEY, JSON.stringify(Array.from(collapsedProjects)))
    } catch (e) {
      console.error("Failed to save collapsed projects:", e)
    }
  }, [collapsedProjects])

  // Save collapsed sub-agents to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SUBAGENT_COLLAPSE_KEY, JSON.stringify(Array.from(collapsedSubAgents)))
    } catch (e) {
      console.error("Failed to save collapsed sub-agents:", e)
    }
  }, [collapsedSubAgents])

  useEffect(() => {
    logStateChange('ActiveAgentsSidebar', 'isExpanded', !isExpanded, isExpanded)
    logExpand("ActiveAgentsSidebar", "write", { key: STORAGE_KEY, value: isExpanded })
    try {
      const valueStr = String(isExpanded)
      localStorage.setItem(STORAGE_KEY, valueStr)
    } catch (e) {
      logExpand("ActiveAgentsSidebar", "error", { key: STORAGE_KEY, error: e instanceof Error ? e.message : String(e) })
    }
  }, [isExpanded])

  // Helper to get parent session ID from agent progress
  const getParentSessionId = (sessionId: string): string | undefined => {
    const progress = agentProgressById.get(sessionId)
    return progress?.parentSessionId
  }

  // Helper to check if a session has children
  const hasChildSessions = (sessionId: string): boolean => {
    return activeSessions.some((s) => {
      const progress = agentProgressById.get(s.id)
      return progress?.parentSessionId === sessionId
    })
  }

  // Get child sessions for a parent
  const getChildSessions = (parentSessionId: string): AgentSession[] => {
    return activeSessions.filter((s) => {
      const progress = agentProgressById.get(s.id)
      return progress?.parentSessionId === parentSessionId
    })
  }

  // Group agents by project (only root agents - those without parents)
  const { pinnedAgents, agentsByProject, unassignedAgents, sessionToChildrenMap } = useMemo(() => {
    const pinned: Array<{ session: AgentSession; projectId?: string; agentNumber: number }> = []
    const byProject = new Map<string, Array<{ session: AgentSession; agentNumber: number }>>()
    const unassigned: Array<{ session: AgentSession; agentNumber: number }> = []
    const childrenMap = new Map<string, AgentSession[]>()

    // Initialize all projects
    projects.forEach((p) => byProject.set(p.id, []))

    // First pass: build children map
    activeSessions.forEach((session) => {
      const progress = agentProgressById.get(session.id)
      const parentId = progress?.parentSessionId
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(session)
      }
    })

    // Second pass: only process root agents (no parent)
    activeSessions.forEach((session, index) => {
      const progress = agentProgressById.get(session.id)
      const parentId = progress?.parentSessionId

      // Skip sub-agents - they'll be rendered under their parent
      if (parentId) return

      const agentNumber = index + 1
      const agentEntry = { session, agentNumber }

      // Check if pinned
      if (pinnedSessionIds.has(session.id)) {
        pinned.push({ ...agentEntry, projectId: session.projectId })
      }

      // Group by project
      if (session.projectId && byProject.has(session.projectId)) {
        byProject.get(session.projectId)!.push(agentEntry)
      } else {
        unassigned.push(agentEntry)
      }
    })

    return { pinnedAgents: pinned, agentsByProject: byProject, unassignedAgents: unassigned, sessionToChildrenMap: childrenMap }
  }, [activeSessions, projects, pinnedSessionIds, agentProgressById])

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const toggleSubAgentCollapse = (sessionId: string) => {
    setCollapsedSubAgents((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const handleAgentClick = (session: AgentSession, projectId?: string) => {
    logUI('[ActiveAgentsSidebar] Agent clicked:', session.id)
    const targetProjectId = projectId || session.projectId || ""
    navigateToAgent(targetProjectId, session.id)
    setFocusedSessionId(session.id)
    setScrollToSessionId(session.id)
  }

  const handleStopSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    logUI('[ActiveAgentsSidebar] Stopping session:', sessionId)
    try {
      await tipcClient.stopAgentSession({ sessionId })
      if (focusedSessionId === sessionId) {
        setFocusedSessionId(null)
      }
    } catch (error) {
      console.error("Failed to stop session:", error)
    }
  }

  const handleToggleSnooze = async (sessionId: string, isSnoozed: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    logUI('[ActiveAgentsSidebar] Toggle snooze:', { sessionId, isSnoozed })

    if (isSnoozed) {
      setSessionSnoozed(sessionId, false)
      setFocusedSessionId(sessionId)
      try {
        await tipcClient.unsnoozeAgentSession({ sessionId })
        await tipcClient.focusAgentSession({ sessionId })
        await tipcClient.setPanelMode({ mode: "agent" })
        await tipcClient.showPanelWindow({})
      } catch (error) {
        setSessionSnoozed(sessionId, true)
        setFocusedSessionId(null)
        console.error("Failed to unsnooze session:", error)
      }
    } else {
      setSessionSnoozed(sessionId, true)
      try {
        await tipcClient.snoozeAgentSession({ sessionId })
        if (focusedSessionId === sessionId) {
          setFocusedSessionId(null)
        }
        await tipcClient.hidePanelWindow({})
      } catch (error) {
        setSessionSnoozed(sessionId, false)
        console.error("Failed to snooze session:", error)
      }
    }
  }

  const handleTogglePin = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    togglePinSession(sessionId)
  }

  const handleToggleExpand = () => {
    const newState = !isExpanded
    logExpand("ActiveAgentsSidebar", "toggle", { from: isExpanded, to: newState, source: "user" })
    setIsExpanded(newState)
  }

  // Render a single agent row with optional sub-agent tree
  const renderAgentRow = (
    session: AgentSession,
    agentNumber: number,
    projectId?: string,
    isPinned: boolean = false,
    depth: number = 0,
    isSubAgent: boolean = false
  ) => {
    const isFocused = focusedSessionId === session.id
    const sessionProgress = agentProgressById.get(session.id)
    const status = getAgentStatus(session, sessionProgress)
    const hasPendingApproval = status === "waiting"
    const children = sessionToChildrenMap.get(session.id) || []
    const hasChildren = children.length > 0
    const isCollapsed = collapsedSubAgents.has(session.id)

    return (
      <div key={session.id} className="relative">
        <div
          onClick={() => handleAgentClick(session, projectId)}
          className={cn(
            "group relative cursor-pointer rounded-md border px-2 py-1.5 text-xs transition-all",
            hasPendingApproval
              ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/20"
              : isFocused
              ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/20"
              : "border-border/50 bg-card/50 hover:border-border hover:bg-card"
          )}
        >
          <div className="flex items-center gap-1.5">
            {/* Expand/collapse button for agents with children */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSubAgentCollapse(session.id)
                }}
                className="shrink-0 rounded p-0.5 hover:bg-accent transition-colors"
                title={isCollapsed ? "Expand sub-agents" : "Collapse sub-agents"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-2.5 w-2.5" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" />
                )}
              </button>
            ) : (
              <StatusIndicator status={status} />
            )}
            {/* Show status after chevron for agents with children */}
            {hasChildren && <StatusIndicator status={status} />}
            {/* Sub-agent indicator */}
            {isSubAgent && (
              <GitBranch className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
            )}
            <span className="text-muted-foreground text-[10px] shrink-0">#{agentNumber}</span>
            <p className={cn(
              "flex-1 truncate font-medium",
              hasPendingApproval ? "text-amber-700 dark:text-amber-300" :
              session.isSnoozed ? "text-muted-foreground" : "text-foreground"
            )}>
              {session.conversationTitle || "Unnamed agent"}
            </p>
            {/* Sub-agent count badge */}
            {hasChildren && (
              <span className="shrink-0 text-[9px] text-muted-foreground bg-muted px-1 rounded">
                {children.length} sub
              </span>
            )}
            {isPinned && (
              <Pin className="h-2.5 w-2.5 shrink-0 text-blue-500 fill-blue-500" />
            )}
            <button
              onClick={(e) => handleTogglePin(session.id, e)}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100",
                !isPinned && "opacity-0"
              )}
              title={isPinned ? "Unpin agent" : "Pin agent"}
            >
              <Pin className={cn("h-2.5 w-2.5", isPinned && "fill-current")} />
            </button>
            <button
              onClick={(e) => handleToggleSnooze(session.id, session.isSnoozed ?? false, e)}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100",
                isFocused && "opacity-100"
              )}
              title={session.isSnoozed ? "Restore" : "Minimize"}
            >
              {session.isSnoozed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </button>
            <button
              onClick={(e) => handleStopSession(session.id, e)}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100",
                isFocused && "opacity-100"
              )}
              title="Stop agent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {hasPendingApproval && sessionProgress?.pendingToolApproval && (
            <p className="mt-0.5 truncate pl-4 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Approval required: {sessionProgress.pendingToolApproval.toolName}
            </p>
          )}
        </div>
        {/* Render sub-agents if expanded */}
        {hasChildren && !isCollapsed && (
          <div className="mt-1 ml-3 space-y-1 border-l-2 border-border/50 pl-2">
            {children.map((child, idx) =>
              renderAgentRow(
                child,
                agentNumber * 100 + idx + 1, // Generate sub-agent number
                projectId,
                pinnedSessionIds.has(child.id),
                depth + 1,
                true // isSubAgent
              )
            )}
          </div>
        )}
      </div>
    )
  }

  // Render project section
  const renderProjectSection = (project: ProjectConfig, agents: Array<{ session: AgentSession; agentNumber: number }>) => {
    const isCollapsed = collapsedProjects.has(project.id)
    const agentCount = agents.length

    return (
      <div key={project.id} className="mt-2">
        <button
          onClick={() => toggleProjectCollapse(project.id)}
          className="flex w-full items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate flex-1 text-left">{project.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            [{agentCount} agent{agentCount !== 1 ? "s" : ""}]
          </span>
        </button>
        {!isCollapsed && agentCount > 0 && (
          <div className="ml-2 mt-1 space-y-1 border-l border-border/50 pl-2">
            {agents.map(({ session, agentNumber }) =>
              renderAgentRow(session, agentNumber, project.id)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-2 pb-2">
      {/* Main Header */}
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-all duration-200",
          "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <button
          onClick={handleToggleExpand}
          className="shrink-0 cursor-pointer hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
          aria-label={isExpanded ? "Collapse agents" : "Expand agents"}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="i-mingcute-grid-line h-3.5 w-3.5"></span>
          <span>Agents</span>
          {totalAgentCount > 0 && (
            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
              {totalAgentCount}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-1 pl-2">
          {/* Pinned Agents Section */}
          {pinnedAgents.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted-foreground">
                <Pin className="h-3 w-3 shrink-0 fill-blue-500 text-blue-500" />
                <span>Pinned</span>
              </div>
              <div className="space-y-1 ml-2">
                {pinnedAgents.map(({ session, agentNumber, projectId }) =>
                  renderAgentRow(session, agentNumber, projectId, true)
                )}
              </div>
            </div>
          )}

          {/* Projects with Agents */}
          {projects.map((project) => {
            const agents = agentsByProject.get(project.id) || []
            // Show all projects with agents, or show empty projects if there are no agents anywhere
            if (agents.length > 0 || (totalAgentCount === 0 && projects.length > 0)) {
              return renderProjectSection(project, agents)
            }
            return null
          })}

          {/* Unassigned Agents */}
          {unassignedAgents.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted-foreground">
                <ChevronDown className="h-3 w-3 shrink-0 invisible" />
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="truncate flex-1">Unassigned</span>
                <span className="shrink-0 text-[10px]">
                  [{unassignedAgents.length} agent{unassignedAgents.length !== 1 ? "s" : ""}]
                </span>
              </div>
              <div className="ml-2 mt-1 space-y-1 border-l border-border/50 pl-2">
                {unassignedAgents.map(({ session, agentNumber }) =>
                  renderAgentRow(session, agentNumber)
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {totalAgentCount === 0 && projects.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No active agents
            </div>
          )}

          {/* Recent/Completed Sessions */}
          {recentSessions.length > 0 && (
            <div className="mt-3 border-t border-border/50 pt-2">
              <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted-foreground">
                <span>Recent</span>
              </div>
              <div className="space-y-1 ml-2">
                {recentSessions.slice(0, 3).map((session) => {
                  const statusLabel = session.status === "stopped" ? "Stopped" : session.status === "error" ? "Error" : "Completed"
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleAgentClick(session)}
                      className="relative rounded-md border px-2 py-1 text-xs text-muted-foreground bg-card/30 cursor-pointer hover:bg-card/50 hover:border-border transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <StatusIndicator status={session.status === "error" ? "error" : "idle"} />
                        <p className="flex-1 truncate">{session.conversationTitle}</p>
                        <span className="shrink-0 text-[10px] opacity-70">{statusLabel}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

