import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import { Textarea } from "@renderer/components/ui/textarea"
import { cn } from "@renderer/lib/utils"
import { AgentProcessingView } from "./agent-processing-view"
import { AgentProgressUpdate, ProjectConfig } from "../../../shared/types"
import { useTheme } from "@renderer/contexts/theme-context"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"

interface TextInputPanelProps {
  onSubmit: (text: string) => void
  onCancel: () => void
  isProcessing?: boolean
  agentProgress?: AgentProgressUpdate | null
}

export interface TextInputPanelRef {
  focus: () => void
}

export const TextInputPanel = forwardRef<TextInputPanelRef, TextInputPanelProps>(({
  onSubmit,
  onCancel,
  isProcessing = false,
  agentProgress,
}, ref) => {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isDark } = useTheme()
  const queryClient = useQueryClient()

  // Fetch config for projects
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => tipcClient.getConfig(),
  })

  const projects = configQuery.data?.projects || []
  const activeProjectId = configQuery.data?.activeProjectId
  const activeProject = projects.find((p) => p.id === activeProjectId)

  // Mutation to change active project
  const setActiveProjectMutation = useMutation({
    mutationFn: async (projectId: string | undefined) => {
      await tipcClient.saveConfig({
        config: { activeProjectId: projectId },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
    },
  })

  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus()
    }
  }))

  useEffect(() => {
    if (textareaRef.current && !isProcessing) {
      textareaRef.current.focus()

      const timer1 = setTimeout(() => {
        textareaRef.current?.focus()
      }, 50)

      const timer2 = setTimeout(() => {
        textareaRef.current?.focus()
      }, 150)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
      }
    }
    return undefined
  }, [isProcessing])

  const handleSubmit = () => {
    if (text.trim() && !isProcessing) {
      onSubmit(text.trim())
      setText("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isModifierPressed = e.metaKey || e.ctrlKey;

    if (isModifierPressed && (e.key === '=' || e.key === 'Equal' || e.key === '+')) {
      return;
    }

    if (isModifierPressed && e.key === '-') {
      return;
    }

    if (isModifierPressed && e.key === '0') {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  if (isProcessing && agentProgress) {
    return (
      <div className={cn(
        "text-input-panel modern-text-strong flex h-full w-full items-center justify-center rounded-xl",
        isDark ? "dark" : ""
      )}>
        <AgentProcessingView
          agentProgress={agentProgress}
          isProcessing={isProcessing}
          variant="overlay"
          showBackgroundSpinner={true}
          className="mx-4 w-full"
        />
      </div>
    )
  }

  return (
    <div className={cn(
      "text-input-panel modern-text-strong flex h-full w-full flex-col gap-3 rounded-xl p-3",
      isDark ? "dark" : ""
    )}>
      {/* Show agent progress if available */}
      {isProcessing && agentProgress ? (
        <AgentProcessingView
          agentProgress={agentProgress}
          isProcessing={isProcessing}
          variant="default"
          showBackgroundSpinner={true}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {/* Project selector */}
          {projects.length > 0 && (
            <div className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={activeProjectId || "none"}
                onValueChange={(value) => {
                  setActiveProjectMutation.mutate(value === "none" ? undefined : value)
                }}
              >
                <SelectTrigger className="h-6 w-auto min-w-[120px] max-w-[200px] border-0 bg-transparent px-1 text-xs hover:bg-white/10">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No project</span>
                  </SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeProject && (
                <span className="truncate text-xs text-muted-foreground" title={activeProject.directories.find(d => d.isDefault)?.path}>
                  {activeProject.directories.find(d => d.isDefault)?.path}
                </span>
              )}
            </div>
          )}
          <div className="modern-text-muted text-xs">
            Type your message • Enter to send • Shift+Enter for new line • Esc
            to cancel
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here..."
            className={cn(
              "modern-input modern-text-strong min-h-0 flex-1 resize-none border-0",
              "bg-transparent focus:border-ring focus:ring-1 focus:ring-ring",
              "placeholder:modern-text-muted",
            )}
            disabled={isProcessing}
            aria-label="Message input"
          />
        </div>
      )}

      <div className="modern-text-muted flex items-center justify-between text-xs">
        <div>
          {text.length > 0 && (
            <span>
              {text.length} character{text.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded px-2 py-1 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isProcessing}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              text.trim() && !isProcessing
                ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                : "cursor-not-allowed opacity-50",
            )}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
})

TextInputPanel.displayName = "TextInputPanel"
