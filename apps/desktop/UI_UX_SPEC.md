# UI/UX Spec: Multi-Project Voice-First Agent Manager

## Core Philosophy

**Voice-first, minimal cognitive load, hierarchical navigation with instant context switching.**

The goal is to manage 2-5 projects with multiple Claude Code agents through seamless voice and text input, requiring minimal button presses and cognitive effort.

---

## Architecture: 3-Level Zoom Navigation

| Level | View | What You See |
|-------|------|--------------|
| **1. All Projects** | Dashboard | Compact cards for each project with status, activity, agent counts |
| **2. Single Project** | Project View | All agents in that project, their status, quick actions |
| **3. Single Agent** | Terminal View | Streaming output, full conversation, real-time actions |

### Navigation
- **Drill down:** Click or voice command (e.g., "Open Backend project", "Focus on Agent 2")
- **Zoom out:** Back button or voice (e.g., "Go back", "Show all projects")
- Traditional hierarchical navigation with voice augmentation

---

## Persistent UI Elements

### 1. Command Bar (Bottom - Always Visible)
- Spotlight/Alfred-style input always ready
- Supports both voice and text input
- Shows current context (which project/agent is targeted)
- Visual indicator when listening for voice

### 2. Agent Sidebar (Persistent)
- Lists all agents across all projects
- Status indicators per agent:
  - 🟢 Active/working
  - 🟡 Waiting for input/approval
  - 🔴 Error/stopped
  - ⚪ Idle
- Click to focus, or use voice/number targeting
- Collapsible per project

### 3. Floating Notification Badges
- Non-intrusive popups when agents need attention
- Stack in corner, auto-dismiss after action
- Click to jump to agent

### 4. Audio Cues
- Distinct sounds for:
  - Agent completed task
  - Agent encountered error
  - Agent needs approval/input
  - New agent spawned

---

## Voice Command System

### Activation Methods (Hybrid)
1. **Push-to-talk hotkey** - Hold key, speak, release (current behavior, keep it)
2. **Wake word** - "Hey Vibe" triggers listening mode (optional, user-configurable)

### Targeting Methods

Flexible targeting - all methods work:

| Method | Example | Use Case |
|--------|---------|----------|
| **By Name** | "Hey Backend, fix the auth bug" | Named projects/agents |
| **By Number** | "Agent 2, run the tests" | Quick numeric refs shown on screen |
| **Context-Aware** | Just speak the command | Auto-targets currently focused item |

### Voice Command Vocabulary

#### Sending Prompts
- "Tell [name/number] to [task]"
- "Hey [name], [task]"
- "[name], [task]"
- Just "[task]" → goes to focused agent

#### Navigation
- "Switch to [project name]"
- "Open [project name]"
- "Focus on [agent name/number]"
- "Go back" / "Zoom out"
- "Show all projects"

#### Status Checks
- "What's everyone working on?"
- "Status" / "What's the status?"
- "What is [name] doing?"
- "Any agents need help?"

#### Control
- "Stop [name]" / "Pause [name]"
- "Resume [name]"
- "Cancel that"

#### Approvals (when prompted)
- "Yes" / "Approve" / "Do it"
- "No" / "Deny" / "Cancel"
- "Show me more" (for details before deciding)

---

## Status & Response Behavior

### Status Requests
**Format:** Audio summary + visual update simultaneously

Example:
- **Voice says:** "3 agents active. Backend is running tests. Frontend is waiting for approval. API is idle."
- **Screen shows:** Updated sidebar with current states, activity feed refreshes

### Agent Responses
**Format:** Speak summaries, show full in UI

Example:
- **Voice says:** "Done! I fixed the authentication bug. Check the screen for the diff."
- **Screen shows:** Full response, code changes, tool outputs in terminal view

### Approval Interrupts
**Format:** Speak immediately, await voice response

Example:
- **Voice says:** "Backend needs approval to delete 5 files. Say yes or no, or say 'show me' for details."
- **Screen shows:** Approval dialog with file list, approve/deny buttons
- **User can respond:** Voice ("yes", "no", "show me") or click buttons

---

## View Specifications

### Level 1: All Projects Dashboard

Compact cards showing everything at a glance:

```
┌─────────────────────────────────────────┐
│ 🟢 Backend API                [2 agents]│
│ Last: "Fixed auth bug" - 2m ago         │
│ ██████████░░░░░░░░░░ 50%               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🟡 Frontend App               [1 agent] │
│ Last: "Waiting for approval" - 30s ago  │
│ ████████████████░░░░ 80%               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⚪ Mobile App                 [0 agents]│
│ Last: "Completed refactor" - 1h ago     │
│ No active tasks                         │
└─────────────────────────────────────────┘
```

**Card Contents:**
- Status indicator (color-coded)
- Project name
- Active agent count
- Most recent activity with timestamp
- Progress bar (if task in progress)

**Interactions:**
- Click card → drill to Level 2 (Project View)
- Voice: "Open Backend" → drill to Level 2
- Hover: Show quick actions (new agent, view history)

### Level 2: Single Project View

Shows all agents within one project:

