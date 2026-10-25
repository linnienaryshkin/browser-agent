# [BrowserAgent](https://github.com/linnienaryshkin/browser-agent)

> I strongly believe that the best way to learn is by doing.

Hands-on coding labs for learning GenAI and building agentic harnesses — in a running React app, in your browser.

## Who this is for

- **Browser/Frontend engineers** who want to understand how the GenAI API works — context, tool use, MCP — in an infrastructure you know
- **Agent builders** who want hands-on experience with agentic loops, tool design, and orchestration in a friendly Browser-JS environment
- **Certification candidates** preparing for a GenAI-related exam or interview

## Labs

Each lab is a fully working chat with progressively more capabilities.

| Tab       | What you learn                                                               |
| --------- | ---------------------------------------------------------------------------- |
| Hello     | Create an Anthropic client, send a message, display the reply                |
| Memory    | Pass full history so the model remembers prior turns                         |
| Tool      | Define `get_theme`, handle `stop_reason: 'tool_use'`, execute tools          |
| Input     | Add `set_theme` with structured input (`{ theme: "light" \| "dark" }`)       |
| Loop      | Multiple tool calls in one request with a `while` loop                       |

Once this sequence is finished, there are multiple separate-topic labs awaiting you.

See [docs/SELF_PASS.md](docs/SELF_PASS.md) — a step-by-step guide covering how to approach each lab.

## Quick Start

- Node.js 20+
- An Anthropic API key ([setup guide](docs/API_KEY_SETUP.md))

```bash
npm install
cp .env.example .env   # paste your Anthropic API key
npm run dev            # http://localhost:5173
```
