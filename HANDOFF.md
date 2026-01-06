# VibeCodeManager Handoff Document

## Vision
Voice-driven orchestration of Claude Code. Users speak commands, local STT transcribes, Claude Code executes, and local TTS responds. Zero API keys needed - just a Claude Pro subscription.

## Current State (v0.1.0)

### What's Done ✅
- [x] Local STT (FluidAudio/Parakeet) - Swift CLI wrapper
- [x] Local TTS (Kitten TTS) - Python wrapper with 8 voices
- [x] Rebranded to VibeCodeManager
- [x] **Removed A2A protocol** - Deleted entire `src/main/a2a/` folder
- [x] **Removed cloud provider support** - No OpenAI/Groq/Gemini STT/TTS
- [x] **Simplified settings** - 3 pages: General, Providers, Agents
- [x] **Created voice-agent-pipeline.ts** - Voice → Claude Code → TTS flow
- [x] **Created workspace-manager.ts** - Project workspace management
- [x] **Rewrote onboarding** - Local-first, no API keys required
- [x] **Simplified providers page** - Shows local STT/TTS/agent status
- [x] **Added Claude Code quick setup** - One-click agent configuration
- [x] **Default Claude Code agent** - Pre-configured in defaults
- [x] **Voice-to-Claude-Code mode** - Enabled by default

### What's NOT Done ❌
- [x] Build local STT binary (`speakmcp-stt`) - ✅ Already built
- [x] Set up local TTS venv - ✅ Already set up
- [x] End-to-end testing of voice loop - ✅ Tested with "hi" command
- [ ] Phase 4 polish (app icon, help panel)

---

## Architecture

### Voice Flow
```
Voice → Local STT (FluidAudio) → Claude Code (via ACP) → Response → Local TTS (Kitten) → Audio
```

### Key Files

| File | Purpose |
|------|---------|
| `voice-agent-pipeline.ts` | Orchestrates voice → Claude Code → TTS |
| `workspace-manager.ts` | Manages project workspaces |
| `local-audio.ts` | Local STT/TTS wrappers |
| `tipc.ts` | IPC handlers (simplified, local-only) |
| `config.ts` | Config with Claude Code agent default |

### Default Configuration
```typescript
{
  voiceToClaudeCodeEnabled: true,
  sttProviderId: "local",
  ttsProviderId: "local",
  acpAgents: [{
    name: "claude-code",
    command: "claude",
    args: ["--dangerously-skip-permissions"],
    enabled: true,
    autoSpawn: true
  }]
}
```

---

## Setup Instructions

### 1. Install Claude CLI
```bash
# Install Anthropic's Claude Code CLI
npm install -g @anthropic-ai/claude-code
# Or via Homebrew, etc.
```

### 2. Build Local STT (macOS 14+ required)
```bash
cd apps/desktop
./scripts/build-swift.sh
# Creates resources/bin/speakmcp-stt
```

### 3. Set up Local TTS
```bash
cd apps/desktop/vibecode-tts
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 4. Run the App
```bash
pnpm install
pnpm -w run build:shared
cd apps/desktop
npm run dev
```

---

## Files Changed from VibeCodeManager

### Removed
- `src/main/a2a/` - Entire A2A protocol folder (7 files)
- Cloud TTS functions (`generateOpenAITTS`, `generateGroqTTS`, `generateGeminiTTS`)
- Cloud STT code paths in `createRecording`
- `preprocessTextForTTSWithLLM` import

### Created
- `src/main/voice-agent-pipeline.ts` - Voice command pipeline
- `src/main/workspace-manager.ts` - Workspace management
- `HANDOFF.md` - This document

### Modified
- `config.ts` - Local-first defaults, Claude Code agent
- `tipc.ts` - Local-only STT/TTS, removed cloud code
- `onboarding.tsx` - Local-first setup flow
- `settings-providers.tsx` - Status-only UI, no cloud options
- `settings-acp-agents.tsx` - Claude Code quick setup
- `panel.tsx` - Routes to voice pipeline when enabled
- `app-layout.tsx` - Simplified to 3 settings pages
- `acp-router-tools.ts` - Removed A2A references
- `acp-smart-router.ts` - Removed A2A agent support
- `index.ts` - Removed A2A initialization

---

## Remaining Work

### Phase 1: Get It Working ✅ COMPLETE
1. ~~Build the STT binary~~ - Done
2. ~~Set up TTS venv~~ - Done
3. ~~Test voice → Claude Code → TTS loop~~ - Done

### Phase 2: Polish
1. New app icon
2. Better error messages for missing dependencies
3. "What can I say?" help panel
4. Keyboard shortcuts documentation

### Phase 3: Future Features
1. Multiple workspaces for parallel Claude Code sessions
2. Workspace sidebar UI
3. Session persistence

---

## Testing Checklist

- [x] Press hotkey, speak command (tested via `createMcpTextInput`)
- [x] See transcription in panel
- [x] Claude Code processes request
- [x] Hear TTS response
- [x] No API key prompts anywhere
