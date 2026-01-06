/**
 * Project View Component (Level 2 of 3-level zoom navigation)
 * 
 * Shows all agents within a single project:
 * - Project header with back navigation
 * - List of all agents with current task summary
 * - Status and current step for each agent
 * - Button to spawn new agent
 */

import React, { useMemo, useState, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card, CardContent } from "@renderer/components/ui/card"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { useNavigationStore, useAgentStore, useFocusedProjectId } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"
import { AgentProgressUpdate } from "@shared/types"
import { ArrowLeft, Plus, Circle, Loader2, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronRight, GitBranch } from "lucide-react"
import { cn } from "@renderer/lib/utils"

type AgentStatus = "working" | "waiting" | "completed" | "error" | "idle"

interface AgentInfo {
  sessionId: string
  taskTitle: string
  status: AgentStatus
  currentStep?: string
  stepProgress?: string
  timestamp: number
  parentSessionId?: string
  depth?: number
  children?: AgentInfo[]
}

function getStatusIcon(status: AgentStatus) {
  switch (status) {
    case "working": return <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
    case "waiting": return <Clock className="w-4 h-4 text-yellow-500" />
    case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />
    case "error": return <AlertCircle className="w-4 h-4 text-red-500" />
    case "idle": return <Circle className="w-4 h-4 text-gray-400" />
  }
}

function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case "working": return "Working"
    case "waiting": return "Waiting"
    case "completed": return "Completed"
    case "error": return "Error"
    case "idle": return "Idle"
  }
}

function getStatusBadgeVariant(status: AgentStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "working": return "default"
    case "waiting": return "outline"
    case "completed": return "secondary"
    case "error": return "destructive"
    case "idle": return "outline"
  }
}

interface AgentRowProps {
  agent: AgentInfo
  onNavigate: (sessionId: string) => void
  depth?: number
  isSubAgent?: boolean
  collapsedAgents: Set<string>
  onToggleCollapse: (sessionId: string) => void
}

