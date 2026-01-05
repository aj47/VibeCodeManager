# SpeakMCP Desktop E2E Test Suite Plan

## Overview

This document outlines a comprehensive end-to-end (E2E) test suite for the SpeakMCP desktop application using the **Electron MCP / CDP (Chrome DevTools Protocol)** approach documented in `DEBUGGING.md`.

### Testing Philosophy

Rather than traditional Playwright/Cypress testing, we leverage the existing **electron-native MCP server** which provides:
- Direct JavaScript execution in Electron's renderer process via CDP
- Access to `window.electron.ipcRenderer.invoke()` for IPC testing
- DOM manipulation and UI interaction capabilities
- Real-time state inspection and validation

### Test Execution Method

```bash
# 1. Start the app with CDP enabled
REMOTE_DEBUGGING_PORT=9222 pnpm dev -- -d

# 2. Connect via MCP tools
# - list_electron_targets_electron-native
# - connect_to_electron_target_electron-native

# 3. Execute tests via electron_execute (execute_javascript_electron-native)
```

---

## Test Categories

| Category | Priority | Test Count | Description |
|----------|----------|------------|-------------|
| Navigation & Routing | P0 | 15 | Page navigation, URL handling |
| Agent Sessions | P0 | 45 | Session lifecycle, multi-session |
| MCP Tools | P0 | 60 | Tool discovery, execution, approval |
| IPC Communication | P0 | 40 | All TIPC procedures |
| UI Components | P1 | 80 | Forms, dialogs, controls |
| Settings Pages | P1 | 35 | All settings functionality |
| Conversations | P1 | 25 | History, persistence |
| Message Queue | P1 | 20 | Queuing, ordering |
| Profile System | P1 | 20 | Profile CRUD, switching |
| Elicitation/Sampling | P2 | 15 | MCP protocol features |
| Remote Server | P2 | 10 | API, tunnel |
| Performance | P2 | 10 | Load, stress testing |

**Total: ~375 test cases**

---

## Part 1: Core Infrastructure Tests

### 1.1 Application Lifecycle

```javascript
// Test: App launches and renders main window
await window.electron.ipcRenderer.invoke('getConfig');
// Expect: Config object returned

// Test: Debug flags are available
await window.electron.ipcRenderer.invoke('getDebugFlags');
// Expect: { llm, tools, ui, app, keybinds }
```

**Test Cases:**
- [ ] `getConfig` returns valid configuration object
- [ ] `getDebugFlags` returns debug flag state
- [ ] `restartApp` triggers app restart
- [ ] `getUpdateInfo` returns update status
- [ ] App persists configuration across restart
- [ ] Window state (size, position) persists

### 1.2 Navigation & Routing

```javascript
// Test: Navigate to settings
window.location.hash = '/settings/general';
setTimeout(() => document.querySelector('h1')?.textContent, 500);
// Expect: "General" or settings page header

// Test: Navigate to sessions
window.location.hash = '/';
```

**Routes to Test:**
| Route | Expected State |
|-------|----------------|
| `/` | Sessions grid/kanban view |
| `/:id` | Specific session focused |
| `/history` | Past sessions view |
| `/history/:id` | Continue past conversation |
| `/settings/general` | General settings page |
| `/settings/models` | Provider/model settings |
| `/settings/tools` | Profile/tool settings |
| `/settings/mcp-tools` | MCP server config |
| `/settings/remote-server` | Remote server/tunnel |
| `/setup` | Permissions page |
| `/onboarding` | Onboarding wizard |
| `/panel` | Floating panel window |

---

## Part 2: Agent Session Tests

### 2.1 Session Creation

```javascript
// Test: Create agent session from text
const result = await window.electron.ipcRenderer.invoke('createMcpTextInput', {
  text: 'Hello, test message',
  conversationId: null
});
// Expect: { conversationId: string, queued?: boolean }

// Verify session was created
const sessions = await window.electron.ipcRenderer.invoke('getAgentSessions');
// Expect: sessions.activeSessions.length > 0
```

