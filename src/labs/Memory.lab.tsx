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
 * │  Tokenization — how text enters the model                                   │
 * │                                                                             │
 * │  Before any processing, the entire message history is converted to tokens   │
 * │  — sub-word units drawn from the model's fixed vocabulary. Common words     │
 * │  map to a single token; rare or long words split into several. The model    │
 * │  never sees characters or words — only token IDs.                           │
 * │                                                                             │
 * │  "What is quantum computing?"                                               │
 * │       │                                                                     │
 * │       ▼                                                                     │
 * │   [ What ][ is ][ quantum ][ computing ][ ? ]                               │
 * │                      │                                                      │
 * │               multiple meanings:                                            │
 * │               physics unit / quantum mechanics / quantum computing          │
 * │               — resolved in the next step (embedding + attention)           │
 * │                                                                             │
 * │  Explore tokenization interactively: https://platform.openai.com/tokenizer  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Next-token prediction — why the whole context must be present              │
 * │                                                                             │
 * │  An LLM is a next-token predictor. At each step it receives every token     │
 * │  produced so far — input and output alike — and estimates a probability     │
 * │  distribution over the entire vocabulary for what comes next, then samples  │
 * │  one token from that distribution. This repeats until a stop condition is   │
 * │  met (end-of-sequence token, max_tokens, or a stop sequence).               │
 * │                                                                             │
 * │  Without prior turns the model has no context, so sending only the latest   │
 * │  user message is indistinguishable from starting a brand-new conversation.  │
 * │                                                                             │
 * │  Cost implication: each turn re-sends the entire history, so token usage    │
 * │  (and cost) grows roughly linearly with conversation length.                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Embeddings — semantic vectors                                              │
 * │                                                                             │
 * │  Before attention can resolve meaning, each token is projected into a       │
 * │  high-dimensional numeric vector (an embedding). The vector encodes what    │
 * │  the token typically means across training data. Tokens with similar        │
 * │  meanings cluster together in that space.                                   │
 * │                                                                             │
 * │  This same idea powers RAG (Retrieval-Augmented Generation): documents are  │
 * │  stored as embedding vectors, the user query is embedded at query time,     │
 * │  and the nearest chunks are injected into the prompt. The model reads them  │
 * │  as ordinary context — it never "memorised" the documents.                  │
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
