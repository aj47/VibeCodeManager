# VibeCodeManager Handoff Document

## Vision
Voice-driven orchestration of parallel Claude Code agents. Users speak commands, local STT transcribes, Claude Code executes, and local TTS responds. Zero API keys needed - just a Claude Pro subscription.

## Current State (v0.1.0)

### What's Done
- [x] Local STT (FluidAudio/Parakeet) - Swift CLI wrapper (`vibecode-stt` binary)
- [x] Local TTS (Kitten TTS) - Python wrapper with 8 voices
- [x] Local provider UI in settings
- [x] Rebranded to VibeCodeManager with separate config storage
- [x] ACP infrastructure exists (from VibeCodeManager)
- [x] Session grid UI exists (from VibeCodeManager)
- [x] **Voice-to-Claude-Code pipeline** - `voice-agent-pipeline.ts` with `processVoiceCommand()` and `processTextCommand()`
- [x] **Text input via panel** - Routes through Claude Code via ACP when `voiceToClaudeCodeEnabled: true`
- [x] **Conversation history in UI** - Fixed progress updates to include `conversationHistory` for proper UI display

### What's NOT Done
- [ ] Strip unnecessary VibeCodeManager features
- [ ] Project/workspace management for parallel agents
- [ ] Full end-to-end voice loop testing (text input tested, voice recording needs testing)

---

## Phase 1: Strip Unnecessary Features

### Remove Completely
These features are not relevant to VibeCodeManager's mission:

| Feature | Files to Remove/Modify | Reason |
|---------|----------------------|--------|
| **Clipboard paste mode** | `tipc.ts` (createRecording paste logic) | We send to Claude Code, not clipboard |
| **Transcript post-processing** | `tts-llm-preprocessing.ts`, `structured-output.ts` | Claude Code handles all processing |
| **Cloud STT providers** | Keep code but deprioritize in UI | Local-first, cloud as fallback |
| **Cloud TTS providers** | Keep code but deprioritize in UI | Local-first, cloud as fallback |
| **Built-in MCP tool execution** | `mcp-service.ts` (partially) | Claude Code has its own MCP |
| **Built-in LLM chat** | `llm.ts`, `llm-fetch.ts` | Claude Code is the LLM |
| **Remote server** | `remote-server.ts`, `cloudflare-tunnel.ts` | Not needed for local-first |
| **A2A protocol** | `src/main/a2a/` folder | Focus on ACP only |
| **Rust binary** | `vibecode-rs/` folder | Was for fast transcription, now using FluidAudio |
| **Mobile app** | `apps/mobile/` folder | Desktop-only for now |

### Simplify These
| Feature | Current State | Simplified State |
|---------|--------------|------------------|
| **Settings pages** | 7+ settings pages | 3 pages: General, Voice (STT/TTS), Agents |
| **Provider selection** | OpenAI/Groq/Gemini/Local | Local (default) + "Advanced" for cloud |
| **Profiles** | Full profile system | Simplified "Workspaces" for project context |
| **Recording history** | Full history with replay | Remove or minimize |

### Keep As-Is
- Session grid (`sessions.tsx`, `session-grid.tsx`, `session-tile.tsx`)
- ACP agent management (`settings-acp-agents.tsx`, `src/main/acp/`)
- Multi-agent progress view (`multi-agent-progress-view.tsx`)
- Active agents sidebar (`active-agents-sidebar.tsx`)
- Theme system
- Keyboard shortcuts (but simplify)

---

## Phase 2: Connect Voice to Claude Code ✅ DONE

### Current Flow (VibeCodeManager)
```
Voice/Text → Local STT (if voice) → Claude Code (via ACP) → Response → Local TTS → Audio
```

### Implementation Status

#### 1. Voice-to-Agent Pipeline ✅
**File:** `src/main/voice-agent-pipeline.ts`

Two main functions implemented:
- `processVoiceCommand(audioBuffer)` - Records voice → STT → Claude Code → TTS
- `processTextCommand(text)` - Text input → Claude Code → TTS

Both functions:
- Track `conversationHistory` for UI display
- Emit proper `agentProgress` updates
- Handle TTS synthesis of agent responses

#### 2. Recording Handler ✅
**File:** `src/main/tipc.ts`

- `createMcpTextInput` routes to `processTextCommand()` when `voiceToClaudeCodeEnabled: true`
- `createVoiceCommand` routes to `processVoiceCommand()`
- Returns `conversationId` for tracking

#### 3. Agent Response TTS ✅
Built into `voice-agent-pipeline.ts`:
- Extracts text response from Claude Code
- Sends to local TTS (Kitten TTS)
- Audio plays automatically via `playTtsAudioFile()`

#### 4. Panel UI ✅
**File:** `src/renderer/src/pages/panel.tsx`

- Shows conversation history (user messages + assistant responses)
- Fixed "Initializing..." bug by including `conversationHistory` in progress updates
- Text input panel available for manual input

---

## Phase 3: Project/Workspace Management

### Concept
Each "workspace" is a directory where Claude Code runs. Users can:
- Have multiple workspaces open simultaneously
- Each workspace = one Claude Code session
- Voice commands are routed to focused workspace

