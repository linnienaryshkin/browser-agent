# [BrowserAgent](https://github.com/linnienaryshkin/browser-agent)

Hands-on coding labs for learning the Anthropic API and building agentic systems — in a running React app, in your browser.

Each lab is a fully working chat with progressively more capabilities.

## Who this is for

- **React engineers** who want to understand how the Anthropic API actually works — context, tool use, MCP — using patterns they already know
- **Agent builders** who want hands-on experience with agentic loops, tool design, and orchestration in a friendly JS environment
- **Certification candidates** preparing for the Anthropic Architect Certification

## Quick Start

```bash
npm install
cp .env.example .env   # paste your Anthropic API key
npm run dev            # http://localhost:5173
```

## Labs

| Tab       | Name            | What you learn                                                               |
| --------- | --------------- | ---------------------------------------------------------------------------- |
| Hello     | First message   | Create an Anthropic client, send a message, display the reply                |
| Memory    | Context         | Pass full history so the model remembers prior turns                         |
| Tool      | Tool use        | Define `get_theme`, handle `stop_reason: 'tool_use'`, execute tools          |
| Input     | Input schema    | Add `set_theme` with structured input (`{ theme: "light" \| "dark" }`)      |
| Loop      | Multi-step      | Multiple tool calls in one request with a `while` loop                       |
| Streaming | Streaming       | Token-by-token streaming with TTFT measurement                               |
| MCP       | Local MCP       | Discover and call tools from a local MCP server via Streamable HTTP          |
| Meteo     | Remote MCP      | Connect to a real remote MCP server (open-meteo) via Vite proxy              |

## UI

The top-right hamburger menu lets you switch the **theme** (light/dark) and pick the **model** (Haiku / Sonnet / Opus) used across all labs.

## Scripts

| Command          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Start the development server (includes MCP at `/mcp`) |
| `npm run lint`   | Run ESLint                                           |
| `npm run format` | Format code with Prettier                            |

## Tech Stack

- React + TypeScript + Vite
- Material UI (MUI)
- @anthropic-ai/sdk

## Prerequisites

- Node.js 20+
- An Anthropic API key ([setup guide](docs/API_KEY_SETUP.md))
