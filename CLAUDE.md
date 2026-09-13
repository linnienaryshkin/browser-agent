# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Type-check (tsc -b) then Vite production build
npm run lint       # ESLint
npm run format     # Prettier (writes src/)
```

No test suite exists.

## Architecture

A single-page React app where each **lab** is a self-contained chat component. The app is purely client-side — no backend. The Vite dev server acts as a proxy layer.

### Request flow

- **Anthropic API**: all `POST /api/anthropic/*` calls are proxied to `https://api.anthropic.com/*` (strips `origin`/`referer` headers to avoid CORS rejection). The SDK is initialized with `baseURL: window.location.origin/api/anthropic` and `dangerouslyAllowBrowser: true`.
- **MCP lamp server**: `POST /mcp` is handled by an in-process Vite middleware (`src/mcp-lamp-server.ts`) — a JSON-RPC 2.0 server that runs inside the dev process, not a separate service.
- **MCP weather server**: `POST /api/open-meteo.caseyjhand` is proxied to `https://open-meteo.caseyjhand.com/mcp`. This is a real remote MCP server using SSE (Streamable HTTP) transport — responses are multi-line `data: <json>` events; notifications arrive before the actual result, so parsing must skip lines without a `result` or `error` field.

### Theme system

`src/main.tsx` mounts `window.getTheme`, `window.setTheme`, and `window.toggleTheme` as global functions. Lab tools that manipulate theme call these directly. Theme mode is also persisted in the URL (`?theme=light|dark`).

### Adding a lab

1. Create `src/labs/<Name>.lab.tsx` — export a `Chat` function component.
2. Register in `src/App.tsx`: add an import, a `TABS` entry, and a `<Route>`.
3. If the lab needs a new external MCP server, add a proxy entry in `vite.config.ts`.

### Lab file conventions

Each `.lab.tsx` opens with a large JSDoc comment block (ASCII box-drawing) documenting the concept, architecture, and a TEST prompt. The `Chat` component follows with no default export. Reference the existing labs (`Loop.lab.tsx`, `Streaming.lab.tsx`, `Mcp.lab.tsx`, `Meteo.lab.tsx`) for the established patterns around the agent loop, tool execution, streaming, and MCP discovery.

| Lab | Path | Concept |
|-----|------|---------|
| Hello | `/hello` | Single-turn text response |
| Memory | `/memory` | Multi-turn conversation history |
| Tool | `/tool` | Single tool call |
| Input | `/input` | Structured input / user-facing forms |
| Loop | `/loop` | Agentic loop with parallel tool use |
| Streaming | `/streaming` | Token-by-token streaming + TTFT measurement |
| MCP | `/mcp-lab` | In-process MCP lamp server (JSON-RPC 2.0) |
| Meteo | `/meteo` | Remote MCP weather server (SSE transport) |