**Test Cases:**
- [ ] `createMcpTextInput` creates new session
- [ ] `createMcpTextInput` with `conversationId` continues session
- [ ] `createMcpTextInput` queues when session active (`mcpMessageQueueEnabled=true`)
- [ ] `createMcpRecording` creates session from audio
- [ ] Session receives unique ID
- [ ] Profile snapshot captured at creation
- [ ] Session appears in `getAgentSessions().activeSessions`

### 2.2 Session Status & Control

```javascript
// Test: Get agent status
const status = await window.electron.ipcRenderer.invoke('getAgentStatus');
// Expect: { isAgentModeActive, shouldStopAgent, agentIterationCount, activeProcessCount }

// Test: Stop specific session
const stopped = await window.electron.ipcRenderer.invoke('stopAgentSession', {
  sessionId: 'test-session-id'
});
// Expect: { success: true }

// Test: Emergency stop all
const emergency = await window.electron.ipcRenderer.invoke('emergencyStopAgent');
// Expect: { success: true, message: string }
```

**Test Cases:**
- [ ] `getAgentStatus` returns current state
- [ ] `stopAgentSession` stops specific session
- [ ] `snoozeAgentSession` backgrounds session
- [ ] `unsnoozeAgentSession` shows panel for session
- [ ] `focusAgentSession` scrolls to session in sidebar
- [ ] `emergencyStopAgent` kills all sessions
- [ ] `clearAgentProgress` clears UI progress
- [ ] `clearAgentSessionProgress` clears single session
- [ ] `clearInactiveSessions` removes completed

### 2.3 Session Profile Isolation

```javascript
// Test: Session profile snapshot
const snapshot = await window.electron.ipcRenderer.invoke('getSessionProfileSnapshot', {
  sessionId: 'test-session-id'
});
// Expect: SessionProfileSnapshot with MCP config, model settings
```

**Test Cases:**
- [ ] Profile snapshot captured at session start
- [ ] Profile changes don't affect running session
- [ ] Session uses snapshot's model configuration
- [ ] Session uses snapshot's MCP server configuration
- [ ] Session uses snapshot's tool availability

### 2.4 Multi-Session Management

**Test Cases:**
- [ ] Multiple sessions can run concurrently
- [ ] Sessions track independently (iteration counts)
- [ ] Snoozed sessions don't show panel
- [ ] Un-snoozed session shows in panel
- [ ] Session list updates in real-time
- [ ] Completed sessions move to `recentSessions`
- [ ] Max 20 recent sessions retained

---

## Part 3: MCP Tool Tests

### 3.1 Server Status & Discovery

```javascript
// Test: Get MCP server status
const serverStatus = await window.electron.ipcRenderer.invoke('getMcpServerStatus');
// Expect: Array of { serverName, connected, toolCount, configDisabled, runtimeDisabled }

// Test: Get detailed tool list
const tools = await window.electron.ipcRenderer.invoke('getMcpDetailedToolList');
// Expect: { servers: [...], tools: [...] }

// Test: Get initialization status
const initStatus = await window.electron.ipcRenderer.invoke('getMcpInitializationStatus');
// Expect: { isInitializing: boolean, progress: number }
```

**Test Cases:**
- [ ] `getMcpServerStatus` lists all configured servers
- [ ] Server status shows connected/disconnected
- [ ] Server status shows tool count
- [ ] Built-in server (`speakmcp-settings`) always present
- [ ] `getMcpDetailedToolList` includes all tools with metadata
- [ ] `getMcpInitializationStatus` tracks init progress
- [ ] `getMcpDisabledTools` returns disabled tool list

### 3.2 Built-in Tools

```javascript
// Test: List MCP servers via built-in tool
// This tests end-to-end tool execution
const result = await window.electron.ipcRenderer.invoke('createMcpTextInput', {
  text: 'List all MCP servers'
});
// Agent should call list_mcp_servers tool
```

