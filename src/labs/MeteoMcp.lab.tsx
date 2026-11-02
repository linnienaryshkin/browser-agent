/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: METEO MCP                                                             ║
 * ║  Extends → Loop lab (same agent loop, MCP tool discovery added on top)      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: So far all tools have been hardcoded directly in the browser.
 *          What if you want to give the agent access to tools from an external
 *          service — without reimplementing every integration yourself?
 *
 * GOAL: Learn the MCP client protocol. Connect to a real remote MCP server
 *       (open-meteo weather data) and discover its tools at runtime.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What is MCP?                                                               │
 * │                                                                             │
 * │  MCP (Model Context Protocol) is an open standard that lets AI clients      │
 * │  discover and invoke tools from any compatible server over JSON-RPC 2.0.    │
 * │  The client doesn't need to know what tools exist in advance — it asks the  │
 * │  server at runtime.                                                         │
 * │                                                                             │
 * │  Think of it as a universal plugin interface for AI agents:                 │
 * │    • servers expose tools (and optionally resources, prompts)               │
 * │    • clients discover and call those tools via a standard protocol          │
 * │    • the LLM sees one unified tool list regardless of where tools live      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Components                                                                 │
 * │                                                                             │
 * │   ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────┐      │
 * │   │  Browser        │   │  Remote MCP      │   │  Anthropic API      │      │
 * │   │  (client)       │◀─▶│  open-meteo      │   │  + LLM              │      │
 * │   └─────────────────┘   └──────────────────┘   └─────────────────────┘      │
 * │          │                                               ▲                  │
 * │          └───────────────────────────────────────────────┘                  │
 * │                                                                             │
 * │  Browser       — runs the handshake, merges tool lists, routes tool calls   │
 * │  Remote MCP    — public weather server; no API key required                 │
 * │  Anthropic API — receives one unified tools array; unaware of origin        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MCP session lifecycle (JSON-RPC 2.0)                                       │
 * │                                                                             │
 * │  Why not just call tools/list directly?                                     │
 * │  The MCP spec requires a handshake before any other method. initialize      │
 * │  lets client and server agree on a protocol version and exchange            │
 * │  capability flags; a compliant server may reject tools/list if it arrives   │
 * │  before the session is established.                                         │
 * │                                                                             │
 * │  Step 1 — initialize (negotiate version & capabilities)                     │
 * │  → POST { jsonrpc:"2.0", id:1, method:"initialize",                         │
 * │           params:{ protocolVersion, capabilities, clientInfo } }            │
 * │  ← { result:{ protocolVersion, capabilities, serverInfo } }                 │
 * │                                                                             │
 * │  Step 2 — notifications/initialized (client signals it's ready)             │
 * │  → POST { jsonrpc:"2.0", id:2, method:"notifications/initialized" }         │
 * │  ← 204 No Content  (one-way notification, no response expected)             │
 * │                                                                             │
 * │  Step 3 — tools/list (discover available tools)                             │
 * │  → POST { jsonrpc:"2.0", id:3, method:"tools/list", params:{} }             │
 * │  ← { result:{ tools:[{ name, description, inputSchema }, ...] } }           │
 * │                                                                             │
 * │  Step 4 — tools/call (invoke a tool by name)                                │
 * │  → POST { jsonrpc:"2.0", id:4, method:"tools/call",                         │
 * │           params:{ name:"openmeteo_get_forecast", arguments:{...} } }       │
 * │  ← { result:{ content:[{ type:"text", text:"..." }] } }                     │
 * |                                                                             |
 * |    https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle |
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  SSE transport (used by this remote server)                                 │
 * │                                                                             │
 * │  Browser → POST /api/open-meteo → Vite proxy → open-meteo.caseyjhand.com   │
 * │                                                                             │
 * │  The remote server uses Streamable HTTP (SSE): each response body is a      │
 * │  stream of "data: <json>" lines. The client scans for the first line        │
 * │  that has result or error to extract the JSON-RPC response.                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MCP tools available                                                        │
 * │                                                                             │
 * │  openmeteo_search_locations(name)                                           │
 * │    → lat, lon, timezone, country, region for a place name                   │
 * │                                                                             │
 * │  openmeteo_get_forecast(latitude, longitude, ...)                           │
 * │    → current conditions, hourly/daily forecast including sunrise/sunset     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What this teaches                                                          │
 * │                                                                             │
 * │  • The four-step MCP handshake every client must perform                    │
 * │  • How to convert MCP tool descriptors into Anthropic SDK Tool objects      │
 * │  • SSE transport — parsing "data: {...}" lines from a streaming response    │
 * │  • A Vite proxy entry is the only local config needed for a remote MCP      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useModel } from '../ModelContext';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import SendIcon from '@mui/icons-material/Send';

