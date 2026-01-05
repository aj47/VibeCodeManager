# VibeCodeManager Handoff Document

## Vision
Voice-driven orchestration of parallel Claude Code agents. Users speak commands, local STT transcribes, Claude Code executes, and local TTS responds. Zero API keys needed - just a Claude Pro subscription.

## Current State (v0.1.0)

### What's Done
- [x] Local STT (FluidAudio/Parakeet) - Swift CLI wrapper
- [x] Local TTS (Kitten TTS) - Python wrapper with 8 voices
- [x] Local provider UI in settings
- [x] Rebranded to VibeCodeManager with separate config storage
- [x] ACP infrastructure exists (from SpeakMCP)
- [x] Session grid UI exists (from SpeakMCP)

### What's NOT Done
- [ ] Connect voice input directly to Claude Code agent
- [ ] Test end-to-end voice loop
- [ ] Strip unnecessary SpeakMCP features
- [ ] Project/workspace management for parallel agents

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
| **Rust binary** | `speakmcp-rs/` folder | Was for fast transcription, now using FluidAudio |
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

## Phase 2: Connect Voice to Claude Code

### Current Flow (SpeakMCP)
```
Voice → STT → Transcript → [Paste to clipboard OR Send to built-in LLM agent]
```

### Target Flow (VibeCodeManager)
```
Voice → Local STT → Claude Code (via ACP) → Response → Local TTS → Audio
```

### Implementation Tasks

#### 1. Create Voice-to-Agent Pipeline
**File:** `src/main/voice-agent-pipeline.ts` (new)

```typescript
// Pseudocode for the new pipeline
export async function processVoiceCommand(audioBuffer: ArrayBuffer) {
  // 1. Transcribe with local STT
  const transcript = await transcribeLocal(audioBuffer)

  // 2. Send to Claude Code via ACP
  const response = await sendToClaudeCode(transcript.text)

  // 3. Synthesize response with local TTS
  const audio = await synthesizeLocal(response.summary)

  // 4. Play audio
  await playAudio(audio)
}
```

#### 2. Modify Recording Handler
**File:** `src/main/tipc.ts`

Change `createRecording` to:
- Remove clipboard paste logic
- Add option to route to Claude Code agent
- Return agent response for TTS

#### 3. Add Agent Response TTS
**File:** `src/main/agent-tts.ts` (new)

- Subscribe to agent progress events
- Extract "summary" or final response
- Send to TTS
- Queue audio playback

#### 4. Update Panel UI
**File:** `src/renderer/src/pages/panel.tsx`

- Show "Listening..." → "Processing..." → "Speaking..." states
- Display transcription and agent response
- Add manual text input option

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
├── speakmcp-swift/           # Rename to vibecode-stt/
├── speakmcp-tts/             # Rename to vibecode-tts/
└── resources/
    └── bin/
        └── speakmcp-stt      # Rename to vibecode-stt
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

### Testing Local STT
```bash
# Build the Swift STT binary (requires macOS 14+)
cd apps/desktop
./scripts/build-swift.sh

# Test it
./resources/bin/speakmcp-stt test.wav
```

### Testing Local TTS
```bash
# Set up Python venv
cd apps/desktop/speakmcp-tts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Test it
python tts.py output.wav --text "Hello world" --voice expr-voice-2-f
```

---

## Priority Order

1. **Strip** - Remove unused code (1-2 days)
2. **Connect** - Voice → Claude Code pipeline (2-3 days)
3. **Workspace** - Project management UI (2-3 days)
4. **Polish** - Demo-ready state (1-2 days)

Total estimate: ~1 week for MVP
