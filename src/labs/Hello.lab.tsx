/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: HELLO                                                                  ║
 * ║  Send your first message to the Anthropic API                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Create an Anthropic client, send a single user message, display the reply.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Components                                                                 │
 * │                                                                             │
 * │   ┌─────────────────┐        ┌─────────────────┐        ┌───────────────┐   │
 * │   │  Browser        │        │  Anthropic API  │        │  LLM          │   │
 * │   │  (your app)     │◀──────▶│  gateway        │◀──────▶│  model        │   │
 * │   └─────────────────┘        └─────────────────┘        └───────────────┘   │
 * │                                                                             │
 * │  Browser       — builds the request, renders the reply                      │
 * │  Anthropic API — authenticates, routes, enforces rate limits                │
 * │  LLM           — reads the conversation, generates tokens                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Sequence                                                                   │
 * │                                                                             │
 * │   Browser                 Anthropic API              LLM                    │
 * │     │                          │                      │                     │
 * │     │─── POST /messages ──────▶│                      │                     │
 * │     │    {model, max_tokens,   │                      │                     │
 * │     │     messages}            │── run inference ────▶│                     │
 * │     │                          │                      │── generate tokens   │
 * │     │                          │◀─ generated text ────│                     │
 * │     │◀─── Message object ──────│                      │                     │
 * │     │     {content,            │                      │                     │
 * │     │      stop_reason,        │                      │                     │
 * │     │      usage}              │                      │                     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Request  { model, max_tokens, messages }                                   │
 * │                                                                             │
 * │  model      — which LLM to run; controls capability, speed, and cost        │
 * │  max_tokens — hard ceiling on tokens the model may generate                 │
 * │  messages   — the full conversation as an ordered list of turns             │
 * │               each turn: { role: "user" | "assistant", content: string }    │
 * │                                                                             │
 * │  In this lab you send exactly one user turn. No history is kept between     │
 * │  sends — that comes in the next lab.                                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Response  { content, stop_reason, usage, … }                               │
 * │                                                                             │
 * │  content     — array of typed blocks; text blocks hold the model's words    │
 * │  stop_reason — why generation ended:                                        │
 * │                  end_turn       model decided it was done                   │
 * │                  tool_use       model wants to call a tool (later labs)     │
 * │                  max_tokens     token budget exhausted                      │
 * │                  stop_sequence  a custom stop string was matched            │
 * │  usage       — input / output token counts; drives billing and rate limits  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useModel } from '../ModelContext';
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
  const model = useModel();
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // --------------------------------------------------------------------
  // This is the main function is extend for required functionality
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: MessageParam = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await client.messages.create({
        model: model,
        max_tokens: 1024,
        messages: [userMessage],
      });

      const assistantMessage: MessageParam = { role: 'assistant', content: response.content };
      setMessages((prev) => [...prev, assistantMessage]);
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