**Built-in Tools to Test:**
- [ ] `speakmcp-settings:list_mcp_servers` - Lists server status
- [ ] `speakmcp-settings:toggle_mcp_server` - Enable/disable server
- [ ] `speakmcp-settings:list_profiles` - Lists all profiles
- [ ] `speakmcp-settings:switch_profile` - Switches active profile
- [ ] `speakmcp-settings:get_current_profile` - Gets current profile
- [ ] `speakmcp-settings:list_running_agents` - Lists active sessions
- [ ] `speakmcp-settings:kill_agent` - Terminates session

### 3.3 Server Runtime Control

```javascript
// Test: Disable server at runtime
const disabled = await window.electron.ipcRenderer.invoke('setMcpServerRuntimeEnabled', {
  serverName: 'test-server',
  enabled: false
});
// Expect: { success: true }

// Test: Get runtime state
const state = await window.electron.ipcRenderer.invoke('getMcpServerRuntimeState', {
  serverName: 'test-server'
});
// Expect: { runtimeEnabled: false, available: false }
```

**Test Cases:**
- [ ] `setMcpServerRuntimeEnabled(false)` disables server
- [ ] `setMcpServerRuntimeEnabled(true)` enables server
- [ ] Disabled server tools hidden from `getAvailableTools`
- [ ] Server process keeps running when disabled
- [ ] `getMcpServerRuntimeState` returns accurate state
- [ ] State persists across app restart

### 3.4 Tool Enable/Disable

```javascript
// Test: Disable specific tool
const result = await window.electron.ipcRenderer.invoke('setMcpToolEnabled', {
  toolName: 'server:tool_name',
  enabled: false
});
// Expect: { success: true }
```

**Test Cases:**
- [ ] `setMcpToolEnabled(false)` disables tool
- [ ] `setMcpToolEnabled(true)` enables tool
- [ ] Disabled tool not returned in available tools
- [ ] Tool state persists to current profile
- [ ] Built-in tools cannot be disabled

### 3.5 Server Testing & Management

```javascript
// Test: Test server connection
const testResult = await window.electron.ipcRenderer.invoke('testMcpServerConnection', {
  serverName: 'test-server',
  serverConfig: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-test'] }
});
// Expect: { success: true } or { success: false, error: string }

// Test: Restart server
const restart = await window.electron.ipcRenderer.invoke('restartMcpServer', {
  serverName: 'test-server'
});
// Expect: { success: true }
```

**Test Cases:**
- [ ] `testMcpServerConnection` validates stdio server
- [ ] `testMcpServerConnection` validates WebSocket server
- [ ] `testMcpServerConnection` validates HTTP server
- [ ] `restartMcpServer` restarts server
- [ ] `stopMcpServer` stops server
- [ ] `getMcpServerLogs` returns server logs
- [ ] `clearMcpServerLogs` clears logs

### 3.6 Tool Approval Flow

```javascript
// Test: Tool approval workflow
// 1. Enable approval requirement in config
// 2. Trigger tool execution
// 3. Wait for approval request
// 4. Respond to approval

const response = await window.electron.ipcRenderer.invoke('respondToToolApproval', {
  approvalId: 'pending-approval-id',
  approved: true
});
// Expect: { success: true }
```

**Test Cases:**
- [ ] Tool approval dialog appears when enabled
- [ ] `respondToToolApproval(true)` allows execution
- [ ] `respondToToolApproval(false)` blocks execution
- [ ] Approval timeout handles gracefully
- [ ] Multiple pending approvals tracked

---

## Part 4: IPC Procedure Tests

### 4.1 Panel Window Control

```javascript
// Test: Show panel
await window.electron.ipcRenderer.invoke('showPanelWindow');

// Test: Hide panel
await window.electron.ipcRenderer.invoke('hidePanelWindow');

// Test: Set panel mode
await window.electron.ipcRenderer.invoke('setPanelMode', { mode: 'agent' });
// Expect: { success: true }

// Test: Get panel mode
const mode = await window.electron.ipcRenderer.invoke('getPanelMode');
// Expect: 'normal' | 'agent' | 'textInput'
```