### UI Components Needed

#### 1. Workspace Sidebar
```
┌─────────────────────┐
│ WORKSPACES          │
├─────────────────────┤
│ ● my-app (active)   │  ← Green dot = focused
│ ○ api-server        │  ← Gray = backgrounded
│ ○ shared-lib        │
│ + Add Workspace     │
└─────────────────────┘
```

#### 2. Workspace Tile (in grid)
Each tile shows:
- Workspace name/path
- Claude Code session status
- Last activity/output
- Quick actions (focus, stop, restart)

#### 3. Workspace Settings
- Working directory path
- Claude Code arguments/flags
- Auto-start on app launch
- MCP servers to enable (passed to Claude Code)

### Data Model
```typescript
interface Workspace {
  id: string
  name: string
  path: string  // Working directory
  claudeCodeArgs?: string[]
  mcpServers?: string[]  // MCP server names to enable
  autoStart?: boolean
}
```

---

## Phase 4: Polish & Demo

### Demo Script
1. Launch VibeCodeManager
2. Add workspace pointing to a project
3. Press hotkey, say "Create a new React component called Button"
4. Watch Claude Code execute in the tile
5. Hear TTS summary: "I've created Button.tsx with props for variant and size"
6. Add second workspace, demonstrate parallel execution

### Polish Items
- [ ] App icon (new design for VibeCodeManager)
- [ ] Onboarding flow (install claude-code-acp, grant mic permission)
- [ ] Error handling for missing dependencies
- [ ] Keyboard shortcuts card
- [ ] "What can I say?" help panel

---

## File Structure After Cleanup

```
apps/desktop/
├── src/
│   ├── main/
│   │   ├── index.ts              # App entry
│   │   ├── config.ts             # Config storage
│   │   ├── window.ts             # Window management
│   │   ├── keyboard.ts           # Hotkeys (simplified)
│   │   ├── local-audio.ts        # Local STT/TTS
│   │   ├── voice-agent-pipeline.ts  # NEW: Voice→Claude Code→TTS
│   │   ├── workspace-manager.ts  # NEW: Workspace management
│   │   ├── acp/                  # ACP client (keep)
│   │   │   ├── acp-client-service.ts
│   │   │   ├── acp-process-manager.ts
│   │   │   └── acp-registry.ts
│   │   └── tipc.ts               # IPC (simplified)
│   ├── renderer/
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── sessions.tsx      # Main workspace grid
│   │       │   ├── settings-general.tsx
│   │       │   ├── settings-voice.tsx    # NEW: Combined STT/TTS
│   │       │   └── settings-agents.tsx   # NEW: Combined ACP
│   │       └── components/
│   │           ├── session-grid.tsx
│   │           ├── session-tile.tsx
│   │           ├── workspace-sidebar.tsx  # NEW
│   │           └── voice-status.tsx       # NEW
│   └── shared/
│       ├── types.ts
│       └── index.ts
├── vibecode-stt/             # Local STT binary
├── vibecode-tts/             # Local TTS wrapper
└── resources/
    └── bin/
        └── vibecode-stt      # Local STT binary
```

---

## Quick Start for Next Developer

```bash
# Clone the repo
git clone git@github.com:aj47/VibeCodeManager.git
cd VibeCodeManager

# Install dependencies
pnpm install

# Build shared packages
pnpm -w run build:shared

# Install Claude Code ACP adapter globally
npm install -g @anthropic-ai/claude-code-acp

# Run in development
cd apps/desktop
npm run dev
```

### Building Local STT (Required)
```bash
# Build the Swift STT binary (requires macOS 14+)
cd apps/desktop
./scripts/build-swift.sh

# Verify it's built
ls -la resources/bin/vibecode-stt
```

### Setting Up Local TTS (Required)
```bash
# Set up Python venv (use Python 3.12, not 3.14 due to dependency issues)
cd apps/desktop/vibecode-tts
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Test it
python tts.py output.wav --text "Hello world" --voice expr-voice-2-f
```

### Verifying the Pipeline
1. Run the app: `npm run dev`
2. Open the panel UI
3. Enter text in the text command input
4. Verify:
   - Message appears in conversation history (not stuck on "Initializing...")
   - Claude Code responds via ACP
   - Response is spoken via TTS

---

## Priority Order

1. ~~**Connect** - Voice → Claude Code pipeline~~ ✅ DONE
2. **Strip** - Remove unused code (1-2 days)
3. **Workspace** - Project management UI (2-3 days)
4. **Polish** - Demo-ready state (1-2 days)

## Recent Fixes (Jan 5, 2026)

1. **Built STT binary** - Ran `./scripts/build-swift.sh` to build `vibecode-stt`
2. **Set up TTS environment** - Created Python 3.12 venv at `vibecode-tts/.venv`
3. **Fixed text input routing** - Added `processTextCommand()` in `voice-agent-pipeline.ts` to route text input through Claude Code ACP instead of OpenAI API
4. **Fixed "Initializing..." UI bug** - Added `conversationHistory` tracking to progress updates so UI displays actual messages
