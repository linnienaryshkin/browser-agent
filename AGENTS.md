# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (http://localhost:5173)
npm run build     # Type-check + production build
npm run lint      # ESLint
npm run format    # Prettier (formats src/)
```

## Architecture

This is a React + TypeScript + Vite app called **BrowserAgent** — a hands-on learning curriculum for the Anthropic TypeScript SDK. It targets frontend engineers preparing for the Anthropic Architect Certification.

**Challenge structure** — each challenge lives in `src/challenges/challenge.<name>.tsx` as a self-contained chat component with progressively more features. Each challenge is fully working and ready to run. `Exercise.tsx` is a blank template for learners who want to code from scratch.

**App shell** (`src/App.tsx`) — renders challenges as tabs via React Router. Theme state (light/dark) lives in `main.tsx` and is persisted in the `?theme=` URL param. Exposed globals: `window.getTheme()`, `window.setTheme(mode)`, `window.toggleTheme()`.

**API proxy** — the Vite dev server proxies `/api/anthropic` → `https://api.anthropic.com` to avoid CORS in the browser. Components must set `baseURL: \`${window.location.origin}/api/anthropic\`` and `dangerouslyAllowBrowser: true` when constructing the Anthropic client.

**MCP server** — a local MCP server runs as Vite middleware at `POST /mcp` (Streamable HTTP / JSON-RPC). Defined in `src/mcp-lamp-server.ts`. Exposes `get_real_name` (reads OS username via Node's `os.userInfo()`). State is in-memory.

**Env vars** — `ANTHROPIC_API_KEY` is exposed to the browser via `import.meta.env.ANTHROPIC_API_KEY` (`envPrefix: ['ANTHROPIC_']` in `vite.config.ts`). Copy from `.env.example`.

## Challenge Progression

| Tab | File | Key concept |
| ----- | ------ | ------------- |
| Hello | `challenge.hello.tsx` | Create client, send message, display reply |
| Memory | `challenge.memory.tsx` | Pass full history (stateless API) |
| Tool | `challenge.tool.tsx` | `get_theme` tool, tool execution, `stop_reason` |
| Input | `challenge.input.tsx` | `set_theme` with structured input schema |
| Loop | `challenge.loop.tsx` | Multi-step tool reasoning with while loop |
| MCP | `challenge.mcp.tsx` | Discover + call remote MCP tools |

## Certification Domains Covered

- Domain 1: Agentic Architecture & Orchestration
- Domain 2: Tool Design & MCP Integration
- Domain 4: Prompt Engineering & Structured Output
- Domain 5: Context Management & Reliability

`docs/ANTHROPIC_API.md` covers key API concepts. `docs/MESSAGE_PROTOCOL.md` covers the message protocol and tool-use flow.
