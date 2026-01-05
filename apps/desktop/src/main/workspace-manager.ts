/**
 * Workspace Manager
 * 
 * Manages project workspaces for parallel Claude Code agent sessions.
 * Each workspace is a directory where a Claude Code agent can run.
 */

import { EventEmitter } from "events"
import { configStore } from "./config"
import { acpService } from "./acp-service"
import { logApp } from "./debug"

export interface Workspace {
  id: string
  name: string
  path: string  // Working directory
  claudeCodeArgs?: string[]
  mcpServers?: string[]  // MCP server names to enable
  autoStart?: boolean
  agentName?: string  // Name of the ACP agent to use (defaults to first Claude Code agent)
}

export interface WorkspaceSession {
  workspaceId: string
  sessionId?: string
  status: "idle" | "starting" | "active" | "error"
  lastActivity?: string
  lastActivityTime?: number
  error?: string
}

class WorkspaceManager extends EventEmitter {
  private sessions: Map<string, WorkspaceSession> = new Map()
  private focusedWorkspaceId: string | null = null

  constructor() {
    super()
  }

  /**
   * Get all configured workspaces
   */
  getWorkspaces(): Workspace[] {
    const config = configStore.get()
    return (config as any).workspaces || []
  }

  /**
   * Get a specific workspace by ID
   */
  getWorkspace(id: string): Workspace | undefined {
    return this.getWorkspaces().find(w => w.id === id)
  }

  /**
   * Add a new workspace
   */
  addWorkspace(workspace: Omit<Workspace, "id">): Workspace {
    const config = configStore.get()
    const workspaces = (config as any).workspaces || []
    
    const newWorkspace: Workspace = {
      ...workspace,
      id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    }
    
    workspaces.push(newWorkspace)
    configStore.save({ ...config, workspaces } as any)
    
    // Initialize session state
    this.sessions.set(newWorkspace.id, {
      workspaceId: newWorkspace.id,
      status: "idle",
    })
    
    this.emit("workspaceAdded", newWorkspace)
    logApp(`[WorkspaceManager] Added workspace: ${newWorkspace.name} (${newWorkspace.path})`)
    
    return newWorkspace
  }

  /**
   * Update an existing workspace
   */
  updateWorkspace(id: string, updates: Partial<Omit<Workspace, "id">>): Workspace | null {
    const config = configStore.get()
    const workspaces = (config as any).workspaces || []
    const index = workspaces.findIndex((w: Workspace) => w.id === id)
    
    if (index === -1) {
      return null
    }
    
    const updated = { ...workspaces[index], ...updates }
    workspaces[index] = updated
    configStore.save({ ...config, workspaces } as any)
    
    this.emit("workspaceUpdated", updated)
    logApp(`[WorkspaceManager] Updated workspace: ${updated.name}`)
    
    return updated
  }

  /**
   * Remove a workspace
   */
  removeWorkspace(id: string): boolean {
    const config = configStore.get()
    const workspaces = (config as any).workspaces || []
    const index = workspaces.findIndex((w: Workspace) => w.id === id)
    
    if (index === -1) {
      return false
    }
    
    const removed = workspaces.splice(index, 1)[0]
    configStore.save({ ...config, workspaces } as any)
    
    // Clean up session state
    this.sessions.delete(id)
    if (this.focusedWorkspaceId === id) {
      this.focusedWorkspaceId = null
    }
    
    this.emit("workspaceRemoved", removed)
    logApp(`[WorkspaceManager] Removed workspace: ${removed.name}`)
    
    return true
  }

  /**
   * Get the currently focused workspace
   */
  getFocusedWorkspace(): Workspace | null {
    if (!this.focusedWorkspaceId) {
      return null
    }
    return this.getWorkspace(this.focusedWorkspaceId) || null
  }

  /**
   * Set the focused workspace (voice commands will be routed here)
   */
  setFocusedWorkspace(id: string | null): void {
    const oldFocused = this.focusedWorkspaceId
    this.focusedWorkspaceId = id
    
    if (oldFocused !== id) {
      this.emit("focusChanged", { oldId: oldFocused, newId: id })
      logApp(`[WorkspaceManager] Focus changed: ${oldFocused} -> ${id}`)
    }
  }

  /**
   * Get session state for a workspace
   */
  getSession(workspaceId: string): WorkspaceSession | undefined {
    return this.sessions.get(workspaceId)
  }

