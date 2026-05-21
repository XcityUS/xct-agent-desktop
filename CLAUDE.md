# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

xct-agent-desktop (Hermes Desktop) is a cross-platform Electron desktop app that wraps the Hermes Agent AI system. It provides a GUI for installing, configuring, and chatting with Hermes Agent — including session management, skills, model configuration, memory, authentication (GoTrue OAuth), wallet integration, and cloud features.

## Tech Stack

- **Runtime**: Electron 39.2
- **UI**: React 19.2 + TypeScript 5.9
- **Styling**: Tailwind CSS 4.2
- **Build**: Vite 7.2 + electron-vite 5.0
- **Database**: better-sqlite3 (local session storage with FTS5 full-text search)
- **Testing**: Vitest 4.1 with @testing-library/react, jsdom
- **i18n**: i18next 25.6 + react-i18next 15.7 (EN, ES, ZH-CN)
- **Validation**: Zod 4.3
- **Markdown**: react-markdown + remark-gfm + react-syntax-highlighter
- **Auto-Updates**: electron-updater 6.3
- **Icons**: lucide-react

## Commands

```bash
# Development
npm install              # Install dependencies
npm run dev              # Start dev server with hot reload
npm run dev:fresh        # Dev with fresh Hermes home directory

# Code quality
npm run lint             # ESLint with cache
npm run format           # Prettier formatting
npm run typecheck        # Type check all (node + web)
npm run typecheck:node   # Main process types only
npm run typecheck:web    # Renderer types only

# Testing
npm run test             # Run all tests once
npm run test:watch       # Watch mode

# Building
npm run build            # Full build (typecheck + Vite)
npm run build:mac        # macOS DMG/ZIP (Intel + Apple Silicon)
npm run build:win        # Windows NSIS installer
npm run build:linux      # Linux AppImage, DEB, RPM
npm run build:unpack     # Unpacked test build
npm run start            # Preview built app
```

## Directory Structure

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # Entry point, IPC handlers
│   ├── hermes.ts             # Hermes Agent API communication
│   ├── installer.ts          # Hermes installation/setup
│   ├── sse-parser.ts         # Server-Sent Events parsing
│   ├── cloud-api.ts          # Cloud API integration
│   ├── config.ts             # Configuration management
│   ├── sessions.ts           # Session history
│   ├── session-cache.ts      # Session caching with sync
│   ├── models.ts             # Model configuration CRUD
│   ├── memory.ts             # Memory system
│   ├── tools.ts              # Toolset management
│   ├── skills.ts             # Skill installation/listing
│   ├── cronjobs.ts           # Scheduled tasks
│   ├── soul.ts               # Persona editor
│   ├── profiles.ts           # Agent profile management
│   ├── cost-estimator.ts     # Token usage estimation
│   ├── auth/                 # OAuth, authentication, storage
│   └── wallet/               # XCT wallet integration
├── renderer/src/
│   ├── App.tsx               # Root component
│   ├── screens/              # UI screens (21 main screens)
│   │   ├── Chat/             # Main chat interface
│   │   ├── Sessions/         # Session history
│   │   ├── Agents/           # Profile management
│   │   ├── Skills/           # Skill marketplace
│   │   ├── Models/           # Model configuration
│   │   ├── Memory/           # Memory management
│   │   ├── Soul/             # Persona editor
│   │   ├── Tools/            # Toolset toggles
│   │   ├── Schedules/        # Cron job manager
│   │   ├── Gateway/          # Messaging platforms
│   │   ├── Office/           # Claw3d interface
│   │   ├── Settings/         # Provider config, backup/restore
│   │   ├── Auth/             # Sign-in/up/OAuth
│   │   ├── Install/          # First-run installer
│   │   └── Welcome/          # Welcome screen
│   ├── components/           # Shared UI components
│   ├── hooks/                # React hooks
│   └── lib/                  # Utilities (litellm-client.ts, etc.)
├── preload/
│   └── index.ts              # Secure IPC bridge (100+ channels)
└── shared/
    └── i18n/                 # Translation files (en, es, zh-CN)
tests/                        # Test suite
build/                        # Packaging assets (icons, entitlements)
```

## Code Conventions

- **TypeScript strict mode** across all projects (tsconfig.json, tsconfig.node.json, tsconfig.web.json)
- **React JSX runtime** — no explicit React import needed in .tsx files
- **Path alias**: `@renderer/*` for renderer imports
- **PascalCase** for components (Chat.tsx, Settings.tsx); **camelCase** for hooks (useI18n)
- **Import order**: external (electron, react) → internal (@renderer) → relative → types
- **ESLint**: @electron-toolkit/eslint-config-ts + React hooks + Prettier integration
- **IPC**: 100+ named channels; all async via typed promises through preload bridge

## Environment & Configuration

The app reads configuration from the Hermes home directory (`~/.hermes/`):
- `.env` — Hermes environment variables
- `config.yaml` — Main configuration
- `profiles/` — Named profile directories
- `state.db` — Session history (SQLite)
- `cron/jobs.json` — Scheduled tasks

**Connection modes**:
- **Local**: Hermes runs at `http://127.0.0.1:8642` (installed via built-in installer)
- **Remote**: Connect to external Hermes API via URL + API key

## Deployment

**Packaging** (via electron-builder):
- macOS: DMG + ZIP (code signing via entitlements.mac.plist)
- Linux: AppImage, DEB, RPM
- Windows: NSIS installer

**Release process** (GitHub Actions `release.yml`):
1. Push to `release` branch or manual dispatch
2. Builds on ubuntu (prepare), macos (x64 + arm64), linux, windows
3. Publishes to GitHub Releases with auto-update metadata

## Key Integration Points

- **Hermes Agent**: communicates via HTTP + SSE streaming to local or remote API
- **LiteLLM**: client integration for AI model routing
- **GoTrue OAuth**: sign-in/sign-up with XCT-Auth
- **XCT Wallet**: credit balance and billing integration
- **12+ LLM providers**: OpenRouter, Anthropic, OpenAI, etc. + local endpoints
- **16 messaging gateways**: Telegram, Discord, Slack, etc.
- **i18n**: runtime locale switching via `setLocale` IPC handler (EN, ES, ZH-CN)
