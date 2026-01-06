import { useEffect } from 'react'
import { rendererHandlers, tipcClient } from '@renderer/lib/tipc-client'
import { useAgentStore, useConversationStore } from '@renderer/stores'
import { useNavigationStore } from '@renderer/stores/navigation-store'
import { AgentProgressUpdate, Conversation, ConversationMessage, QueuedMessage } from '@shared/types'
import { logUI, logStateChange } from '@renderer/lib/debug'
import { useSaveConversationMutation } from '@renderer/lib/queries'

export function useStoreSync() {
  const updateSessionProgress = useAgentStore((s) => s.updateSessionProgress)
  const clearAllProgress = useAgentStore((s) => s.clearAllProgress)
  const clearSessionProgress = useAgentStore((s) => s.clearSessionProgress)
  const clearInactiveSessions = useAgentStore((s) => s.clearInactiveSessions)
  const setFocusedSessionId = useAgentStore((s) => s.setFocusedSessionId)
  const setScrollToSessionId = useAgentStore((s) => s.setScrollToSessionId)
  const updateMessageQueue = useAgentStore((s) => s.updateMessageQueue)
  const markConversationCompleted = useConversationStore((s) => s.markConversationCompleted)
  const saveConversationMutation = useSaveConversationMutation()

  useEffect(() => {
    const unlisten = rendererHandlers.agentProgressUpdate.listen(
      (update: AgentProgressUpdate) => {
        const sessionId = update.sessionId

        logUI('[useStoreSync] Received progress update:', {
          sessionId,
          iteration: `${update.currentIteration}/${update.maxIterations}`,
          isComplete: update.isComplete,
          isSnoozed: update.isSnoozed,
          stepsCount: update.steps.length,
        })

        updateSessionProgress(update)

        // Save complete conversation history when agent completes
        if (update.isComplete && update.conversationId) {
          if (update.conversationHistory && update.conversationHistory.length > 0) {
            saveCompleteConversationHistory(
              update.conversationId,
              update.conversationHistory
            )
          }
          markConversationCompleted(update.conversationId)
        }
      }
    )

    return unlisten
  }, [updateSessionProgress, markConversationCompleted])

  useEffect(() => {
    const unlisten = rendererHandlers.clearAgentProgress.listen(() => {
      logUI('[useStoreSync] Clearing all agent progress')
      clearAllProgress()
    })
    return unlisten
  }, [clearAllProgress])

  useEffect(() => {
    const unlisten = rendererHandlers.clearAgentSessionProgress.listen(
      (sessionId: string) => {
        logUI('[useStoreSync] Clearing agent progress for session:', sessionId)
        clearSessionProgress(sessionId)
      }
    )
    return unlisten
  }, [clearSessionProgress])

  useEffect(() => {
    const unlisten = rendererHandlers.clearInactiveSessions.listen(
      () => {
        logUI('[useStoreSync] Clearing all inactive sessions')
        clearInactiveSessions()
      }
    )
    return unlisten
  }, [clearInactiveSessions])

  useEffect(() => {
    const unlisten = rendererHandlers.focusAgentSession.listen(
      (sessionId: string) => {
        logUI('[useStoreSync] External focusAgentSession received:', sessionId)
        setFocusedSessionId(sessionId)
        setScrollToSessionId(null)
      }
    )
    return unlisten
  }, [setFocusedSessionId, setScrollToSessionId])

  // Listen for message queue updates
  useEffect(() => {
    const unlisten = rendererHandlers.onMessageQueueUpdate.listen(
      (data: { conversationId: string; queue: QueuedMessage[] }) => {
        logUI('[useStoreSync] Message queue update:', data.conversationId, data.queue.length)
        updateMessageQueue(data.conversationId, data.queue)
      }
    )
    return unlisten
  }, [updateMessageQueue])

  // Initial hydration of message queues on mount
  useEffect(() => {
    tipcClient.getAllMessageQueues().then((queues) => {
      logUI('[useStoreSync] Initial message queue hydration:', queues.length, 'queues')
      for (const queue of queues) {
        updateMessageQueue(queue.conversationId, queue.messages)
      }
    }).catch((error) => {
      logUI('[useStoreSync] Failed to hydrate message queues:', error)
    })
  }, [])

  // Listen for voice navigation commands from main process
  useEffect(() => {
    const handler = (
      _event: unknown,
      command: { action: string; projectId?: string; agentSessionId?: string }
    ) => {
      logUI('[useStoreSync] Received voice navigation command:', command)
      const { action, projectId, agentSessionId } = command
      const navStore = useNavigationStore.getState()

      switch (action) {
        case 'navigateToDashboard':
        case 'dashboard':
          navStore.navigateToDashboard()
          break
        case 'goBack':
        case 'back':
          navStore.goBack()
          break
        case 'navigateToProject':
        case 'project':
          if (projectId) {
            navStore.navigateToProject(projectId)
          }
          break
        case 'navigateToAgent':
        case 'agent':
          if (projectId && agentSessionId) {
            navStore.navigateToAgent(projectId, agentSessionId)
          }
          break
        default:
          logUI('[useStoreSync] Unknown voice navigation action:', action)
      }
    }

    const ipcRenderer = window.electron?.ipcRenderer
    if (ipcRenderer?.on) {
      ipcRenderer.on('voice-navigation', handler)
    }

    return () => {
      // Clean up the listener on unmount
      if (ipcRenderer?.removeListener) {
        ipcRenderer.removeListener('voice-navigation', handler)
      }
    }
  }, [])

  async function saveCompleteConversationHistory(
    conversationId: string,
    conversationHistory: Array<{
      role: 'user' | 'assistant' | 'tool'
      content: string
      toolCalls?: Array<{ name: string; arguments: any }>
      toolResults?: Array<{ success: boolean; content: string; error?: string }>
      timestamp?: number
    }>
  ) {
    try {
      const currentConv = await tipcClient.loadConversation({ conversationId })
      if (!currentConv) return

      const messages: ConversationMessage[] = conversationHistory.map(
        (entry, index) => ({
          id: `msg_${entry.timestamp || Date.now()}_${index}`,
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp || Date.now(),
          toolCalls: entry.toolCalls,
          toolResults: entry.toolResults,
        })
      )

      const updatedConversation: Conversation = {
        ...currentConv,
        messages,
        updatedAt: Date.now(),
      }

      await saveConversationMutation.mutateAsync({
        conversation: updatedConversation,
      })
    } catch (error) {
      console.error('Failed to save conversation history:', error)
    }
  }
}