const client = new Anthropic({
  apiKey: import.meta.env.ANTHROPIC_API_KEY,
  baseURL: `${window.location.origin}/api/anthropic`,
  dangerouslyAllowBrowser: true,
});

const MCP_ENDPOINT = '/api/open-meteo.caseyjhand';

async function mcpCall(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (res.status === 204) return null;

  // SSE responses are newline-separated "data: <json>" lines; pick the first with result/error.
  const text = await res.text();
  const dataLines = text.split('\n').filter(l => l.trimStart().startsWith('data:'));
  const parsed = dataLines.map(l => { try { return JSON.parse(l.replace(/^\s*data:\s*/, '')); } catch { return null; } });
  return parsed.find(p => p?.result !== undefined || p?.error !== undefined) ?? parsed.at(-1) ?? null;
}

const LOCAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_theme',
    description: 'Get the current app color theme. Returns "light" or "dark".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_theme',
    description:
      'Set the app color theme to a specific mode. ' +
      'Call get_theme first to know the current state before changing it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        theme: { type: 'string', enum: ['light', 'dark'], description: 'The theme to set' },
      },
      required: ['theme'],
    },
  },
];

function executeLocalTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'get_theme':
      return JSON.stringify({ theme: window.getTheme() });
    case 'set_theme':
      window.setTheme(input.theme as 'light' | 'dark');
      return JSON.stringify({ theme: input.theme });
    default:
      return `Unknown local tool: ${name}`;
  }
}

const LOCAL_TOOL_NAMES = new Set(LOCAL_TOOLS.map((t) => t.name));

async function discoverMcpTools(): Promise<Anthropic.Tool[]> {
  await mcpCall('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'browser-agent', version: '1.0.0' },
  });
  await mcpCall('notifications/initialized');
  const result = await mcpCall('tools/list');
  return (result?.result?.tools ?? []).map(
    (t: { name: string; description: string; inputSchema: object }) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }),
  );
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (LOCAL_TOOL_NAMES.has(name)) return executeLocalTool(name, input);
  const result = await mcpCall('tools/call', { name, arguments: input });
  const content = result?.result?.content;
  if (Array.isArray(content) && content[0]?.text) return content[0].text;
  return JSON.stringify(result?.result ?? result?.error);
}

export function Chat() {
  const model = useModel();
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<Anthropic.Tool[]>([]);

  useEffect(() => {
    discoverMcpTools().then((mcpTools) => setTools([...LOCAL_TOOLS, ...mcpTools]));
  }, []);

  // --------------------------------------------------------------------
  // This is the main function is extend for required functionality
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const memory: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(memory);
    setInput('');
    setLoading(true);

    try {
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const response = await client.messages.create({
          model: model,
          max_tokens: 1024,
          tools,
          messages: memory,
        });

        memory.push({ role: 'assistant', content: response.content });
        setMessages([...memory]);
        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: await executeTool(block.name, block.input as Record<string, unknown>),
            });
          }

          memory.push({ role: 'user', content: toolResults });
          setMessages([...memory]);
        }
      }
    } finally {
      setLoading(false);
    }
  };
  // --------------------------------------------------------------------

  const renderMessageContent = (msg: MessageParam) => {
    const blocks =
      typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content;

    return blocks.map((block, i) => {
      if (block.type === 'text') {
        return (
          <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {block.text}
          </Typography>
        );
      }
      const { type, ...rest } = block as unknown as { type: string; [k: string]: unknown };
      return (
        <Box key={i} sx={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.85 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            {type}
          </Typography>
          <pre style={{ margin: 0 }}>{JSON.stringify(rest, null, 2)}</pre>
        </Box>
      );
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages.map((msg, i) => (
          <Paper
            key={i}
            elevation={1}
            sx={{
              p: 1.5,
              maxWidth: '70%',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              bgcolor: msg.role === 'user' ? 'secondary.main' : 'action.hover',
              ...(msg.role === 'user' && { color: 'secondary.contrastText' }),
            }}
          >
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {msg.role}
            </Typography>
            {renderMessageContent(msg)}
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
        />
        <IconButton color="primary" onClick={handleSend} disabled={loading || !input.trim()}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