**Test Cases:**
- [ ] `showPanelWindow` shows floating panel
- [ ] `hidePanelWindow` hides panel
- [ ] `showPanelWindowWithTextInput` shows with text mode
- [ ] `setPanelMode('normal')` sets normal mode
- [ ] `setPanelMode('agent')` sets agent mode
- [ ] `setPanelMode('textInput')` sets text input mode
- [ ] `setPanelFocusable(true)` enables focus
- [ ] `resizePanelForAgentMode` resizes for agent
- [ ] `resizePanelToNormal` resets size
- [ ] `getPanelSize` returns dimensions
- [ ] `updatePanelSize` changes size
- [ ] `setPanelPosition` changes position
- [ ] `getPanelPosition` returns position
- [ ] `savePanelCustomPosition` persists position
- [ ] `savePanelCustomSize` persists size
- [ ] `savePanelModeSize` saves per-mode size
- [ ] `initializePanelSize` loads saved size

### 4.2 Accessibility & Permissions

```javascript
// Test: Get microphone status
const micStatus = await window.electron.ipcRenderer.invoke('getMicrophoneStatus');
// Expect: 'denied' | 'granted' | 'unknown'

// Test: Check accessibility (macOS)
const hasAccess = await window.electron.ipcRenderer.invoke('isAccessibilityGranted');
// Expect: boolean
```

**Test Cases:**
- [ ] `getMicrophoneStatus` returns current status
- [ ] `requestMicrophoneAccess` prompts for access
- [ ] `isAccessibilityGranted` checks permissions
- [ ] `requestAccesssbilityAccess` prompts for access
- [ ] `openMicrophoneInSystemPreferences` opens settings

### 4.3 Configuration Management

```javascript
// Test: Get config
const config = await window.electron.ipcRenderer.invoke('getConfig');
// Expect: Full Config object

// Test: Save config
await window.electron.ipcRenderer.invoke('saveConfig', {
  config: { ...config, ttsEnabled: false }
});
```

**Test Cases:**
- [ ] `getConfig` returns complete configuration
- [ ] `saveConfig` persists changes
- [ ] Config changes apply to relevant systems
- [ ] Invalid config is rejected
- [ ] Config versioning/migration works

### 4.4 Conversation Management

```javascript
// Test: Get conversation history
const history = await window.electron.ipcRenderer.invoke('getConversationHistory');
// Expect: Conversation[]

// Test: Load conversation
const convo = await window.electron.ipcRenderer.invoke('loadConversation', {
  conversationId: 'test-id'
});
// Expect: Conversation | null

// Test: Create conversation
const newConvo = await window.electron.ipcRenderer.invoke('createConversation', {
  firstMessage: 'Test message',
  role: 'user'
});
// Expect: Conversation with ID
```

**Test Cases:**
- [ ] `getConversationHistory` lists all conversations
- [ ] `loadConversation` retrieves by ID
- [ ] `saveConversation` persists conversation
- [ ] `createConversation` creates new
- [ ] `addMessageToConversation` adds message
- [ ] `deleteConversation` removes single
- [ ] `deleteAllConversations` clears all
- [ ] `openConversationsFolder` opens file browser

### 4.5 Profile Management

```javascript
// Test: Get all profiles
const profiles = await window.electron.ipcRenderer.invoke('getProfiles');
// Expect: Profile[]

// Test: Get current profile
const current = await window.electron.ipcRenderer.invoke('getCurrentProfile');
// Expect: Profile

// Test: Create profile
const newProfile = await window.electron.ipcRenderer.invoke('createProfile', {
  name: 'Test Profile',
  guidelines: 'Test guidelines'
});
// Expect: Profile with ID
```

**Test Cases:**
- [ ] `getProfiles` lists all profiles
- [ ] `getProfile` retrieves by ID
- [ ] `getCurrentProfile` returns active profile
- [ ] `createProfile` creates new profile
- [ ] `updateProfile` modifies profile
- [ ] `deleteProfile` removes profile
- [ ] `setCurrentProfile` switches active
- [ ] `getDefaultSystemPrompt` returns template
- [ ] `exportProfile` serializes to JSON
- [ ] `importProfile` deserializes from JSON
- [ ] `saveProfileFile` exports via dialog
- [ ] `loadProfileFile` imports via dialog
- [ ] `saveCurrentMcpStateToProfile` saves MCP config
- [ ] `updateProfileMcpConfig` updates MCP settings
- [ ] `saveCurrentModelStateToProfile` saves model config
- [ ] `updateProfileModelConfig` updates model settings

