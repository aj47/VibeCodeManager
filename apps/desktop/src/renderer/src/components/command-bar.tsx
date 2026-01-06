/**
 * Command Bar Component
 * 
 * Always-visible input at bottom of screen, Spotlight/Alfred-style.
 * Supports both voice and text input, shows current context (project/agent targeted),
 * and provides visual indicator when listening for voice.
 * Includes Interview Mode button for discovery sessions with AI personas.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Loader2, MessageCircleQuestion, ChevronDown, Briefcase, Code2, Package, Pencil } from "lucide-react"
import { cn } from "@renderer/lib/utils"
import { tipcClient } from "@renderer/lib/tipc-client"
import { useNavigationStore, useFocusedProjectId, useFocusedAgentSessionId, useAgentStore } from "@renderer/stores"
import { useConfigQuery } from "@renderer/lib/queries"
import type { InterviewPersona } from "@shared/types"
import { toast } from "sonner"

export type CommandBarState = "idle" | "listening" | "processing"

const PERSONA_OPTIONS: { id: InterviewPersona; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "projectManager", label: "Project Manager", icon: <Briefcase className="h-4 w-4" />, description: "Priorities, deadlines, blockers" },
  { id: "techLead", label: "Tech Lead", icon: <Code2 className="h-4 w-4" />, description: "Architecture, tech debt, code quality" },
  { id: "productOwner", label: "Product Owner", icon: <Package className="h-4 w-4" />, description: "Features, user impact, roadmap" },
  { id: "custom", label: "Custom", icon: <Pencil className="h-4 w-4" />, description: "Define your own focus" },
]

interface CommandBarProps {
  className?: string
  onSubmit?: (text: string) => void
}

export function CommandBar({ className, onSubmit }: CommandBarProps) {
  const [state, setState] = useState<CommandBarState>("idle")
  const [inputValue, setInputValue] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const [showPersonaMenu, setShowPersonaMenu] = useState(false)
  const [interviewStarting, setInterviewStarting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const personaMenuRef = useRef<HTMLDivElement>(null)

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
      const agentName = agentProgress?.conversationTitle || `Agent ${focusedAgentSessionId.slice(0, 6)}`
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
      // Close persona menu on Escape
      if (e.key === "Escape" && showPersonaMenu) {
        setShowPersonaMenu(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showPersonaMenu])

  // Close persona menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (personaMenuRef.current && !personaMenuRef.current.contains(e.target as Node)) {
        setShowPersonaMenu(false)
      }
    }

    if (showPersonaMenu) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
    return undefined
  }, [showPersonaMenu])

  // Start interview with selected persona
  const handleStartInterview = useCallback(async (persona: InterviewPersona) => {
    setShowPersonaMenu(false)
    setInterviewStarting(true)

    try {
      // Determine project scope based on current navigation level
      const projectId = currentLevel === "project" ? focusedProjectId : undefined

      await tipcClient.startInterviewMode({
        persona,
        projectId: projectId || undefined,
      })
    } catch (error) {
      console.error("Failed to start interview:", error)
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Extract the actual error message from the IPC wrapper
      const cleanMessage = errorMessage.replace(/^Error invoking remote method '[^']+': /, "")
      toast.error(cleanMessage)
    } finally {
      setInterviewStarting(false)
    }
  }, [currentLevel, focusedProjectId])

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
      await tipcClient.triggerMcpRecording({})
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
        {/* Interview Mode button with persona dropdown */}
        <div className="relative" ref={personaMenuRef}>
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            disabled={state === "processing" || interviewStarting}
            className={cn(
              "flex items-center justify-center gap-1 px-2 h-8 rounded-md transition-colors",
              "hover:bg-accent disabled:opacity-50",
              showPersonaMenu && "bg-accent",
              interviewStarting && "animate-pulse"
            )}
            aria-label="Start interview mode"
            title="Interview Mode - discover what to work on"
          >
            {interviewStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircleQuestion className="h-4 w-4" />
            )}
            <ChevronDown className={cn("h-3 w-3 transition-transform", showPersonaMenu && "rotate-180")} />
          </button>

          {/* Persona selection dropdown */}
          {showPersonaMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-card shadow-lg overflow-hidden z-50">
              <div className="px-3 py-2 border-b bg-muted/50">
                <div className="text-sm font-medium">Interview Mode</div>
                <div className="text-xs text-muted-foreground">
                  {currentLevel === "project" && focusedProjectId
                    ? `Scope: ${projects.find(p => p.id === focusedProjectId)?.name || "Project"}`
                    : "Scope: All Projects"}
                </div>
              </div>
              <div className="py-1">
                {PERSONA_OPTIONS.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => handleStartInterview(persona.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                  >
                    <span className="text-muted-foreground">{persona.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{persona.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{persona.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

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

