# BrowserAgent

Hands-on coding challenges for learning the Anthropic API and building agentic systems — in a running React app, in your browser.

Each challenge is a fully working chat with progressively more capabilities.

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

## Challenges

| Tab | Name | What you learn |
| ----- | ------ | ---------------- |
| Hello | First message | Create an Anthropic client, send a message, display the reply |
| Memory | Context | Pass full history so the model remembers prior turns |
| Tool | Tool use | Define `get_theme`, handle `stop_reason: 'tool_use'`, agent loop |
| Input | Input schema | Add `set_theme` with structured input (`{ theme: "light" | "dark" }`) |
| Loop | Multi-step | Toggle theme = get then set — multiple tool rounds per request |
| MCP | Remote tools | Discover and call tools from a local MCP server via Streamable HTTP |
| Solution | Complete | All features combined |

## Scripts

| Command | Description |
| --------- | ------------- |
| `npm run dev` | Start the development server (includes MCP server at `/mcp`) |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

## Tech Stack

- React + TypeScript + Vite
- Material UI (MUI)
- @anthropic-ai/sdk

## Prerequisites

- Node.js 20+
- An Anthropic API key ([setup guide](docs/API_KEY_SETUP.md))
