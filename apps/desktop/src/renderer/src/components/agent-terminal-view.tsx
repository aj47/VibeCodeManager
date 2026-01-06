/**
 * Agent Terminal View Component (Level 3 of 3-level zoom navigation)
 * 
 * Shows full streaming output for a single agent:
 * - Agent header with task name and back navigation
 * - Breadcrumb showing: Projects > {ProjectName} > {AgentTask}
 * - Real-time streaming output (thoughts, tool calls, results)
 * - Syntax-highlighted code changes via AgentProgress
 * - Collapsible sections for verbose output
 * - Follow-up input at bottom
 */

import React from "react"
import { Button } from "@renderer/components/ui/button"
import { Badge } from "@renderer/components/ui/badge"
import { useNavigationStore, useAgentStore, useFocusedProjectId, useFocusedAgentSessionId } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"
import { ArrowLeft, ChevronRight, Terminal, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import { AgentProgress } from "./agent-progress"

interface AgentTerminalViewProps {
  projectId?: string
  sessionId?: string
}

export function AgentTerminalView({ projectId: propProjectId, sessionId: propSessionId }: AgentTerminalViewProps) {
  const configQuery = useConfigQuery()
  const focusedProjectId = useFocusedProjectId()
  const focusedAgentSessionId = useFocusedAgentSessionId()
  const goBack = useNavigationStore((s) => s.goBack)
  const navigateToDashboard = useNavigationStore((s) => s.navigateToDashboard)
  const navigateToProject = useNavigationStore((s) => s.navigateToProject)
  const agentProgressById = useAgentStore((s) => s.agentProgressById)

  const projectId = propProjectId || focusedProjectId
  const sessionId = propSessionId || focusedAgentSessionId

  // Get project and agent data
  const projects = configQuery.data?.projects || []
  const project = projects.find((p) => p.id === projectId)
  const progress = sessionId ? agentProgressById.get(sessionId) : null

  // Derive task title from progress
  const taskTitle = progress?.conversationTitle 
    || progress?.conversationHistory?.[0]?.content?.slice(0, 50)
    || "Agent Task"

  // Status indicators
  const isComplete = progress?.isComplete ?? false
  const hasErrors = progress?.steps?.some((s) => s.status === "error") ?? false
  const isWaiting = progress?.pendingToolApproval ?? false

  const getStatusBadge = () => {
    if (hasErrors) {
      return (
        <Badge variant="destructive" className="text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Error
        </Badge>
      )
    }
    if (isComplete) {
      return (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Completed
        </Badge>
      )
    }
    if (isWaiting) {
      return (
        <Badge variant="outline" className="text-xs">
          Awaiting Approval
        </Badge>
      )
    }
    return (
      <Badge variant="default" className="text-xs flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </Badge>
    )
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!sessionId || !progress) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Terminal className="w-12 h-12 text-muted-foreground/50" />
        <div className="text-center">
          <h3 className="font-medium mb-1">Agent Session Not Found</h3>
          <p className="text-sm text-muted-foreground">
            The agent session you're looking for doesn't exist or has ended.
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with Back Navigation and Breadcrumb */}
      <div className="border-b p-3 flex flex-col gap-2 flex-shrink-0">
        {/* Top row: Back button + title + status */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              {taskTitle}
            </h2>
          </div>
          {getStatusBadge()}
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground pl-11">
          <button
            className="hover:text-foreground transition-colors hover:underline"
            onClick={navigateToDashboard}
          >
            Projects
          </button>
          <ChevronRight className="w-3 h-3" />
          {project ? (
            <button
              className="hover:text-foreground transition-colors hover:underline truncate max-w-[150px]"
              onClick={() => navigateToProject(project.id)}
            >
              {project.name}
            </button>
          ) : (
            <span className="text-muted-foreground/60">Unknown Project</span>
          )}
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate max-w-[200px]" title={taskTitle}>
            {taskTitle}
          </span>
        </nav>
      </div>

      {/* Agent Progress Content - Full streaming output */}
      <div className="flex-1 overflow-hidden">
        <AgentProgress
          progress={progress}
          variant="tile"
          className={cn(
            "h-full rounded-none border-0",
            "overflow-auto"
          )}
        />
      </div>
    </div>
  )
}

// Export Component for lazy loading in router
export const Component = AgentTerminalView