### 4.6 Recording History

```javascript
// Test: Get recording history
const recordings = await window.electron.ipcRenderer.invoke('getRecordingHistory');
// Expect: RecordingHistoryItem[]

// Test: Delete recording
await window.electron.ipcRenderer.invoke('deleteRecordingItem', { id: 'recording-id' });

// Test: Clear all
await window.electron.ipcRenderer.invoke('deleteRecordingHistory');
```

**Test Cases:**
- [ ] `getRecordingHistory` returns sorted list
- [ ] `deleteRecordingItem` removes single item
- [ ] `deleteRecordingHistory` clears all

### 4.7 Message Queue

```javascript
// Test: Get message queue
const queue = await window.electron.ipcRenderer.invoke('getMessageQueue', {
  conversationId: 'test-id'
});
// Expect: QueuedMessage[]

// Test: Get all queues
const allQueues = await window.electron.ipcRenderer.invoke('getAllMessageQueues');
// Expect: Array with queue info and isPaused

// Test: Remove from queue
const removed = await window.electron.ipcRenderer.invoke('removeFromMessageQueue', {
  conversationId: 'test-id',
  messageId: 'msg-id'
});
// Expect: boolean
```

**Test Cases:**
- [ ] `getMessageQueue` returns queue for conversation
- [ ] `getAllMessageQueues` returns all active queues
- [ ] `removeFromMessageQueue` removes message
- [ ] `clearMessageQueue` clears conversation queue
- [ ] `reorderMessageQueue` changes order
- [ ] `updateQueuedMessageText` edits message
- [ ] `retryQueuedMessage` retries failed
- [ ] `isMessageQueuePaused` checks pause state
- [ ] `resumeMessageQueue` resumes processing

### 4.8 Text-to-Speech

```javascript
// Test: Generate speech
const speech = await window.electron.ipcRenderer.invoke('generateSpeech', {
  text: 'Hello, world',
  providerId: 'openai'
});
// Expect: { audio: ArrayBuffer, processedText: string, provider: string }
```

**Test Cases:**
- [ ] `generateSpeech` returns audio buffer
- [ ] Speech preprocessing removes thinking blocks
- [ ] Provider selection works
- [ ] Voice selection works
- [ ] Speed parameter respected

### 4.9 Model Management

```javascript
// Test: Fetch models for provider
const models = await window.electron.ipcRenderer.invoke('fetchAvailableModels', {
  providerId: 'openai'
});
// Expect: Model[]
```

**Test Cases:**
- [ ] `fetchAvailableModels` returns models for provider
- [ ] `fetchModelsForPreset` fetches for custom endpoint

### 4.10 OAuth Flow

```javascript
// Test: Initiate OAuth
const oauth = await window.electron.ipcRenderer.invoke('initiateOAuthFlow', 'test-server');
// Expect: { authorizationUrl: string, state: string }

// Test: Get OAuth status
const status = await window.electron.ipcRenderer.invoke('getOAuthStatus', 'test-server');
// Expect: { configured, authenticated, tokenExpiry? }
```

**Test Cases:**
- [ ] `initiateOAuthFlow` returns auth URL
- [ ] `completeOAuthFlow` exchanges code for tokens
- [ ] `getOAuthStatus` returns current state
- [ ] `revokeOAuthTokens` clears tokens

### 4.11 Cloudflare Tunnel

```javascript
// Test: Check cloudflared
const installed = await window.electron.ipcRenderer.invoke('checkCloudflaredInstalled');
// Expect: { installed: boolean, version?: string }

// Test: Start tunnel
const tunnel = await window.electron.ipcRenderer.invoke('startCloudflareTunnel');
// Expect: { success, url?, error? }
```

