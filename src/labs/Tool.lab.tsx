/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: TOOL                                                                 ║
 * ║  Give the model a tool it can call                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Define a `get_theme` tool. When the model decides to use it,
 *       execute it and return the result. This is the "agent loop."
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  stop_reason — how the model signals what happens next                      │
 * │                                                                             │
 * │  Every response carries a stop_reason that tells you what to do.           │
 * │  See the Hello lab for the full field reference; the values relevant here: │
 * │                                                                             │
 * │   end_turn       — model finished naturally; render the text and wait       │
 * │   tool_use       — model wants a function called; execute it and loop back  │
 * │   max_tokens     — budget exhausted before the model could finish           │
 * │   stop_sequence  — a custom stop sequence you defined was matched           │
 * │                                                                             │
 * │  Without tools, every response is end_turn. With tools, end_turn arrives   │
 * │  only after every tool_use round trip has been completed.                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  How the model calls external functions                                     │
 * │                                                                             │
 * │  The model never executes code. When it needs external data it emits a      │
 * │  tool_use block — a structured call request — and stops. The client reads  │
 * │  that block, runs the real function locally, wraps the result in a          │
 * │  tool_result block, appends it to the history, and calls the API again.    │
 * │  The model reads the result and continues reasoning from there.             │
 * │                                                                             │
 * │  A tool definition has three parts:                                         │
 * │   name        — identifier the model uses in the tool_use block             │
 * │   description — the only signal the model has for deciding when to call it  │
 * │   input_schema — JSON Schema describing accepted arguments (none here)      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Agent loop — one tool call                                                 │
 * │                                                                             │
 * │   Client            API                 Tool                               │
 * │     │                 │                   │                                 │
 * │     │── user msg ────▶│                   │                                 │
 * │     │   + tool defs   │                   │                                 │
 * │     │                 │                   │                                 │
 * │     │◀── tool_use ────│  stop_reason:     │                                 │
 * │     │    get_theme    │  "tool_use"        │                                 │
 * │     │                 │                   │                                 │
 * │     │─────────────────┼── execute ───────▶│                                 │
 * │     │◀────────────────┼── result ─────────│                                 │
 * │     │                 │                   │                                 │
 * │     │── tool_result ─▶│                   │                                 │
 * │     │   (+ history)   │                   │                                 │
 * │     │                 │                   │                                 │
 * │     │◀── text ────────│  stop_reason:     │                                 │
 * │                        │  "end_turn"       │                                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Ask "What theme is the app using?" — model should call get_theme.
 */

import { useState } from 'react';
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

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_theme',
    description: 'Get the current app color theme. Returns "light" or "dark".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

export function Chat() {
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const memory: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(memory);
    setInput('');
    setLoading(true);

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        tools: TOOLS,
        messages: memory,
      });

      memory.push({ role: 'assistant', content: response.content });
      setMessages([...memory]);

      if (response.stop_reason === 'tool_use') {
        const theme = window.getTheme();
        const toolId = response.content.find((b) => b.type === 'tool_use')!.id;

        const toolResult: ToolResultBlockParam = {
          type: 'tool_result' as const,
          tool_use_id: toolId,
          content: JSON.stringify({ theme }),
        };

        memory.push({ role: 'user', content: [toolResult] });
        setMessages([...memory]);

        const finalResponse = await client.messages.create({
          model: 'claude-haiku-4-5',
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
