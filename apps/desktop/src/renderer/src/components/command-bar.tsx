/**
 * Command Bar Component
 * 
 * Always-visible input at bottom of screen, Spotlight/Alfred-style.
 * Supports both voice and text input, shows current context (project/agent targeted),
 * and provides visual indicator when listening for voice.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Loader2 } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useNavigationStore, useFocusedProjectId, useFocusedAgentSessionId, useAgentStore } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"

export type CommandBarState = "idle" | "listening" | "processing"

interface CommandBarProps {
  className?: string
  onSubmit?: (text: string) => void
}

export function CommandBar({ className, onSubmit }: CommandBarProps) {
  const [state, setState] = useState<CommandBarState>("idle")
  const [inputValue, setInputValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Navigation context
  const currentLevel = useNavigationStore((s) => s.currentLevel)
  const focusedProjectId = useFocusedProjectId()
  const focusedAgentSessionId = useFocusedAgentSessionId()
  const agentProgressById = useAgentStore((s) => s.agentProgressById)

  // Get config for project names
  const configQuery = useConfigQuery()
  const projects = configQuery.data?.projects || []

  // Derive context display text
  const getContextText = useCallback(() => {
    if (currentLevel === "agent" && focusedAgentSessionId) {
      const agentProgress = agentProgressById.get(focusedAgentSessionId)
      const agentName = agentProgress?.taskTitle || `Agent ${focusedAgentSessionId.slice(0, 6)}`
      return `Talk to ${agentName}...`
    }

    if (currentLevel === "project" && focusedProjectId) {
      const project = projects.find((p) => p.id === focusedProjectId)
      const projectName = project?.name || "Project"
      return `Talk to ${projectName}...`
    }

    return "Talk to all projects..."
  }, [currentLevel, focusedProjectId, focusedAgentSessionId, projects, agentProgressById])

  // Handle keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Handle text submission
  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || state === "processing") return

    setState("processing")
    setInputValue("")

    try {
      // Call the custom onSubmit if provided, otherwise use default tipc
      if (onSubmit) {
        onSubmit(text)
      } else {
        await tipcClient.createMcpTextInput({ text })
      }
    } catch (error) {
      console.error("Command bar submit error:", error)
    } finally {
      setState("idle")
    }
  }, [inputValue, state, onSubmit])

  // Handle voice input start
  const handleVoiceStart = useCallback(async () => {
    if (state !== "idle") return

    setState("listening")
    try {
      await tipcClient.startRecording({})
    } catch (error) {
      console.error("Failed to start voice recording:", error)
      setState("idle")
    }
  }, [state])

  // Handle key down events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === "Escape") {
        e.preventDefault()
        setInputValue("")
        inputRef.current?.blur()
      }
    },
    [handleSubmit]
  )

  const placeholderText = getContextText()
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 p-3",
        "bg-background/80 backdrop-blur-md border-t",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-lg",
          "bg-card border transition-all duration-200",
          isFocused && "border-primary ring-2 ring-primary/20"
        )}
      >
        {/* Microphone button */}
        <button
          onClick={handleVoiceStart}
          disabled={state === "processing"}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
            "hover:bg-accent disabled:opacity-50",
            state === "listening" && "text-red-500 animate-pulse"
          )}
          aria-label="Start voice input"
        >
          {state === "processing" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mic className={cn("h-5 w-5", state === "listening" && "animate-pulse")} />
          )}
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={state === "processing" ? "Thinking..." : placeholderText}
          disabled={state === "processing"}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm",
            "placeholder:text-muted-foreground disabled:cursor-not-allowed"
          )}
          aria-label="Command input"
        />

        {/* Keyboard shortcut hint */}
        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground bg-muted rounded">
          {isMac ? "⌘" : "Ctrl"}K
        </kbd>
      </div>
    </div>
  )
}

export default CommandBar

