# Self-Pass Labs | Instructions

This guide walks you through the core labs — **Hello** through **Loop** — in order. Each builds on the previous one.

---

## Prerequisites

- Node.js installed
- An Anthropic API key (set in `.env` as `VITE_ANTHROPIC_API_KEY`)
- Run `npm install && npm run dev`, then open `http://localhost:5173`

---

## How to learn each lab

**Option A — Write it yourself (recommended).**
Open [`src/labs/Canvas.tsx`](../src/labs/Canvas.tsx). It's a blank slate wired into the same app. Implement the lab's feature from scratch there. Getting stuck and unstuck is where the learning happens.

**Option B — Run the completed lab and trace it.**
Open the lab in your browser, open DevTools (Network + Console), and step through the code. For every API call: find the request, find the response, match each field to the code that produced or consumed it.

Either way, don't move on until you can narrate the runtime flow of the current lab.

---

## Lab structure

Each lab file starts with a comment block: **`PROBLEM`** (motivation) → **`GOAL`** (what to implement) → **theory blocks** (diagrams, field descriptions, mental models). The working solution follows below. Read the comment top-to-bottom before touching the code.

The Anthropic SDK is well-typed — hover over any type or method in your editor for inline docs. Use that alongside the theory blocks.

---

## Lab 1 — Hello

[`src/labs/Hello.lab.tsx`](../src/labs/Hello.lab.tsx) · [browser](http://localhost:5173/hello)

First API call. Send a message, get a reply.

`Anthropic` · `messages.create()` · `model` · `max_tokens` · `MessageParam` · `Message` · `stop_reason` · `usage` · CORS proxy

---

## Lab 2 — Memory

[`src/labs/Memory.lab.tsx`](../src/labs/Memory.lab.tsx) · [browser](http://localhost:5173/memory)

Make the model remember previous turns by replaying the full history on every call.

stateless API · `MessageParam[]` · conversation history · tokens · embeddings / RAG

---

## Lab 3 — Tool

[`src/labs/Tool.lab.tsx`](../src/labs/Tool.lab.tsx) · [browser](http://localhost:5173/tool)

Give the model a tool to call. Handle the result and send it back.

`Anthropic.Tool` · `input_schema` · `stop_reason: "tool_use"` · `tool_use` block · `ToolResultBlockParam` · two-turn pattern

---

## Lab 4 — Input

[`src/labs/Input.lab.tsx`](../src/labs/Input.lab.tsx) · [browser](http://localhost:5173/input)

Add a tool that takes structured arguments. Validate input and handle errors.

JSON Schema · `properties` · `required` · schema-guided generation · error handling via `tool_result`

---

## Lab 5 — Loop

[`src/labs/Loop.lab.tsx`](../src/labs/Loop.lab.tsx) · [browser](http://localhost:5173/loop)

Run a full agent loop — keep calling until `end_turn`, executing all tools along the way.

agent loop · `while (stopReason !== 'end_turn')` · parallel tool use · `ToolResultBlockParam[]` · mixed content blocks · iteration cap

---

## What's Next

| Lab | File | Browser |
| --- | --- | --- |
| Streaming | [`Streaming.lab.tsx`](../src/labs/Streaming.lab.tsx) | [→](http://localhost:5173/streaming) |
| MCP | [`Mcp.lab.tsx`](../src/labs/Mcp.lab.tsx) | [→](http://localhost:5173/mcp-lab) |
| Open-Meteo | [`Meteo.lab.tsx`](../src/labs/Meteo.lab.tsx) | [→](http://localhost:5173/meteo) |
