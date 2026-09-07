/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: MEMORY                                                               ║
 * ║  Make the chat remember previous messages                                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Pass the full conversation history on every API call so the model
 *       knows what was said before.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  The Anthropic API is STATELESS                                             │
 * │                                                                             │
 * │  The server holds NO memory between requests.                               │
 * │  You must send the FULL history every time.                                 │
 * │                                                                             │
 * │  Turn 1:                                                                    │
 * │  ┌──────────────────────────────────────────┐                               │
 * │  │ messages: [                              │                               │
 * │  │   { role: "user", content: "Hi, I'm Al" }│                               │
 * │  │ ]                                        │                               │
 * │  └──────────────────────────────────────────┘                               │
 * │                                                                             │
 * │  Turn 2:                                                                    │
 * │  ┌──────────────────────────────────────────────────────────┐               │
 * │  │ messages: [                                              │               │
 * │  │   { role: "user",      content: "Hi, I'm Al" },         │               │
 * │  │   { role: "assistant", content: "Hello Al!" },           │               │
 * │  │   { role: "user",      content: "What's my name?" },    │               │
 * │  │ ]                                                        │               │
 * │  └──────────────────────────────────────────────────────────┘               │
 * │                                                                             │
 * │  Turn 3: (history keeps growing)                                            │
 * │  ┌────────────────────────────────────────────────────────────────────┐     │
 * │  │ messages: [ ...all previous turns..., new user message ]           │     │
 * │  └────────────────────────────────────────────────────────────────────┘     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Pattern                                                                    │
 * │                                                                             │
 * │  1. Append user message to local history array                              │
 * │  2. Send entire history to the API                                          │
 * │  3. Append assistant response to local history                              │
 * │  4. Repeat                                                                  │
 * │                                                                             │
 * │  const history = [...messages, newUserMessage];                              │
 * │  const response = await client.messages.create({ messages: history });      │
 * │  history.push({ role: "assistant", content: response.content });            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY INSIGHT: The client is the source of truth for conversation state.
 *             If you lose the array, you lose the memory.
 *
 * TEST: Say "My name is X", then ask "What's my name?" — it should know.
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

    const memory: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(memory);
    setInput('');
    setLoading(true);

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: memory,
      });

      memory.push({ role: 'assistant', content: response.content });
      setMessages([...memory]);
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
