# AI Kata Evolution — Next Gen Plan

## Naming

Dropping "kata" everywhere. New unit name: **Challenge**.  
Folder convention: `src/challenges/challenge-NN-<slug>/`

---

## Challenge 01 — Basic Chat (existing, to be revised)

### Current state

Two tools (`set_theme`, `print_conversation`), single-round agent loop.

### Revision: get/set pattern

Replace the parameterless `set_theme` toggle with a **two-tool flow**:

| Tool | Input | Effect |
| ------ | ------- | -------- |
| `get_theme` | none | Returns `{ theme: "light" | "dark" }` |
| `set_theme` | `{ theme: "light" | "dark" }` | Calls `window.setTheme(value)` |

When user says "toggle theme", the model must:

1. Call `get_theme` to discover current state
2. Call `set_theme` with the opposite value

This teaches **multi-step tool reasoning** and a proper **agent loop** (multiple rounds of tool calls per user message). Structured input schema comes free.

`print_conversation` stays as an independent tool to preserve the **parallel tool calls** teaching moment.

---

## Challenge 02 — MCP Integration (Smart Lamp)

### Concept

A remote MCP server deployed on **Cloudflare Workers** (authless template + Durable Objects for state). Exposes a "smart lamp" the model can control:

| Tool | Input | Returns |
|------|-------|---------|
| `get_lamp_state` | none | `{ on: bool, brightness: 0-100 }` |
| `set_lamp_state` | `{ on?: bool, brightness?: 0-100 }` | updated state |

### Why Cloudflare Workers

- 100k requests/day free — plenty for a workshop
- Durable Objects give real persistent state across calls
- V8 isolates = no cold starts (Fly.io/Railway containers would be flaky)
- Agents SDK handles Streamable HTTP transport automatically

### Transport

**Streamable HTTP** (2025-03-26 spec, current standard). Single `POST /mcp` endpoint. Legacy SSE (`GET /sse`) is deprecated (410 Gone as of 2026-07-28 spec).

Server must set `cors: true` — most MCP servers are built for server-side clients (Claude Desktop, Cursor) and silently fail from a browser due to CORS.

### Scaffold command

```bash
pnpm create cloudflare@latest remote-mcp-server-authless \
  --template=cloudflare/ai/demos/remote-mcp-authless
```

### Server sketch (`src/index.ts`)

```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class LampServer extends McpAgent {
  server = new McpServer({ name: "smart-lamp", version: "1.0.0" });
  state = { on: false, brightness: 50 };

  async init() {
    this.server.tool("get_lamp_state", "Get the lamp state", {}, async () => ({
      content: [{ type: "text", text: JSON.stringify(this.state) }],
    }));

    this.server.tool(
      "set_lamp_state",
      "Turn the lamp on/off and set brightness",
      { on: z.boolean().optional(), brightness: z.number().min(0).max(100).optional() },
      async ({ on, brightness }) => {
        if (on !== undefined) this.state.on = on;
        if (brightness !== undefined) this.state.brightness = brightness;
        return { content: [{ type: "text", text: JSON.stringify(this.state) }] };
      }
    );
  }
}

export default LampServer.mount("/mcp", { cors: true });
```

Deploy: `npx wrangler@latest deploy` → `your-app.workers.dev/mcp`

### Narrative arc

| Challenge | Tools live... | Transport |
| ----------- | -------------- | ----------- |
| 01 | Inline in the component | Direct function call |
| 02 | On a remote server | MCP over Streamable HTTP |

Same get/set mental model, different transport. Students see the progression from local to remote.

### UI element

An SVG lamp in the app reflects the remote state (on/off glow, brightness opacity). Visual feedback that the MCP call actually worked.

---

## Challenge 03 — Evaluation & Reliability (open question)

### The gap

No mechanism to test whether the LLM behaves correctly. Students trust vibes, not assertions.

### Open questions

1. **What do we test?**
   - Tool selection correctness: "toggle theme" → model calls `get_theme` then `set_theme`?
   - Refusal: adversarial prompts → model does NOT call tools?
   - Output format: structured JSON responses match a schema?

2. **How do we present results?**
   - Pass/fail dashboard in the UI (run N test cases, show green/red)?
   - A dedicated test runner (`npm run eval`)?
   - Inline in the chat (type `/eval` and see results)?

3. **Determinism problem**
   - LLM responses are non-deterministic. How do we define "correct"?
   - Options: regex on output, tool-call assertion (did it call X with args Y?), semantic similarity
   - Temperature 0 helps but doesn't guarantee

4. **Scope**
   - Should students *write* eval cases (learning objective) or *run* pre-written ones (verification)?
   - Or both: pre-written suite + "add your own" section?

5. **Cost**
   - Each eval case = 1+ API call. A suite of 10 cases × haiku = ~$0.01. Acceptable?
   - Batch mode? Or real-time one-by-one with progress?

### Possible structure

```
src/challenges/challenge-03-evals/
├── README.md
├── Evals.tsx              # UI: run button, results table
├── Evals.solution.tsx
├── cases/                 # Test case definitions
│   ├── theme-toggle.json
│   ├── refusal.json
│   └── structured-output.json
└── runner.ts              # Eval execution logic
```

### Certification relevance

Domain 5: Context Management & Reliability. The exam expects candidates to understand how to evaluate and improve LLM outputs systematically.

---

## Challenge 04 — Prompt Engineering & Structured Output (future)

Not designed yet. Target: Domain 4. Likely involves system prompts, JSON mode, and output parsing.

---

## Overall sequence

| # | Challenge | Domains | Key lesson |
| --- | ----------- | --------- | ------------ |
| 01 | Basic Chat | 1, 2, 5 | Local tools, agent loop, multi-step reasoning |
| 02 | MCP Lamp | 2 | Remote tools via protocol, Streamable HTTP |
| 03 | Evals | 5 | Testing LLM behavior, reliability patterns |
| 04 | Structured Output | 4 | System prompts, JSON mode, output parsing |

---

## Migration checklist

- [ ] Rename `src/katas/` → `src/challenges/`
- [ ] Rename `kata-01-basic-chat/` → `challenge-01-basic-chat/`
- [ ] Update App.tsx imports and routing
- [ ] Update CLAUDE.md references
- [ ] Update all README files
- [ ] Revise Challenge 01 tools (get_theme/set_theme)
- [ ] Create MCP server repo (or monorepo `packages/mcp-lamp-server/`)
- [ ] Deploy to Cloudflare Workers
- [ ] Build Challenge 02 scaffold + solution