**Test Cases:**
- [ ] `checkCloudflaredInstalled` detects installation
- [ ] `startCloudflareTunnel` starts tunnel
- [ ] `stopCloudflareTunnel` stops tunnel
- [ ] `getCloudflareTunnelStatus` returns status

### 4.12 MCP Elicitation/Sampling

```javascript
// Test: Resolve elicitation
const resolved = await window.electron.ipcRenderer.invoke('resolveElicitation', {
  requestId: 'req-id',
  action: 'accept',
  content: { field: 'value' }
});
// Expect: { success: true }

// Test: Resolve sampling
const sampling = await window.electron.ipcRenderer.invoke('resolveSampling', {
  requestId: 'req-id',
  approved: true
});
// Expect: { success: true }
```

**Test Cases:**
- [ ] `resolveElicitation` with accept
- [ ] `resolveElicitation` with decline
- [ ] `resolveElicitation` with cancel
- [ ] `resolveSampling` with approval
- [ ] `resolveSampling` with denial

### 4.13 Diagnostics

```javascript
// Test: Get diagnostic report
const report = await window.electron.ipcRenderer.invoke('getDiagnosticReport');
// Expect: DiagnosticReport

// Test: Health check
const health = await window.electron.ipcRenderer.invoke('performHealthCheck');
// Expect: HealthCheckResult
```

**Test Cases:**
- [ ] `getDiagnosticReport` generates report
- [ ] `saveDiagnosticReport` exports to file
- [ ] `performHealthCheck` runs checks
- [ ] `getRecentErrors` returns error log
- [ ] `clearErrorLog` clears errors

---

## Part 5: UI Component Tests

### 5.1 Sessions Page

```javascript
// Test: Sessions page renders
window.location.hash = '/';
setTimeout(() => {
  const hasGrid = document.querySelector('[class*="grid"]') !== null;
  const hasKanban = document.querySelector('[class*="kanban"]') !== null;
  return hasGrid || hasKanban;
}, 500);
// Expect: true
```

**Test Cases:**
- [ ] Empty state shows when no sessions
- [ ] "Start with Text" button works
- [ ] "Start with Voice" button works
- [ ] Predefined prompts menu opens
- [ ] View toggle switches grid/kanban
- [ ] Grid view renders sessions
- [ ] Kanban view renders columns
- [ ] Session tile shows progress
- [ ] Session tile shows messages
- [ ] Session tile copy button works
- [ ] Session tile collapse/expand works
- [ ] Session snooze button works
- [ ] Session retry button shows on error
- [ ] Session dismiss button works
- [ ] Follow-up input accepts text
- [ ] Follow-up input submits
- [ ] Reset layout button works
- [ ] Clear completed button works

### 5.2 Past Sessions Section

```javascript
// Test: Past sessions expand/collapse
const section = document.querySelector('[class*="past-sessions"]');
section?.querySelector('button')?.click();
```

**Test Cases:**
- [ ] Past sessions section expands
- [ ] Past sessions section collapses
- [ ] Search filters results
- [ ] Open history folder works
- [ ] Delete all shows confirmation
- [ ] Delete all clears history
- [ ] Sessions grouped by date
- [ ] Individual session delete works
- [ ] Load more button works

### 5.3 Settings Pages

```javascript
// Test: Navigate to general settings
window.location.hash = '/settings/general';
```

**Settings - General:**
- [ ] Language selector works
- [ ] Theme selector works (light/dark/auto)
- [ ] STT provider selector works
- [ ] Post-processing provider works
- [ ] TTS provider selector works
- [ ] TTS voice selector works
- [ ] TTS toggle works
- [ ] Recording hotkey config works
- [ ] Agent mode hotkey config works

**Settings - Models:**
- [ ] Model selector works
- [ ] Provider selector works
- [ ] API key inputs save
- [ ] Model presets CRUD

**Settings - Tools/Profile:**
- [ ] Profile selector works
- [ ] Profile creation works
- [ ] Profile editing works
- [ ] Profile deletion works
- [ ] Tool toggles work