  /**
   * Get all workspace sessions
   */
  getAllSessions(): WorkspaceSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Start a workspace session (spawns Claude Code agent with workspace cwd)
   */
  async startSession(workspaceId: string): Promise<WorkspaceSession> {
    const workspace = this.getWorkspace(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`)
    }

    let session = this.sessions.get(workspaceId)
    if (!session) {
      session = { workspaceId, status: "idle" }
      this.sessions.set(workspaceId, session)
    }

    if (session.status === "active" || session.status === "starting") {
      return session
    }

    session.status = "starting"
    this.emit("sessionUpdated", session)

    try {
      // Find the agent to use
      const agentName = workspace.agentName || this.findDefaultAgent()
      if (!agentName) {
        throw new Error("No Claude Code agent configured")
      }

      // Spawn the agent with workspace cwd
      logApp(`[WorkspaceManager] Starting session for ${workspace.name} with agent ${agentName}`)
      await acpService.spawnAgent(agentName)

      session.status = "active"
      session.lastActivity = "Session started"
      session.lastActivityTime = Date.now()
      session.error = undefined

      this.emit("sessionUpdated", session)
      return session

    } catch (error) {
      session.status = "error"
      session.error = error instanceof Error ? error.message : String(error)
      this.emit("sessionUpdated", session)
      throw error
    }
  }

  /**
   * Stop a workspace session
   */
  async stopSession(workspaceId: string): Promise<void> {
    const workspace = this.getWorkspace(workspaceId)
    if (!workspace) {
      return
    }

    const session = this.sessions.get(workspaceId)
    if (!session || session.status === "idle") {
      return
    }

    try {
      const agentName = workspace.agentName || this.findDefaultAgent()
      if (agentName) {
        await acpService.stopAgent(agentName)
      }
    } catch (error) {
      logApp(`[WorkspaceManager] Error stopping session: ${error}`)
    }

    session.status = "idle"
    session.sessionId = undefined
    session.error = undefined
    this.emit("sessionUpdated", session)
  }

  /**
   * Send a command to a workspace
   */
  async sendCommand(workspaceId: string, command: string): Promise<string> {
    const workspace = this.getWorkspace(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`)
    }

    const session = this.sessions.get(workspaceId)
    if (!session || session.status !== "active") {
      // Auto-start if not active
      await this.startSession(workspaceId)
    }

    const agentName = workspace.agentName || this.findDefaultAgent()
    if (!agentName) {
      throw new Error("No Claude Code agent configured")
    }

    session!.lastActivity = `Processing: ${command.substring(0, 50)}...`
    session!.lastActivityTime = Date.now()
    this.emit("sessionUpdated", session)

    const response = await acpService.runTask({
      agentName,
      input: command,
      context: `Working directory: ${workspace.path}`,
    })

    session!.lastActivity = response.success 
      ? `Completed: ${command.substring(0, 30)}...`
      : `Error: ${response.error}`
    session!.lastActivityTime = Date.now()
    this.emit("sessionUpdated", session)

    if (!response.success) {
      throw new Error(response.error || "Command failed")
    }

    return response.result || "Command completed"
  }

  /**
   * Find the default Claude Code agent
   */
  private findDefaultAgent(): string | null {
    const config = configStore.get()
    const agents = config.acpAgents || []
    
    const claudeAgent = agents.find(a => 
      a.enabled !== false && (
        a.name.toLowerCase().includes('claude') ||
        a.name.toLowerCase().includes('code')
      )
    )
    
    return claudeAgent?.name || agents.find(a => a.enabled !== false)?.name || null
  }

  /**
   * Initialize workspace manager (auto-start workspaces if configured)
   */
  async initialize(): Promise<void> {
    const workspaces = this.getWorkspaces()
    
    // Initialize session state for all workspaces
    for (const workspace of workspaces) {
      this.sessions.set(workspace.id, {
        workspaceId: workspace.id,
        status: "idle",
      })
    }

    // Auto-start enabled workspaces
    for (const workspace of workspaces) {
      if (workspace.autoStart) {
        try {
          await this.startSession(workspace.id)
        } catch (error) {
          logApp(`[WorkspaceManager] Failed to auto-start ${workspace.name}: ${error}`)
        }
      }
    }

    // Focus the first workspace if any exist
    if (workspaces.length > 0 && !this.focusedWorkspaceId) {
      this.setFocusedWorkspace(workspaces[0].id)
    }

    logApp(`[WorkspaceManager] Initialized with ${workspaces.length} workspace(s)`)
  }

  /**
   * Shutdown all workspace sessions
   */
  async shutdown(): Promise<void> {
    for (const [workspaceId] of this.sessions) {
      try {
        await this.stopSession(workspaceId)
      } catch (error) {
        logApp(`[WorkspaceManager] Error stopping workspace ${workspaceId}: ${error}`)
      }
    }
    this.sessions.clear()
    this.focusedWorkspaceId = null
    logApp("[WorkspaceManager] Shutdown complete")
  }
}

export const workspaceManager = new WorkspaceManager()
