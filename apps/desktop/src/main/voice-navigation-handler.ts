/**
 * Voice Navigation Handler
 * 
 * Handles navigation voice commands by communicating with the renderer process
 * to update the navigation store.
 * 
 * Navigation commands:
 * - "Switch to [project name]" → Navigate to project view
 * - "Open [project name]" → Navigate to project view
 * - "Focus on [agent name/number]" → Navigate to agent terminal view
 * - "Go back" / "Zoom out" → Go back one level
 * - "Show all projects" → Navigate to dashboard
 */

import type { ParsedVoiceCommand } from "./voice-command-parser"
import {
  resolveVoiceTarget,
  getCurrentTargetContext,
  type VoiceTargetResult
} from "./voice-targeting"
import { WINDOWS } from "./window"
import { logApp } from "./debug"
import { synthesizeLocal, isLocalTTSAvailable } from "./local-audio"
import { configStore } from "./config"

export interface NavigationResult {
  success: boolean
  navigatedTo?: 'dashboard' | 'project' | 'agent'
  projectId?: string
  agentSessionId?: string
  error?: string
}

/**
 * Speak a confirmation message via TTS if enabled
 */
async function speakConfirmation(message: string): Promise<void> {
  const config = configStore.get()
  
  if (!config.ttsEnabled || !config.ttsAutoPlay) {
    return
  }
  
  if (!isLocalTTSAvailable()) {
    logApp("[VoiceNavigation] TTS not available for confirmation")
    return
  }
  
  try {
    await synthesizeLocal(message)
    logApp(`[VoiceNavigation] Spoke confirmation: "${message}"`)
  } catch (error) {
    logApp(`[VoiceNavigation] TTS error: ${error}`)
    // Don't fail navigation if TTS fails
  }
}

/**
 * Send navigation command to renderer via IPC
 */
function sendNavigationToRenderer(
  action: 'navigateToDashboard' | 'navigateToProject' | 'navigateToAgent' | 'goBack',
  projectId?: string,
  agentSessionId?: string
): boolean {
  const mainWindow = WINDOWS.get("main")
  if (!mainWindow) {
    logApp("[VoiceNavigation] No main window available")
    return false
  }

  try {
    // Send IPC message to renderer for navigation
    mainWindow.webContents.send('voice-navigation', {
      action,
      projectId,
      agentSessionId,
    })
    logApp(`[VoiceNavigation] Sent ${action} to renderer`, { projectId, agentSessionId })
    return true
  } catch (error) {
    logApp(`[VoiceNavigation] Failed to send navigation: ${error}`)
    return false
  }
}

/**
 * Handle a voice navigation command
 */
export async function handleVoiceNavigation(
  command: ParsedVoiceCommand
): Promise<NavigationResult> {
  if (command.type !== 'navigation' || !command.navigation) {
    return {
      success: false,
      error: "Not a navigation command"
    }
  }

  logApp(`[VoiceNavigation] Handling navigation: ${command.navigation}`, {
    target: command.target,
    content: command.content
  })

  const context = getCurrentTargetContext()

  switch (command.navigation) {
    case 'dashboard': {
      const sent = sendNavigationToRenderer('navigateToDashboard')
      if (sent) {
        await speakConfirmation("Showing all projects")
        return { success: true, navigatedTo: 'dashboard' }
      }
      return { success: false, error: "Failed to navigate to dashboard" }
    }

    case 'back': {
      const sent = sendNavigationToRenderer('goBack')
      if (sent) {
        await speakConfirmation("Going back")
        return { success: true }
      }
      return { success: false, error: "Failed to go back" }
    }

    case 'project': {
      if (!command.target) {
        return { success: false, error: "No project specified" }
      }

      const resolved: VoiceTargetResult = resolveVoiceTarget(command.target, context)
      
      if (!resolved.success || !resolved.projectId) {
        await speakConfirmation(resolved.error || "Could not find that project")
        return { success: false, error: resolved.error || "Project not found" }
      }

      const sent = sendNavigationToRenderer('navigateToProject', resolved.projectId)
      if (sent) {
        await speakConfirmation(`Opening ${resolved.projectName || 'project'}`)
        return { 
          success: true, 
          navigatedTo: 'project',
          projectId: resolved.projectId
        }
      }
      return { success: false, error: "Failed to navigate to project" }
    }

    case 'agent': {
      if (!command.target) {
        return { success: false, error: "No agent specified" }
      }

      const resolved: VoiceTargetResult = resolveVoiceTarget(command.target, context)
      
      if (!resolved.success || !resolved.agentSessionId) {
        await speakConfirmation(resolved.error || "Could not find that agent")
        return { success: false, error: resolved.error || "Agent not found" }
      }

      // Get the project ID for the agent session
      // Agent sessions don't track workspace, so fall back to context
      const projectId = resolved.projectId || context.focusedProjectId

      if (!projectId) {
        await speakConfirmation("Could not determine which project the agent belongs to")
        return { success: false, error: "No project context for agent" }
      }

      const sent = sendNavigationToRenderer('navigateToAgent', projectId, resolved.agentSessionId)
      if (sent) {
        await speakConfirmation(`Focusing on ${resolved.agentName || 'agent'}`)
        return {
          success: true,
          navigatedTo: 'agent',
          projectId,
          agentSessionId: resolved.agentSessionId
        }
      }
      return { success: false, error: "Failed to navigate to agent" }
    }

    default:
      return { success: false, error: `Unknown navigation type: ${command.navigation}` }
  }
}