**Settings - MCP Tools:**
- [ ] Server list displays
- [ ] Add server button works
- [ ] Server enable/disable toggle
- [ ] Server status indicator
- [ ] Server logs viewer
- [ ] Test server button
- [ ] Restart server button
- [ ] Delete server works
- [ ] Tool list per server
- [ ] Tool enable/disable
- [ ] MCP registry browser

**Settings - Remote Server:**
- [ ] Enable toggle works
- [ ] Port input works
- [ ] Bind address selector
- [ ] API key display
- [ ] Copy API key works
- [ ] Regenerate key works
- [ ] Log level selector
- [ ] CORS origins input
- [ ] QR code displays
- [ ] Tunnel section shows
- [ ] Start/stop tunnel

### 5.4 Setup Page

```javascript
// Test: Setup page permissions
window.location.hash = '/setup';
```

**Test Cases:**
- [ ] Accessibility status displays (macOS)
- [ ] Microphone status displays
- [ ] Enable buttons work
- [ ] Granted checkmark shows
- [ ] Restart button shows when ready

### 5.5 Onboarding Wizard

```javascript
// Test: Onboarding flow
window.location.hash = '/onboarding';
```

**Test Cases:**
- [ ] Welcome step renders
- [ ] Get Started advances
- [ ] Skip Tutorial exits
- [ ] API key step accepts input
- [ ] Continue validates key format
- [ ] Dictation step hotkey config
- [ ] Recording test works
- [ ] Agent step hotkey config
- [ ] Exa installer works
- [ ] Agent test input works
- [ ] Step indicators update

### 5.6 Panel Window

```javascript
// Test: Panel mode switching
window.location.hash = '/panel';
```

**Test Cases:**
- [ ] Visualizer renders
- [ ] Recording button works
- [ ] Text input mode works
- [ ] Agent progress shows
- [ ] Follow-up input works
- [ ] Message queue panel
- [ ] Multi-session view

### 5.7 Dialogs & Modals

**Test Cases:**
- [ ] Delete confirmation dialog
- [ ] Profile creation dialog
- [ ] Profile edit dialog
- [ ] Server configuration dialog
- [ ] MCP elicitation form dialog
- [ ] MCP sampling dialog
- [ ] Predefined prompts dialog
- [ ] Tool approval dialog

### 5.8 Sidebar

**Test Cases:**
- [ ] Sidebar collapse/expand
- [ ] Settings menu expand/collapse
- [ ] Navigation links work
- [ ] Profile selector works
- [ ] Active sessions list
- [ ] Session navigation
- [ ] Sidebar resize handle
- [ ] Footer shows version

---

## Part 6: Integration Tests

### 6.1 Full Agent Workflow

```javascript
// Complete agent flow test
// 1. Create session
const session = await window.electron.ipcRenderer.invoke('createMcpTextInput', {
  text: 'What is 2+2?'
});

// 2. Wait for completion
await new Promise(r => setTimeout(r, 5000));

// 3. Verify session completed
const sessions = await window.electron.ipcRenderer.invoke('getAgentSessions');
const completed = sessions.recentSessions.find(s => s.conversationId === session.conversationId);
// Expect: Session in recentSessions with completed status
```

**Test Cases:**
- [ ] Text input → Agent session → Tool calls → Completion
- [ ] Voice input → Transcription → Agent session → Completion
- [ ] Session with multiple tool calls
- [ ] Session with approval required
- [ ] Session with error recovery
- [ ] Session with follow-up messages
- [ ] Multi-session concurrent execution

### 6.2 Profile Switching Workflow

**Test Cases:**
- [ ] Create profile A with specific MCP config
- [ ] Create profile B with different MCP config
- [ ] Switch to profile A, verify tools
- [ ] Switch to profile B, verify tools
- [ ] Running session maintains profile snapshot

### 6.3 Message Queue Workflow

**Test Cases:**
- [ ] Enable message queueing
- [ ] Start agent session
- [ ] Send additional message while active
- [ ] Verify message queued
- [ ] Session completes
- [ ] Queued message processes
- [ ] Verify both responses saved

### 6.4 OAuth Workflow