function AgentRow({ agent, onNavigate, depth = 0, isSubAgent = false, collapsedAgents, onToggleCollapse }: AgentRowProps) {
  const hasChildren = agent.children && agent.children.length > 0
  const isCollapsed = collapsedAgents.has(agent.sessionId)

  return (
    <div className="relative">
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50",
          "group",
          isSubAgent && "border-l-2 border-l-muted-foreground/30"
        )}
        onClick={() => onNavigate(agent.sessionId)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Expand/collapse button for agents with children */}
              {hasChildren ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleCollapse(agent.sessionId)
                  }}
                  className="shrink-0 rounded p-1 hover:bg-accent transition-colors"
                  title={isCollapsed ? "Expand sub-agents" : "Collapse sub-agents"}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              ) : null}
              {getStatusIcon(agent.status)}
              {/* Sub-agent indicator */}
              {isSubAgent && (
                <GitBranch className="w-3 h-3 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {agent.taskTitle || "Untitled Task"}
                  {/* Sub-agent count badge */}
                  {hasChildren && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {agent.children!.length} sub-agent{agent.children!.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {agent.currentStep && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <span className="text-muted-foreground/60">└─</span>
                    <span className="truncate">{agent.currentStep}</span>
                    {agent.stepProgress && (
                      <span className="text-xs text-muted-foreground/60">({agent.stepProgress})</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant(agent.status)} className="ml-2 shrink-0">
              {getStatusLabel(agent.status)}
            </Badge>
          </div>
        </CardContent>
      </Card>
      {/* Render sub-agents if expanded */}
      {hasChildren && !isCollapsed && (
        <div className="mt-2 ml-6 space-y-2 border-l-2 border-border/50 pl-3">
          {agent.children!.map((child) => (
            <AgentRow
              key={child.sessionId}
              agent={child}
              onNavigate={onNavigate}
              depth={depth + 1}
              isSubAgent={true}
              collapsedAgents={collapsedAgents}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ProjectViewProps {
  projectId?: string
}

const COLLAPSED_AGENTS_KEY = 'project-view-collapsed-agents'

export function ProjectView({ projectId: propProjectId }: ProjectViewProps) {
  const navigate = useNavigate()
  const params = useParams<{ projectId: string }>()
  const configQuery = useConfigQuery()
  const focusedProjectId = useFocusedProjectId()
  const goBackStore = useNavigationStore((s) => s.goBack)
  const navigateToAgentStore = useNavigationStore((s) => s.navigateToAgent)
  const agentProgressById = useAgentStore((s) => s.agentProgressById)

  // Use projectId from props, URL params, or store
  const projectId = propProjectId || params.projectId || focusedProjectId

  // Navigate back - updates both store and router
  const goBack = useCallback(() => {
    goBackStore()
    navigate('/dashboard')
  }, [goBackStore, navigate])

  // Track collapsed agents for sub-agent trees
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_AGENTS_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  const toggleAgentCollapse = (sessionId: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      // Persist to localStorage
      try {
        localStorage.setItem(COLLAPSED_AGENTS_KEY, JSON.stringify(Array.from(next)))
      } catch (e) {
        console.error("Failed to save collapsed agents:", e)
      }
      return next
    })
  }

  const projects = configQuery.data?.projects || []
  const project = projects.find((p) => p.id === projectId)

  // Build hierarchical list of agents for this project
  const agents = useMemo((): AgentInfo[] => {
    const allAgents = new Map<string, AgentInfo>()
    const childrenMap = new Map<string, AgentInfo[]>()

    // First pass: create all agent info objects
    agentProgressById.forEach((progress: AgentProgressUpdate, sessionId: string) => {
      let status: AgentStatus = "idle"
      if (progress.isComplete) {
        status = "completed"
      } else if (progress.pendingToolApproval) {
        status = "waiting"
      } else if (progress.steps?.some((s) => s.status === "error")) {
        status = "error"
      } else if (progress.steps?.some((s) => s.status === "in_progress")) {
        status = "working"
      }

      const currentStep = progress.steps?.find((s) => s.status === "in_progress")
      const stepIndex = currentStep ? progress.steps?.indexOf(currentStep) : undefined
      const totalSteps = progress.steps?.length || 0

      const agentInfo: AgentInfo = {
        sessionId,
        taskTitle: progress.conversationTitle || progress.conversationHistory?.[0]?.content?.slice(0, 50) || "Agent Task",
        status,
        currentStep: currentStep?.title || progress.streamingContent?.text?.slice(0, 50),
        stepProgress: stepIndex !== undefined && totalSteps > 0 ? `step ${stepIndex + 1}/${totalSteps}` : undefined,
        timestamp: progress.conversationHistory?.[0]?.timestamp || Date.now(),
        parentSessionId: progress.parentSessionId,
        depth: progress.depth || 0,
        children: [],
      }

      allAgents.set(sessionId, agentInfo)

      // Build parent-child relationships
      if (progress.parentSessionId) {
        if (!childrenMap.has(progress.parentSessionId)) {
          childrenMap.set(progress.parentSessionId, [])
        }
        childrenMap.get(progress.parentSessionId)!.push(agentInfo)
      }
    })

    // Second pass: attach children to parents and collect root agents
    const rootAgents: AgentInfo[] = []
    allAgents.forEach((agent) => {
      const children = childrenMap.get(agent.sessionId)
      if (children) {
        agent.children = children.sort((a, b) => b.timestamp - a.timestamp)
      }
      // Only include root agents (those without a parent)
      if (!agent.parentSessionId) {
        rootAgents.push(agent)
      }
    })

    return rootAgents.sort((a, b) => b.timestamp - a.timestamp)
  }, [agentProgressById])

  // Count total agents including sub-agents
  const totalAgentCount = useMemo(() => {
    let count = 0
    const countAgents = (agentList: AgentInfo[]) => {
      agentList.forEach((agent) => {
        count++
        if (agent.children) {
          countAgents(agent.children)
        }
      })
    }
    countAgents(agents)
    return count
  }, [agents])

  const handleNavigateToAgent = useCallback((sessionId: string) => {
    if (projectId) {
      navigateToAgentStore(projectId, sessionId)
      navigate(`/project/${projectId}/agent/${sessionId}`)
    }
  }, [projectId, navigateToAgentStore, navigate])

  const handleNewAgent = () => {
    // TODO: Implement spawn new agent functionality
    console.log("Spawn new agent for project:", projectId)
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-muted-foreground/50" />
        <div className="text-center">
          <h3 className="font-medium mb-1">Project Not Found</h3>
          <p className="text-sm text-muted-foreground">
            The project you're looking for doesn't exist.
          </p>
        </div>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto flex flex-col">
      {/* Header with Back Navigation */}
      <div className="border-b p-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{project.name}</h2>
          {project.description && (
            <p className="text-sm text-muted-foreground truncate">{project.description}</p>
          )}
        </div>
        <Badge variant="secondary">
          {totalAgentCount} agent{totalAgentCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-auto p-4">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Circle className="w-12 h-12 text-muted-foreground/50" />
            <div className="text-center">
              <h3 className="font-medium mb-1">No Agents Running</h3>
              <p className="text-sm text-muted-foreground">
                Spawn a new agent to get started on this project.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentRow
                key={agent.sessionId}
                agent={agent}
                onNavigate={handleNavigateToAgent}
                collapsedAgents={collapsedAgents}
                onToggleCollapse={toggleAgentCollapse}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with New Agent Button */}
      <div className="border-t p-4">
        <Button onClick={handleNewAgent} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          New Agent
        </Button>
      </div>
    </div>
  )
}

// Export Component for lazy loading in router
export const Component = ProjectView

