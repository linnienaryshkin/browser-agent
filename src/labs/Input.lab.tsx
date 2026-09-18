/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: INPUT                                                                  ║
 * ║  Tool with structured input schema                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: Now, we want to give the model an ability to change the application theme.
 * The same way as user could do it via the upper right corner of the app.
 * (also, you could check the theme by opening devtools and typing `window.setTheme('light' | 'dark')` in the console)
 *
 * GOAL: Add `set_theme` — a tool that accepts structured input.
 *       The model must pass a validated argument to call it.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  JSON Schema — the contract between you and the model                       │
 * │                                                                             │
 * │  https://json-schema.org/                                                   │
 * │                                                                             │
 * │  Every tool's input_schema is a JSON Schema object that tells the model     │
 * │  exactly what arguments it may pass. The API uses the schema to guide       │
 * │  generation so the model's output is structurally valid before it reaches   │
 * │  your client. You define:                                                   │
 * │                                                                             │
 * │   properties — each argument: its type, allowed values, and a description   │
 * │   required   — which arguments the model must always provide                │
 * │                                                                             │
 * │  The description on each property is read by the model and shapes how it    │
 * │  chooses values.                                                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What JSON Schema cannot express                                            │
 * │                                                                             │
 * │  The schema enforces structure and types, not business logic. It cannot     │
 * │  express constraints like:                                                  │
 * │                                                                             │
 * │   • "start date must be before end date"                                    │
 * │   • "if mode is range, both min and max are required"                       │
 * │   • "quantity must be a positive multiple of 10"                            │
 * │                                                                             │
 * │  You must enforce these yourself when the tool_use block arrives. If the    │
 * │  input is invalid, return a descriptive error as the tool_result and the    │
 * │  model will correct itself on the next turn.                                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Sequence — tool call with structured input                                 │
 * │                                                                             │
 * │   Client            API                 Tool                                │
 * │     │                 │                   │                                 │
 * │     │── user msg ────▶│                   │                                 │
 * │     │   + tool defs   │                   │                                 │
 * │     │                 │                   │                                 │
 * │     │◀── tool_use ────│  stop_reason:     │                                 │
 * │     │    set_theme    │  "tool_use"       │                                 │
 * │     │    input: dark  │                   │                                 │
 * │     │                 │                   │                                 │
 * │     │─────────────────┼── setTheme(dark) ▶│                                 │
 * │     │◀────────────────┼── ok ─────────────│                                 │
 * │     │                 │                   │                                 │
 * │     │── tool_result ─▶│                   │                                 │
 * │     │   (+ history)   │                   │                                 │
 * │     │                 │                   │                                 │
 * │     │◀── text ────────│  stop_reason:     │                                 │
 * │                       │  "end_turn"       │                                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
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

const TOOLS: Anthropic.Tool[] = [
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

export function Chat() {
  const model = useModel();
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

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
      const response = await client.messages.create({
        model: model,
        max_tokens: 1024,
        tools: TOOLS,
        messages: memory,
      });

      memory.push({ role: 'assistant', content: response.content });
      setMessages([...memory]);

      if (response.stop_reason === 'tool_use') {
        const toolBlock = response.content.find((b) => b.type === 'tool_use')!;

        let content: string;
        if (toolBlock.name === 'get_theme') {
          content = JSON.stringify({ theme: window.getTheme() });
        } else if (toolBlock.name === 'set_theme') {
          window.setTheme((toolBlock.input as Record<string, unknown>).theme as 'light' | 'dark');
          content = JSON.stringify({ theme: (toolBlock.input as Record<string, unknown>).theme });
        } else {
          content = `Unknown tool: ${toolBlock.name}`;
        }

        const toolResult: ToolResultBlockParam = {
          type: 'tool_result' as const,
          tool_use_id: toolBlock.id,
          content,
        };

        memory.push({ role: 'user', content: [toolResult] });
        setMessages([...memory]);

        const finalResponse = await client.messages.create({
          model: model,
          max_tokens: 1024,
          tools: TOOLS,
          messages: memory,
        });

        memory.push({ role: 'assistant', content: finalResponse.content });
        setMessages([...memory]);
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
