/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: HELLO                                                                ║
 * ║  Send your first message to the Anthropic API                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Create an Anthropic client, send a single user message, display the reply.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Request / Response Flow                                                    │
 * │                                                                             │
 * │  ┌────────┐         ┌──────────────┐         ┌───────────┐                 │
 * │  │ Browser │───────▶│ Vite Proxy   │───────▶│ Anthropic │                 │
 * │  │  (SDK)  │◀───────│ /api/anthropic│◀───────│    API    │                 │
 * │  └────────┘         └──────────────┘         └───────────┘                 │
 * │                                                                             │
 * │  Why the proxy? Browser CORS blocks direct API calls.                       │
 * │  The Vite dev server forwards /api/anthropic/* to api.anthropic.com.        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Anthropic SDK Setup                                                        │
 * │                                                                             │
 * │  const client = new Anthropic({                                             │
 * │    apiKey: import.meta.env.ANTHROPIC_API_KEY,                               │
 * │    baseURL: `${window.location.origin}/api/anthropic`,                      │
 * │    dangerouslyAllowBrowser: true,                                           │
 * │  });                                                                        │
 * │                                                                             │
 * │  • apiKey ─── from .env file (exposed via Vite envPrefix)                   │
 * │  • baseURL ── points to local proxy, NOT api.anthropic.com                  │
 * │  • dangerouslyAllowBrowser ── required for browser usage                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  API Call                                                                   │
 * │                                                                             │
 * │  const response = await client.messages.create({                            │
 * │    model: "claude-haiku-4-5",                                               │
 * │    max_tokens: 1024,                                                        │
 * │    messages: [{ role: "user", content: "Hello!" }],                         │
 * │  });                                                                        │
 * │                                                                             │
 * │  response.content = [{ type: "text", text: "Hi there!" }]                   │
 * │                       ▲                                                     │
 * │                       └── content is always an ARRAY of blocks              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY INSIGHT: This chat has NO memory. Each message is independent.
 *             Try asking "what did I just say?" — it won't know.
 *             That's fixed in the next lab (Memory).
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
