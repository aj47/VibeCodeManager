/**
 * Navigation Store
 * 
 * Manages the 3-level zoom navigation state for the multi-project agent manager.
 * 
 * Levels:
 *   1. All Projects Dashboard - Overview of all projects with status
 *   2. Single Project View - All agents in one project
 *   3. Single Agent Terminal View - Streaming output for one agent
 */

import { create } from 'zustand'

export type NavigationLevel = 'dashboard' | 'project' | 'agent'

export interface NavigationState {
  // Current navigation level
  currentLevel: NavigationLevel
  
  // Currently focused project ID (for levels 2 and 3)
  focusedProjectId: string | null
  
  // Currently focused agent session ID (for level 3)
  focusedAgentSessionId: string | null
  
  // Breadcrumb history for back navigation
  history: Array<{
    level: NavigationLevel
    projectId: string | null
    agentSessionId: string | null
  }>
  
  // Navigation actions
  navigateToDashboard: () => void
  navigateToProject: (projectId: string) => void
  navigateToAgent: (projectId: string, agentSessionId: string) => void
  goBack: () => void
  
  // Quick focus methods (for voice commands)
  focusProject: (projectId: string) => void
  focusAgent: (agentSessionId: string) => void
  
  // Get current context for command bar display
  getCurrentContext: () => {
    level: NavigationLevel
    projectName?: string
    agentName?: string
  }
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentLevel: 'dashboard',
  focusedProjectId: null,
  focusedAgentSessionId: null,
  history: [],
  
  navigateToDashboard: () => {
    const state = get()
    // Push current state to history if not already at dashboard
    if (state.currentLevel !== 'dashboard') {
      set({
        history: [...state.history, {
          level: state.currentLevel,
          projectId: state.focusedProjectId,
          agentSessionId: state.focusedAgentSessionId,
        }],
        currentLevel: 'dashboard',
        focusedProjectId: null,
        focusedAgentSessionId: null,
      })
    }
  },
  
  navigateToProject: (projectId: string) => {
    const state = get()
    set({
      history: [...state.history, {
        level: state.currentLevel,
        projectId: state.focusedProjectId,
        agentSessionId: state.focusedAgentSessionId,
      }],
      currentLevel: 'project',
      focusedProjectId: projectId,
      focusedAgentSessionId: null,
    })
  },
  
  navigateToAgent: (projectId: string, agentSessionId: string) => {
    const state = get()
    set({
      history: [...state.history, {
        level: state.currentLevel,
        projectId: state.focusedProjectId,
        agentSessionId: state.focusedAgentSessionId,
      }],
      currentLevel: 'agent',
      focusedProjectId: projectId,
      focusedAgentSessionId: agentSessionId,
    })
  },
  
  goBack: () => {
    const state = get()
    if (state.history.length > 0) {
      const previous = state.history[state.history.length - 1]
      set({
        history: state.history.slice(0, -1),
        currentLevel: previous.level,
        focusedProjectId: previous.projectId,
        focusedAgentSessionId: previous.agentSessionId,
      })
    } else {
      // No history, go to dashboard
      set({
        currentLevel: 'dashboard',
        focusedProjectId: null,
        focusedAgentSessionId: null,
      })
    }
  },
  
  focusProject: (projectId: string) => {
    set({
      focusedProjectId: projectId,
    })
  },
  
  focusAgent: (agentSessionId: string) => {
    set({
      focusedAgentSessionId: agentSessionId,
    })
  },
  
  getCurrentContext: () => {
    const state = get()
    return {
      level: state.currentLevel,
      // Project and agent names would be resolved by the component using this
      // since the store doesn't have access to project/agent data
    }
  },
}))

// Export convenience hooks
export const useCurrentLevel = () => useNavigationStore((s) => s.currentLevel)
export const useFocusedProjectId = () => useNavigationStore((s) => s.focusedProjectId)
export const useFocusedAgentSessionId = () => useNavigationStore((s) => s.focusedAgentSessionId)

