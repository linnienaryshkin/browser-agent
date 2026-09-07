/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: MCP                                                                  ║
 * ║  Discover and integrate remote tools via Model Context Protocol (MCP)      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Connect to a local MCP server to discover remote tools, add them to
 *       the agent's toolset, and call them alongside local tools.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MCP Overview                                                               │
 * │                                                                             │
 * │  MCP (Model Context Protocol) is a standard for AI agents to discover and   │
 * │  use tools from any server, not just your app.                              │
 * │                                                                             │
 * │  ┌─────────────┐       ┌──────────────┐       ┌──────────────┐             │
 * │  │   Browser   │───────│ Vite Proxy   │───────│ MCP Server   │             │
 * │  │  (client)   │       │  (POST /mcp) │       │  (local)     │             │
 * │  └─────────────┘       └──────────────┘       └──────────────┘             │
 * │                                                                             │
 * │  1. Client: tools/list RPC call                                             │
 * │  2. Server: Returns [{ name, description, inputSchema }, ...]              │
 * │  3. Client: Converts to Anthropic SDK format                               │
 * │  4. Client: Includes in tools array with local tools                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MCP Protocol (JSON-RPC 2.0)                                                │
 * │                                                                             │
 * │  Request:                                                                   │
 * │  {                                                                          │
 * │    jsonrpc: "2.0",                                                          │
 * │    id: 1,                                                                   │
 * │    method: "tools/list",           ◀── MCP server exposes tools/list       │
 * │    params: {}                                                               │
 * │  }                                                                          │
 * │                                                                             │
 * │  Response:                                                                  │
 * │  {                                                                          │
 * │    jsonrpc: "2.0",                                                          │
 * │    id: 1,                                                                   │
 * │    result: {                                                                │
 * │      tools: [                                                               │
 * │        { name: "get_real_name", description: "...", inputSchema: {} }      │
 * │      ]                                                                      │
 * │    }                                                                        │
 * │  }                                                                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Integration Pattern                                                        │
 * │                                                                             │
 * │  const localTools: Anthropic.Tool[] = [get_theme, set_theme];               │
 * │  const mcpTools = await discoverMcpTools();                                 │
 * │  const allTools = [...localTools, ...mcpTools];                             │
 * │                                                                             │
 * │  When executing:                                                            │
 * │  • If tool is in LOCAL_TOOL_NAMES → executeLocalTool(...)                  │
 * │  • Else → callMcpTool(...) via RPC                                          │
 * │                                                                             │
 * │  The model doesn't care where tools come from — it just sees their         │
 * │  schemas and decides when to call them.                                     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What This Teaches                                                          │
 * │                                                                             │
 * │  • Tool Discovery: Agents can dynamically learn what's available           │
 * │  • Composition: Mix local and remote tools seamlessly                       │
 * │  • Protocols: MCP enables AI agents to interact with any system            │
 * │  • Routing: Determine where each tool executes based on availability        │
 * │                                                                             │
 * │  Real-world: Connect to browser automation, APIs, databases, file          │
 * │  systems—all via MCP servers. The model plans what to call, you            │
 * │  orchestrate the actual execution.                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Say "Tell me the computer owner's name" — model calls get_real_name via MCP.
 */

import { useState, useEffect } from 'react';
import Anthropic from '@anthropic-ai/sdk';
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
          model: 'claude-haiku-4-5',
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