```
┌─ Backend API ────────────────────────────────────┐
│                                                  │
│  Agent 1: "Fix auth bug"          🟢 Working    │
│  └─ Running tests... (step 3/5)                 │
│                                                  │
│  Agent 2: "Add rate limiting"     🟢 Working    │
│  └─ Editing middleware.ts                       │
│                                                  │
│  [+ New Agent]                                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Contents:**
- Project header with back navigation
- List of all agents with current task summary
- Status and current step for each
- Button/voice to spawn new agent

**Interactions:**
- Click agent → drill to Level 3 (Terminal View)
- Voice: "Focus on Agent 1" → drill to Level 3
- Voice: "New agent, implement caching" → spawn agent with task

### Level 3: Single Agent Terminal View

Full streaming terminal output:

```
┌─ Agent 1: Fix auth bug ──────────────────────────┐
│                                                  │
│ > Analyzing the authentication flow...           │
│                                                  │
│ I found the issue in auth/validate.ts:42.        │
│ The token expiry check is using < instead of <=  │
│                                                  │
│ [Tool Call] Edit auth/validate.ts                │
│ - Changed line 42: token.exp < now               │
│ + Changed line 42: token.exp <= now              │
│                                                  │
│ [Tool Call] Run tests                            │
│ > npm test                                       │
│ ✓ 47 tests passed                                │
│                                                  │
│ Done! The auth bug is fixed. All tests passing.  │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Follow-up input field]                     Send │
└──────────────────────────────────────────────────┘
```

**Contents:**
- Agent header with task name, back navigation
- Real-time streaming output (thoughts, tool calls, results)
- Syntax-highlighted code changes
- Collapsible sections for verbose output
- Follow-up input at bottom

**Interactions:**
- Scroll through history
- Click tool calls to expand/collapse details
- Voice/text for follow-up prompts
- Voice: "Go back" → return to Level 2

---

## Sub-Agent Support

Agents can automatically spawn helper agents for task delegation.

### Behavior
- **Automatic:** No approval needed for spawning sub-agents
- **Visual hierarchy:** Parent-child relationship shown in UI
- **Audio notification:** Brief sound when sub-agent spawns
- **Voice announcement:** "Backend spawned a helper for database migrations"

### Display
```
Agent 1: "Fix auth bug"          🟢 Working
├─ Sub-agent: "Update tests"     🟢 Working
└─ Sub-agent: "Update docs"      ⚪ Completed
```

---

## Command Bar Specification

Always-visible input at bottom of screen:

```
┌──────────────────────────────────────────────────────────────┐
│ 🎤 [Talk to Backend Agent 1...]                         ⌘K  │
└──────────────────────────────────────────────────────────────┘
```

### States
1. **Idle:** Shows current target context, placeholder text
2. **Listening:** Microphone icon animates, waveform visualization
3. **Processing:** Shows "Thinking..." or agent name processing
4. **Text input:** Cursor in field, ready for typing

### Context Display
- Shows which project/agent will receive the command
- Updates as user navigates or explicitly targets
- Example placeholders:
  - "Talk to all projects..."
  - "Talk to Backend project..."
  - "Talk to Backend Agent 1..."

### Keyboard Shortcuts
- `Cmd+K` / `Ctrl+K` - Focus command bar
- `Enter` - Send text command
- `Escape` - Clear/unfocus
- Hotkey (configurable) - Activate voice

---

## Notification & Interrupt System

### Priority Levels

| Priority | Trigger | Audio | Visual |
|----------|---------|-------|--------|
| **Critical** | Agent needs approval | Speak immediately | Modal dialog |
| **High** | Agent error/failure | Alert sound | Floating badge + sidebar update |
| **Medium** | Agent completed task | Completion chime | Floating badge |
| **Low** | Agent spawned sub-agent | Subtle sound | Sidebar update only |

### Approval Flow

1. Agent reaches approval point
2. **Audio:** "Backend needs approval to delete 5 files. Say yes or no."
3. **Visual:** Dialog appears with details
4. **User responds:** Voice or click
5. Agent continues or cancels based on response

---

## Design Principles

1. **Voice-first:** Every action possible via voice
2. **Glanceable:** Status visible without interaction
3. **Progressive disclosure:** Details on demand, summaries by default
4. **Consistent targeting:** Same patterns work everywhere
5. **Minimal clicks:** Most workflows complete in 0-2 clicks
6. **Audio feedback:** Users know what's happening without looking
7. **Context preservation:** Never lose track of where you are

---

## Technical Considerations

### Voice Processing
- Local STT (existing FluidAudio/Parakeet)
- Wake word detection (new feature needed)
- Intent parsing for command recognition
- Name/number entity extraction for targeting

### State Management
- Extend Zustand stores for hierarchical navigation state
- Track focused project/agent across all views
- Persist last-used context for quick resume

### Audio System
- TTS for responses and announcements (existing)
- Sound effect library for notifications (new)
- Audio queue management for overlapping events

### Real-time Updates
- Streaming agent output via existing ACP
- WebSocket-ready infrastructure already in place
- Progress events for all agent state changes

---

## Migration Path

### Phase 1: Foundation
- Implement 3-level zoom navigation
- Add persistent command bar
- Enhance sidebar with all-agents view

### Phase 2: Voice Enhancement
- Add voice targeting (name/number parsing)
- Implement status check voice commands
- Add navigation voice commands

### Phase 3: Notifications
- Add audio cues for agent events
- Implement approval interrupts with voice response
- Add floating notification badges

### Phase 4: Polish
- Wake word activation (optional)
- Sub-agent visual hierarchy
- Refined audio feedback and TTS summaries
