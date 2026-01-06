# Interview Mode

A discovery feature where AI personas interview you about your project(s) to help identify what to work on next.

## Purpose

Interview Mode helps you step back from coding to get a high-level view of your project state. An AI interviewer asks discovery questions, autonomously researches your codebase and GitHub issues, then synthesizes findings into prioritized work recommendations.

## How It Works

### 1. Start an Interview

**From Command Bar** (bottom of screen):
- Click the interview icon (speech bubble with question mark)
- Select a persona from the dropdown
- Scope is automatically determined by your current navigation level:
  - At project level → interviews that specific project
  - At dashboard level → interviews across all projects

**From Project Card** (on hover):
- Click the interview icon
- Starts with Project Manager persona for that project

### 2. Personas

| Persona | Focus | Good For |
|---------|-------|----------|
| **Project Manager** | Priorities, deadlines, blockers | Sprint planning, standup prep |
| **Tech Lead** | Architecture, tech debt, code quality | Technical reviews, refactoring decisions |
| **Product Owner** | User needs, features, roadmap | Feature prioritization, release planning |
| **Custom** | User-defined | Specialized workflows |

### 3. Interview Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. DISCOVERY                                           │
│     Persona asks 3-5 focused questions                  │
│     "What are your top priorities this week?"           │
│     "Any blockers or pain points?"                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. RESEARCH (autonomous)                               │
│     • Explores project structure                        │
│     • Reads README, CLAUDE.md, package.json             │
│     • Checks recent git commits                         │
│     • Fetches GitHub issues & PRs (if enabled)          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. SYNTHESIS                                           │
│     Combines your answers with research to produce:     │
│     • Prioritized work recommendations                  │
│     • Actionable next steps                             │
│     • Option to create GitHub issues                    │
└─────────────────────────────────────────────────────────┘
```

### 4. Output Options

After the interview, you can:
- **Continue the conversation** to dive deeper into any area
- **Create GitHub issues** for discovered work items (`gh issue create`)
- **Start working** on a recommended item immediately

## Settings

Found in **Settings → Interview Mode**:

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-Fetch GitHub Data | On | Fetch issues/PRs during research phase |
| Default Persona | Project Manager | Persona used when starting interviews |

## Visual Identification

Interview sessions appear with:
- **Purple border/background** in the sidebar (vs blue for regular sessions)
- **Speech bubble icon** next to the session
- Title prefixed with "Interview: [persona]"

## Technical Details

- Sessions use a custom system prompt combining persona instructions with research guidelines
- GitHub data fetched via `gh` CLI (issues: 30 limit, PRs: 15 limit)
- Interview sessions allow more iterations (15 vs default 10) for thorough discovery
- Tool approvals are skipped for research operations to maintain flow
