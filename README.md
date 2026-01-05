# VibeCodeManager

🎙️ **Voice-driven orchestration of Claude Code** — Speak commands, Claude Code executes, hear responses. Zero API keys needed — just a Claude Pro subscription.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](./LICENSE)
[![Electron](https://img.shields.io/badge/Electron-31.0.2-47848f.svg)](https://electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)](https://reactjs.org/)

## ✨ What is VibeCodeManager?

VibeCodeManager lets you control Claude Code with your voice. The entire pipeline runs locally:

```
🎤 Voice → Local STT → Claude Code → Response → Local TTS → 🔊 Audio
```

- **Local STT**: FluidAudio/Parakeet (macOS 14+)
- **Local TTS**: Kitten TTS with 8 voices
- **No cloud APIs**: Everything runs on your machine

## 🚀 Quick Start

> **Requirements**: macOS 14+, Claude Pro subscription

### 1. Install Claude CLI
```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Build Local STT
```bash
cd apps/desktop
./scripts/build-swift.sh
```

### 3. Set up Local TTS
```bash
cd apps/desktop/speakmcp-tts
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

## 🎯 Usage

1. **Press hotkey** to start recording
2. **Speak your command** (e.g., "Create a new React component called Button")
3. **Claude Code executes** the request in your workspace
4. **Hear the response** via local TTS

## ✨ Features

| Category | Capabilities |
|----------|--------------|
| **🎤 Voice Input** | Local STT via FluidAudio, hold-to-record |
| **🔊 Voice Output** | Local TTS via Kitten, 8 voices available |
| **🤖 Claude Code** | Automatic workspace detection, pre-configured agent |
| **🔒 Privacy** | 100% local audio processing, no cloud APIs |
| **⚡ Simple Setup** | 3 settings pages: General, Providers, Agents |

## ⚙️ Configuration

VibeCodeManager comes pre-configured for local-first operation:

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

No API keys required — just authenticate with Claude Pro.

## 🛠️ Development

```bash
git clone https://github.com/aj47/VibeCodeManager.git && cd VibeCodeManager
pnpm install && pnpm -w run build:shared && cd apps/desktop && npm run dev
```

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for architecture details and troubleshooting.

## 🤝 Contributing

We welcome contributions! Fork the repo, create a feature branch, and open a Pull Request.

**💬 Get help on [Discord](https://discord.gg/cK9WeQ7jPq)** | **🌐 More info at [techfren.net](https://techfren.net)**

## 📄 License

This project is licensed under the [AGPL-3.0 License](./LICENSE).

## 🙏 Acknowledgments

Built on [Whispo](https://github.com/egoist/whispo) • Powered by [Anthropic Claude Code](https://anthropic.com/) • [Electron](https://electronjs.org/) • [React](https://reactjs.org/)

---

**Made with ❤️ by the VibeCodeManager team**
