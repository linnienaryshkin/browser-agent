/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: MEMORY                                                                 ║
 * ║  Make the chat remember previous messages                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: When you send another message, the model forgets everything you said before.
 * Try sending "my name is L", then "what's my name?" — it won't know. The model has no memory.
 *
 * GOAL: Make it remember the context
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  A stateless API                                                            │
 * │                                                                             │
 * │  The server holds no session. Every request is processed in isolation and   │
 * │  discarded the moment it completes. The client is the sole source of        │
 * │  conversation state and must replay the full history on every call.         │
 * │                                                                             │
 * │   Turn 1   ──▶  [ user ]                                                    │
 * │   Turn 2   ──▶  [ user · assistant · user ]                                 │
 * │   Turn 3   ──▶  [ user · assistant · user · assistant · user ]              │
 * │                   ▲ grows by two messages each round trip                   │
 * │                                                                             │
 * │  Lose the array and you lose the conversation.                              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Types of memory                                                            │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  In-context                                                                 │
 * │    The message array is passed directly in the request. Always visible to   │
 * │    the model — no retrieval step needed. Limited by the context window;     │
 * │    cost grows linearly as the conversation lengthens.                       │
 * │                                                                             │
 * │  Episodic                                                                   │
 * │    A log of past events stored outside the context window, timestamped so   │
 * │    you can answer "what happened in session X?" Fetched on demand and       │
 * │    injected as needed — the model never sees it automatically.              │
 * │                                                                             │
 * │  Semantic                                                                   │
 * │    Facts and knowledge extracted and deduplicated across conversations,     │
 * │    stored as embeddings in a vector store. Retrieved by similarity search   │
 * │    at query time and injected into the prompt. Powers RAG.                  │
 * │                                                                             │
 * │  Procedural                                                                 │
 * │    Behavioral rules, preferences, and reasoning patterns — often kept in    │
 * │    a system prompt or a structured profile file. Tells the model how to     │
 * │    act rather than what happened or what is true.                           │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │  This lab uses in-context memory — the simplest form. The other types       │
 * │  require retrieval infrastructure but let memory grow without bound.        │
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

    const memory: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(memory);
    setInput('');
    setLoading(true);

    try {
      const response = await client.messages.create({
        model: model,
        max_tokens: 1024,
        messages: memory,
      });

      memory.push({ role: 'assistant', content: response.content });
      setMessages([...memory]);
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
