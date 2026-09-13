/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: Meteo                                                                 ║
 * ║  Is it light outside right now? Ask the agent — it will figure it out.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Connect to a *real remote* MCP server over HTTP, proxied through Vite,
 *       to get weather and daylight data — no local server code, no API keys.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Architecture                                                               │
 * │                                                                             │
 * │  Browser → POST /api/open-meteo.caseyjhand → Vite proxy → open-meteo.caseyjhand.com  │
 * │                                                                             │
 * │  The remote MCP server uses SSE transport (Streamable HTTP):               │
 * │  responses are Server-Sent Events with "data: {...}" lines.                 │
 * │  No API key required — it wraps the open-meteo.com free API.               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MCP Tools Available (subset used here)                                     │
 * │                                                                             │
 * │  openmeteo_search_locations(name)                                           │
 * │    → lat, lon, timezone, country, region for a place name                   │
 * │                                                                             │
 * │  openmeteo_get_forecast(latitude, longitude, ...)                           │
 * │    → current conditions, hourly/daily forecast including sunrise/sunset     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Agent Flow                                                                 │
 * │                                                                             │
 * │  User: "Is it light outside?"                                               │
 * │    1. Agent calls openmeteo_search_locations — or asks the user            │
 * │    2. Agent calls openmeteo_get_forecast with is_day + sunrise/sunset       │
 * │    3. Agent replies: "It's currently daytime in Berlin (sunrise 06:14…)"   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What This Teaches                                                          │
 * │                                                                             │
 * │  • Real remote MCP: no local server code — just a proxy entry in vite.config│
 * │  • SSE transport: parsing "data: {...}" event-stream responses              │
 * │  • Free public APIs: open-meteo, no account or key needed                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Say "Is it light outside right now?" then give your city when asked,
 *       or say "Is it light in Tokyo right now?"
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

// The remote server uses SSE transport: responses contain multiple "data: <json>" lines.
// Notifications come first; the actual result/error is the first line that has result or error.
async function mcpCall(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (res.status === 204) return null;

  const text = await res.text();
  let lastData: unknown = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      try {
        const parsed = JSON.parse(trimmed.slice(5).trim());
        if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
        lastData = parsed;
      } catch {
        /* skip malformed lines */
      }
    }
  }
  if (lastData) return lastData;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
