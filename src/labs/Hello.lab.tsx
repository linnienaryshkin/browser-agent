/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: HELLO                                                                ║
 * ║  Send your first message to the Anthropic API                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Create an Anthropic client, send a single user message, display the reply.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  How a request reaches Anthropic from the browser                           │
 * │                                                                             │
 * │   Browser          Vite dev server        Anthropic API                    │
 * │     │                    │                      │                           │
 * │     │── SDK call ───────▶│                      │                           │
 * │     │                    │── proxied request ──▶│                           │
 * │     │                    │◀─ response ──────────│                           │
 * │     │◀─ response ────────│                      │                           │
 * │                                                                             │
 * │  Browsers cannot call api.anthropic.com directly because of CORS.           │
 * │  The Vite dev server acts as a transparent proxy, forwarding every          │
 * │  request under /api/anthropic to the real endpoint.                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What a request carries                                                     │
 * │                                                                             │
 * │  Every call to messages.create must include at minimum:                     │
 * │                                                                             │
 * │  model      — which model to run; controls capability, speed, and cost      │
 * │  max_tokens — hard ceiling on how many tokens the model may generate        │
 * │  messages   — the full conversation so far as an ordered list of turns      │
 * │                                                                             │
 * │  A "turn" is a single message with a role (user or assistant) and content.  │
 * │  In this lab you send exactly one user turn and read one assistant turn     │
 * │  back. No history is kept between sends — that comes in the next lab.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What a response carries — the Message object                               │
 * │                                                                             │
 * │  id            — unique identifier for this message                         │
 * │  type          — always "message"                                           │
 * │  role          — always "assistant"                                         │
 * │  model         — the model that generated the response                      │
 * │  content       — array of typed blocks; never a plain string                │
 * │  stop_reason   — why generation ended:                                      │
 * │                    end_turn       natural stopping point                    │
 * │                    tool_use       model invoked one or more tools           │
 * │                    max_tokens     token budget exhausted                    │
 * │                    stop_sequence  a custom stop sequence was matched        │
 * │  stop_sequence — the matched stop sequence string, if any                  │
 * │  usage         — input / output token counts; drives billing and rate limits│
 * │                                                                             │
 * │  content is always an array even when there is only one block. This         │
 * │  design supports mixed responses: text alongside tool calls in one turn.    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Content block types                                                        │
 * │                                                                             │
 * │   text        — plain text the model wrote; the common case                 │
 * │   tool_use    — model's request to call a function (Tool lab)               │
 * │   tool_result — your answer to a tool_use request (Tool lab)                │
 * │                                                                             │
 * │  A single assistant message can mix all three. Always iterate the array;   │
 * │  never assume only one block exists.                                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY INSIGHT: This chat has NO memory. Each send is a fresh, independent call.
 *             Ask "what did I just say?" — it won't know. Fixed in Memory lab.
 */

import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
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

export function Chat() {
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: MessageParam = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [userMessage],
      });

      const assistantMessage: MessageParam = { role: 'assistant', content: response.content };
      setMessages((prev) => [...prev, assistantMessage]);
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
      return null;
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
