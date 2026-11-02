/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: CUSTOM MCP                                                             ║
 * ║  Extends → Meteo lab (same client pattern, now you own the server)           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: The previous lab consumed a ready-made MCP server.
 *          Now flip to the other side — how do you build and expose your own?
 *
 * GOAL: Understand MCP from the server perspective and write your own MCP server
 *       using the canvas template.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Components                                                                 │
 * │                                                                             │
 * │   ┌──────────────────────┐   ┌──────────────────┐   ┌─────────────────┐    │
 * │   │  Browser             │   │  Local MCP       │   │  Anthropic API  │    │
 * │   │  + local tools       │◀─▶│  server /mcp     │   │  + LLM          │    │
 * │   │  + discovered tools  │   └──────────────────┘   └─────────────────┘    │
 * │   └──────────────────────┘          ▲                       ▲              │
 * │             └───────────────────────┴───────────────────────┘              │
 * │                                                                             │
 * │  Browser       — same client loop as Meteo lab; only the endpoint changes   │
 * │  Local MCP     — Vite middleware at /mcp; defined in mcp-theme-server.ts     │
 * │  Anthropic API — receives one unified tools array; unaware of origin        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Server-side anatomy of an MCP server                                      │
 * │                                                                             │
 * │  Every MCP server must handle exactly three JSON-RPC methods:               │
 * │                                                                             │
 * │  initialize          → negotiate protocol version; return serverInfo        │
 * │  tools/list          → return an array of { name, description, inputSchema }│
 * │  tools/call          → execute the named tool; return { content:[{text}] }  │
 * │                                                                             │
 * │  That's the entire contract. Anything beyond that is optional.              │
 * │                                                                             │
 * │  See mcp-theme-server.ts for a working example of this pattern.              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Build your own — canvas template                                           │
 * │                                                                             │
 * │  Open:  src/mcp-canvas-server.ts  ◀── blank template, ready to code        │
 * │                                                                             │
 * │  Steps:                                                                     │
 * │    1. Add your tools to the TOOLS array                                     │
 * │       { name, description, inputSchema }                                    │
 * │    2. Handle each tool in callTool() — return a string result               │
 * │    3. Point this lab at /mcp-canvas instead of /mcp                         │
 * │                                                                             │
 * │  The server runs as a Vite middleware at POST /mcp-canvas.                  │
 * │  The JSON-RPC router in the template handles everything else automatically. │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Tool routing (client side, already implemented here)                       │
 * │                                                                             │
 * │  const mcpTools   = await discoverMcpTools();          // from server       │
 * │  const allTools   = [...LOCAL_TOOLS, ...mcpTools];     // unified list      │
 * │                                                                             │
 * │  When executing a tool_use block:                                           │
 * │    LOCAL_TOOL_NAMES.has(name) → executeLocalTool(name, input)               │
 * │    mcpToolNames.has(name)     → callMcpTool(name, input) via RPC            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What this teaches                                                          │
 * │                                                                             │
 * │  • The three methods every MCP server must implement                        │
 * │  • How inputSchema drives the model's understanding of a tool's parameters  │
 * │  • How a Vite middleware becomes a fully functional MCP server               │
 * │  • The symmetry between client discovery and server declaration             │
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

async function mcpCall(method: string, params?: Record<string, unknown>) {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (res.status === 204) return null;
  return res.json();
}

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

async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await mcpCall('tools/call', { name, arguments: args });
  const content = result?.result?.content;
  if (Array.isArray(content) && content[0]?.text) return content[0].text;
  return JSON.stringify(result?.result ?? result?.error);
}

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

export function Chat() {
  const model = useModel();
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [allTools, setAllTools] = useState<Anthropic.Tool[]>(LOCAL_TOOLS);
  const [mcpToolNames, setMcpToolNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    discoverMcpTools().then((mcpTools) => {
      setAllTools([...LOCAL_TOOLS, ...mcpTools]);
      setMcpToolNames(new Set(mcpTools.map((t) => t.name)));
    });
  }, []);

  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (LOCAL_TOOL_NAMES.has(name)) return executeLocalTool(name, input);
    if (mcpToolNames.has(name)) return callMcpTool(name, input);
    return `Unknown tool: ${name}`;
  }

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
          tools: allTools,
          messages: memory,
        });

        memory.push({ role: 'assistant', content: response.content });
        setMessages([...memory]);
        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async (block) => ({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: await executeTool(block.name, block.input as Record<string, unknown>),
            })),
          );

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
