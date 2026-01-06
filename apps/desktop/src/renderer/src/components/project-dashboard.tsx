/**
 * Project Dashboard Component (Level 1 of 3-level zoom navigation)
 * 
 * Shows all projects with compact cards displaying:
 * - Status indicator (color-coded)
 * - Project name
 * - Active agent count
 * - Most recent activity with timestamp
 * - Progress bar (if task in progress)
 */

import React, { useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent } from "@renderer/components/ui/card"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@renderer/components/ui/tooltip"
import { useNavigationStore, useAgentStore } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"
import { ProjectConfig, AgentProgressUpdate } from "@shared/types"
import { Activity, Users, Clock, Plus, History, FolderOpen } from "lucide-react"
import { cn } from "@renderer/lib/utils"

type ProjectStatus = "active" | "waiting" | "error" | "idle"

interface ProjectWithStatus extends ProjectConfig {
  status: ProjectStatus
  activeAgentCount: number
  lastActivity?: string
  lastActivityTime?: number
  progressPercent?: number
}

function getStatusColor(status: ProjectStatus): string {
  switch (status) {
    case "active": return "bg-green-500"
    case "waiting": return "bg-yellow-500"
    case "error": return "bg-red-500"
    case "idle": return "bg-gray-400"
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

interface ProjectCardProps {
  project: ProjectWithStatus
  onNavigate: (projectId: string) => void
}

function ProjectCard({ project, onNavigate }: ProjectCardProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50",
        "group relative overflow-hidden"
      )}
      onClick={() => onNavigate(project.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        {/* Header: Status + Name + Agent Count */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full", getStatusColor(project.status))} 
                 title={`Status: ${project.status}`} />
            <span className="font-medium truncate max-w-[180px]">{project.name}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {project.activeAgentCount} agent{project.activeAgentCount !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Last Activity */}
        {project.lastActivity && project.lastActivityTime && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <Clock className="w-3 h-3" />
            <span className="truncate">"{project.lastActivity}"</span>
            <span className="text-muted-foreground/60">- {formatTimeAgo(project.lastActivityTime)}</span>
          </div>
        )}

        {/* Progress Bar (if in progress) */}
        {project.progressPercent !== undefined && project.progressPercent < 100 && (
          <div className="mt-2">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${project.progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{project.progressPercent}%</span>
          </div>
        )}

        {/* Hover Actions */}
        <div className={cn(
          "absolute top-2 right-2 flex gap-1 transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                  e.stopPropagation()
                  // TODO: Implement new agent action
                }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Agent</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                  e.stopPropagation()
                  // TODO: Implement view history action
                }}>
                  <History className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View History</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectDashboard() {
  const navigate = useNavigate()
  const configQuery = useConfigQuery()
  const navigateToProjectStore = useNavigationStore((s) => s.navigateToProject)
  const agentProgressById = useAgentStore((s) => s.agentProgressById)

  const projects = configQuery.data?.projects || []

  // Navigate to project view - updates both store and router
  const handleNavigateToProject = useCallback((projectId: string) => {
    navigateToProjectStore(projectId)
    navigate(`/project/${projectId}`)
  }, [navigateToProjectStore, navigate])

  // Calculate project status based on agents
  const projectsWithStatus = useMemo((): ProjectWithStatus[] => {
    return projects.map((project) => {
      // TODO: When agent progress includes projectId, filter by project
      // For now, we aggregate all active agents across all projects as a demonstration
      // Future: const projectPaths = new Set(project.directories.map((d) => d.path))
      // Then match progress.workingDirectory against projectPaths

      let activeCount = 0
      let hasError = false
      let hasWaiting = false
      let lastActivity: string | undefined
      let lastActivityTime: number | undefined
      let totalProgress = 0
      let progressCount = 0

      agentProgressById.forEach((progress: AgentProgressUpdate) => {
        // In a real implementation, we'd have project association in progress
        // For now, count all non-complete sessions
        if (!progress.isComplete) {
          activeCount++

          // Check for errors
          const hasStepError = progress.steps?.some((s) => s.status === "error")
          if (hasStepError) hasError = true

          // Check for waiting/approval
          if (progress.pendingToolApproval) hasWaiting = true

          // Calculate progress
          if (progress.maxIterations > 0) {
            totalProgress += (progress.currentIteration / progress.maxIterations) * 100
            progressCount++
          }
        }

        // Get last activity from conversation history
        const lastMessage = progress.conversationHistory?.slice(-1)[0]
        if (lastMessage?.timestamp) {
          if (!lastActivityTime || lastMessage.timestamp > lastActivityTime) {
            lastActivityTime = lastMessage.timestamp
            lastActivity = lastMessage.content?.slice(0, 50) || "Processing..."
          }
        }
      })

      // Determine overall status
      let status: ProjectStatus = "idle"
      if (hasError) status = "error"
      else if (hasWaiting) status = "waiting"
      else if (activeCount > 0) status = "active"

      const avgProgress = progressCount > 0 ? Math.round(totalProgress / progressCount) : undefined

      return {
        ...project,
        status,
        activeAgentCount: activeCount,
        lastActivity,
        lastActivityTime,
        progressPercent: avgProgress,
      }
    })
  }, [projects, agentProgressById])

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <FolderOpen className="w-12 h-12 text-muted-foreground/50" />
        <div className="text-center">
          <h3 className="font-medium mb-1">No Projects</h3>
          <p className="text-sm text-muted-foreground">
            Create a project in Settings → Projects to get started.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" />
          All Projects
        </h2>
        <p className="text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""} • Click to view agents
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectsWithStatus.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onNavigate={handleNavigateToProject}
          />
        ))}
      </div>
    </div>
  )
}

// Export Component for lazy loading in router
export const Component = ProjectDashboard