**Test Cases:**
- [ ] Configure server with OAuth
- [ ] Attempt connection (401)
- [ ] Complete OAuth flow
- [ ] Verify tokens stored
- [ ] Connection succeeds
- [ ] Token refresh works

### 6.5 Elicitation Workflow

**Test Cases:**
- [ ] MCP server requests form elicitation
- [ ] Dialog shows with form fields
- [ ] Submit form with valid data
- [ ] Data returned to server
- [ ] URL elicitation opens browser

### 6.6 Sampling Workflow

**Test Cases:**
- [ ] MCP server requests sampling
- [ ] Dialog shows request details
- [ ] Approve sampling
- [ ] LLM executes with config
- [ ] Response returned to server

---

## Part 7: Error Handling Tests

### 7.1 Agent Errors

**Test Cases:**
- [ ] LLM API error shows in session
- [ ] Tool execution error shows in session
- [ ] Retry button appears on error
- [ ] Retry creates new session
- [ ] Emergency stop cancels all

### 7.2 MCP Errors

**Test Cases:**
- [ ] Server connection failure handled
- [ ] Server crash during tool call
- [ ] Tool timeout returns error
- [ ] Invalid tool arguments error

### 7.3 UI Errors

**Test Cases:**
- [ ] Navigation to invalid route
- [ ] Form validation errors display
- [ ] API errors show toast

---

## Part 8: Performance Tests

### 8.1 Stress Tests

**Test Cases:**
- [ ] 5 concurrent agent sessions
- [ ] 10 queued messages
- [ ] Large tool response (1MB)
- [ ] 50 conversation history items
- [ ] Rapid session create/destroy

### 8.2 Memory Tests

**Test Cases:**
- [ ] Memory stable after 10 sessions
- [ ] Memory cleared after session dismiss
- [ ] No leaks on profile switch

---

## Test Execution Framework

### Test Runner Structure

```javascript
// test-runner.js - Execute via electron_execute
const tests = {
  // Test definitions
};

async function runTests() {
  const results = [];
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    }
  }
  return results;
}

// Store results
state.testResults = await runTests();
state.testResults;
```

### Test Utilities

```javascript
// Utility: Wait for condition
async function waitFor(condition, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timeout waiting for condition');
}

// Utility: IPC call
async function ipc(method, args = {}) {
  return window.electron.ipcRenderer.invoke(method, args);
}

// Utility: Navigate
async function navigate(route) {
  window.location.hash = route;
  await new Promise(r => setTimeout(r, 500));
}

// Utility: DOM query
function $(selector) {
  return document.querySelector(selector);
}
```

---

## Implementation Roadmap

### Phase 1: Infrastructure (Week 1)
- [ ] Set up test runner framework
- [ ] Implement test utilities
- [ ] Create base test cases for IPC
- [ ] Validate CDP connection stability

### Phase 2: Core Tests (Week 2)
- [ ] Agent session tests
- [ ] MCP tool tests
- [ ] IPC procedure tests
- [ ] Configuration tests

### Phase 3: UI Tests (Week 3)
- [ ] Navigation tests
- [ ] Settings page tests
- [ ] Session UI tests
- [ ] Dialog tests

### Phase 4: Integration (Week 4)
- [ ] Full workflow tests
- [ ] Error handling tests
- [ ] Performance tests
- [ ] Edge case coverage

---

## Maintenance

### Adding New Tests

1. Identify feature category
2. Create test case in appropriate section
3. Implement using `electron_execute`
4. Add to test runner
5. Document expected behavior

### CI/CD Integration

```bash
# Run in CI
REMOTE_DEBUGGING_PORT=9222 pnpm dev -- -d &
sleep 10
# Connect and run tests via MCP
# Parse results
# Exit based on pass/fail
```

---

## References

- [DEBUGGING.md](./DEBUGGING.md) - Debug logging and CDP setup
- [apps/desktop/src/main/tipc.ts](./src/main/tipc.ts) - All IPC procedures
- [apps/desktop/src/main/renderer-handlers.ts](./src/main/renderer-handlers.ts) - Push handlers
- [apps/desktop/src/shared/types.ts](./src/shared/types.ts) - Type definitions
