import React, { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@renderer/lib/utils"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { ScrollArea } from "@renderer/components/ui/scroll-area"
import { useAgentStore } from "@renderer/stores"
import { tipcClient } from "@renderer/lib/tipc-client"
import { Bell, Check, X, AlertCircle, ChevronUp } from "lucide-react"

export interface PendingApproval {
  id: string
  sessionId: string
  agentName: string
  projectName?: string
  toolName: string
  description: string
  timestamp: number
}

interface NotificationBadgesProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left"
  className?: string
}

export function NotificationBadges({
  position = "top-right",
  className,
}: NotificationBadgesProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set())
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  // Derive pending approvals from agent store
  const agentProgressById = useAgentStore((state) => state.agentProgressById)
  const setFocusedSessionId = useAgentStore((state) => state.setFocusedSessionId)

  const pendingApprovals: PendingApproval[] = React.useMemo(() => {
    const approvals: PendingApproval[] = []
    for (const [sessionId, progress] of agentProgressById.entries()) {
      if (progress.pendingToolApproval) {
        approvals.push({
          id: progress.pendingToolApproval.approvalId,
          sessionId,
          agentName: progress.profileName || "Agent",
          projectName: progress.conversationTitle,
          toolName: progress.pendingToolApproval.toolName,
          description: formatToolDescription(
            progress.pendingToolApproval.toolName,
            progress.pendingToolApproval.arguments
          ),
          timestamp: Date.now(),
        })
      }
    }
    return approvals.sort((a, b) => b.timestamp - a.timestamp)
  }, [agentProgressById])

  // Track new approvals for animation
  const prevApprovalsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentIds = new Set(pendingApprovals.map((a) => a.id))
    const newIds = new Set<string>()
    for (const id of currentIds) {
      if (!prevApprovalsRef.current.has(id)) {
        newIds.add(id)
      }
    }
    if (newIds.size > 0) {
      setAnimatingIds((prev) => new Set([...prev, ...newIds]))
      // Remove animation class after animation completes
      setTimeout(() => {
        setAnimatingIds((prev) => {
          const next = new Set(prev)
          for (const id of newIds) next.delete(id)
          return next
        })
      }, 500)
    }
    prevApprovalsRef.current = currentIds
  }, [pendingApprovals])

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isExpanded])

  const handleApprove = useCallback(async (approval: PendingApproval) => {
    if (respondingIds.has(approval.id)) return
    setRespondingIds((prev) => new Set([...prev, approval.id]))
    try {
      await tipcClient.respondToToolApproval({ approvalId: approval.id, approved: true })
    } catch (error) {
      console.error("Failed to approve:", error)
      setRespondingIds((prev) => {
        const next = new Set(prev)
        next.delete(approval.id)
        return next
      })
    }
  }, [respondingIds])

  const handleDeny = useCallback(async (approval: PendingApproval) => {
    if (respondingIds.has(approval.id)) return
    setRespondingIds((prev) => new Set([...prev, approval.id]))
    try {
      await tipcClient.respondToToolApproval({ approvalId: approval.id, approved: false })
    } catch (error) {
      console.error("Failed to deny:", error)
      setRespondingIds((prev) => {
        const next = new Set(prev)
        next.delete(approval.id)
        return next
      })
    }
  }, [respondingIds])

  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId)
    setIsExpanded(false)
  }, [setFocusedSessionId])

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
  }

  if (pendingApprovals.length === 0) {
    return <></>
  }

  return (
    <div
      ref={containerRef}
      className={cn("fixed z-50", positionClasses[position], className)}
    >
      {/* Badge Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "relative flex items-center justify-center",
          "w-12 h-12 rounded-full",
          "bg-primary text-primary-foreground shadow-lg",
          "hover:bg-primary/90 transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          pendingApprovals.length > 0 && "animate-pulse"
        )}
      >
        <Bell className="w-5 h-5" />
        <Badge
          variant="destructive"
          className={cn(
            "absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5",
            "flex items-center justify-center text-xs font-bold"
          )}
        >
          {pendingApprovals.length}
        </Badge>
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <Card
          className={cn(
            "absolute mt-2 w-80 max-h-96 shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-200",
            position.includes("right") ? "right-0" : "left-0"
          )}
        >
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Pending Approvals ({pendingApprovals.length})
              </CardTitle>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <ScrollArea className="max-h-72">
              <div className="space-y-2 px-2">
                {pendingApprovals.map((approval) => (
                  <ApprovalItem
                    key={approval.id}
                    approval={approval}
                    isResponding={respondingIds.has(approval.id)}
                    isAnimating={animatingIds.has(approval.id)}
                    onApprove={() => handleApprove(approval)}
                    onDeny={() => handleDeny(approval)}
                    onFocus={() => handleFocusSession(approval.sessionId)}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface ApprovalItemProps {
  approval: PendingApproval
  isResponding: boolean
  isAnimating: boolean
  onApprove: () => void
  onDeny: () => void
  onFocus: () => void
}

function ApprovalItem({
  approval,
  isResponding,
  isAnimating,
  onApprove,
  onDeny,
  onFocus,
}: ApprovalItemProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border bg-card",
        "transition-all duration-200",
        isAnimating && "animate-in slide-in-from-right-5 duration-300",
        isResponding && "opacity-60"
      )}
    >
      {/* Agent info - clickable to focus */}
      <button
        onClick={onFocus}
        className="w-full text-left mb-2 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">{approval.agentName}</span>
          {approval.projectName && (
            <span className="text-xs text-muted-foreground truncate">
              • {approval.projectName}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono bg-muted px-1 py-0.5 rounded">
            {approval.toolName}
          </span>
        </div>
      </button>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
        {approval.description}
      </p>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={onApprove}
          disabled={isResponding}
          className="flex-1 h-7 text-xs"
        >
          <Check className="w-3 h-3 mr-1" />
          {isResponding ? "..." : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDeny}
          disabled={isResponding}
          className="flex-1 h-7 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Deny
        </Button>
      </div>
    </div>
  )
}

/**
 * Format tool call arguments into a human-readable description
 */
function formatToolDescription(toolName: string, args: any): string {
  if (!args) return `Requesting to use ${toolName}`

  // Handle common tool patterns
  if (typeof args === "object") {
    if (args.path) {
      return `${toolName}: ${args.path}`
    }
    if (args.command) {
      return `Execute: ${truncate(args.command, 50)}`
    }
    if (args.content) {
      return `${toolName} with content (${String(args.content).length} chars)`
    }
    if (args.query) {
      return `${toolName}: "${truncate(args.query, 40)}"`
    }
  }

  // Fallback: stringify a preview
  const preview = JSON.stringify(args)
  return truncate(preview, 60)
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + "..."
}
