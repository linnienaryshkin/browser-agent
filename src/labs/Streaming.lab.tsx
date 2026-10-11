/**
 * ╔═════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: STREAMING                                                             ║
 * ║  Same agent loop as Loop, but responses arrive token-by-token via stream    ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: Users complain "Your application is too slow."
 *
 * GOAL: Replace the blocking messages.create() call with messages.stream() so
 *       text blocks render token-by-token. Measure time-to-first-token (TTFT)
 *       for each generation step and display it on the assistant bubble.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  How LLM inference works (why streaming helps)                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │         prompt text                                                         │
 * │              │                                                              │
 * │              ▼                                                              │
 * │  ┌───────────────────────┐                                                  │
 * │  │     Tokenization      │  Text → integer token IDs from the model vocab.  │
 * │  │     "Hello world"     │  The model never processes raw characters,       │
 * │  │   → [9906, 1917, …]   │  only the numerical token sequence.              │
 * │  │                       │  Try it: platform.openai.com/tokenizer           │
 * │  └───────────┬───────────┘                                                  │
 * │              │                                                              │
 * │              ▼                                                              │
 * │  ┌───────────────────────┐                                                  │
 * │  │     Prefill phase     │  All tokens processed in parallel.               │
 * │  │                       │  The transformer computes query, key, and value  │
 * │  │   KV cache built for  │  tensors for every position (self-attention),    │
 * │  │   every input token   │  then stores them in the KV cache.               │
 * │  │                       │  Cost scales with prompt length — the user is    │
 * │  │  ◄── TTFT ends here   │  fully blocked until this phase completes.       │
 * │  └───────────┬───────────┘                                                  │
 * │              │  first output token                                          │
 * │              ▼                          ┌────────────────────┐              │
 * │  ┌───────────────────────┐              │      KV cache      │              │
 * │  │    Decoding phase     │─────────────►│  key/value tensors │              │
 * │  │                       │◄─────────────│  from prefill +    │              │
 * │  │  one token at a time  │  next token  │  all prior steps   │              │
 * │  │   (autoregressive)    │              │  reused, never     │              │
 * │  │                       │              │  recomputed        │              │
 * │  └───────────┬───────────┘              └────────────────────┘              │
 * │              │  each new token is appended to the KV cache                  │
 * │              ▼                                                              │
 * │       streamed output                                                       │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │  Without streaming: client blocks until decoding finishes, then renders.    │
 * │  With streaming:    tokens appear as soon as decoding begins.               │
 * │  Perceived latency drops from (prefill + full decode) to just prefill.      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  SDK streaming API                                                          │
 * │                                                                             │
 * │  client.messages.stream(params) — same params as messages.create().         │
 * │  Returns a Stream helper; subscribe to events before awaiting completion:   │
 * │                                                                             │
 * │   stream.on("text", (delta) => ...)                                         │
 * │     Fired for each text delta as the model decodes. The argument is the     │
 * │     incremental string fragment (not the full text so far).                 │
 * │                                                                             │
 * │   await stream.finalMessage()                                               │
 * │     Resolves once the stream closes. Returns the complete Message object    │
 * │     — including fully assembled tool_use blocks with parsed inputs.         │
 * │     Use this (not the "message" event) to commit the turn to history.       │
 * │                                                                             │
 * │  Draft-bubble pattern                                                       │
 * │    Keep a separate piece of state (e.g. streamingText: string | null) that  │
 * │    accumulates text deltas and renders a live "typing" bubble.              │
 * │    Set it to null before the request and after finalMessage() resolves,     │
 * │    then commit the completed Message to your entries array.                 │
 * │    This way tool_use blocks (no text) are never shown in the draft bubble.  │
 * │                                                                             │
 * │  Tool loop integration                                                      │
 * │    Replace messages.create() with messages.stream() inside the while loop   │
 * │    from the Loop lab. Call finalMessage() to get stop_reason and content;   │
 * │    the rest of the loop (tool execution, memory push) stays the same.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Measuring TTFT                                                             │
 * │                                                                             │
 * │  TTFT = elapsed time from sending the request until the first "text" event. │
 * │  It captures the prefill wall-clock time (network + model scheduling).      │
 * │                                                                             │
 * │  Implementation hints:                                                      │
 * │   • Record performance.now() just before calling messages.stream().         │
 * │   • Inside the "text" handler, capture the elapsed time on the first delta  │
 * │     only (guard with a flag or a ref initialised to null).                  │
 * │   • Use useRef (not useState) for the flag — event handlers close over it   │
 * │     and it must not trigger re-renders mid-stream.                          │
 * │   • After finalMessage() resolves, attach the captured value to the entry   │
 * │     and display it as a chip on the assistant bubble.                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useRef } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useModel } from '../ModelContext';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
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

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'get_theme':
      return JSON.stringify({ theme: window.getTheme() });
    case 'set_theme':
      window.setTheme(input.theme as 'light' | 'dark');
      return JSON.stringify({ theme: input.theme });
    default:
      return `Unknown tool: ${name}`;
  }
}

// A display entry: either a MessageParam or a streaming draft
interface StreamingEntry {
  msg: MessageParam;
  ttft?: number; // ms, only set for assistant turns that had text
}

export function Chat() {
  const model = useModel();
  const [entries, setEntries] = useState<StreamingEntry[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null); // null = not streaming
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // ref so event handlers close over the latest value without stale closure issues
  const ttftRef = useRef<number | null>(null);

  // --------------------------------------------------------------------
  // This is the main function is extend for required functionality
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userEntry: StreamingEntry = { msg: { role: 'user', content: text } };
    const memory: MessageParam[] = [...entries.map((e) => e.msg), userEntry.msg];
    setEntries((prev) => [...prev, userEntry]);
    setInput('');
    setLoading(true);

    try {
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const requestStart = performance.now();
        ttftRef.current = null;
        setStreamingText(''); // show empty bubble immediately

        const stream = client.messages.stream({
          model: model,
          max_tokens: 1024,
          tools: TOOLS,
          messages: memory,
        });

        // Accumulate text deltas for live display
        stream.on('text', (delta) => {
          if (ttftRef.current === null) {
            ttftRef.current = performance.now() - requestStart;
          }
          setStreamingText((prev) => (prev ?? '') + delta);
        });

        const response = await stream.finalMessage();

        // Commit the completed turn to entries
        const ttft = ttftRef.current ?? undefined;
        memory.push({ role: 'assistant', content: response.content });
        setEntries((prev) => [
          ...prev,
          { msg: { role: 'assistant', content: response.content }, ttft },
        ]);
        setStreamingText(null);

        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: executeTool(block.name, block.input as Record<string, unknown>),
          }));

          const toolEntry: StreamingEntry = {
            msg: { role: 'user', content: toolResults },
          };
          memory.push(toolEntry.msg);
          setEntries((prev) => [...prev, toolEntry]);
        }
      }
    } finally {
      setStreamingText(null);
      setLoading(false);
    }
  };
  // --------------------------------------------------------------------

  const renderBlocks = (msg: MessageParam) => {
    const blocks =
      typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content;

    return (blocks as unknown as Array<{ type: string; [k: string]: unknown }>).map((block, i) => {
      if (block.type === 'text') {
        return (
          <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {block.text as string}
          </Typography>
        );
      }
      const { type, ...rest } = block;
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
        {entries.map((entry, i) => (
          <Paper
            key={i}
            elevation={1}
            sx={{
              p: 1.5,
              maxWidth: '70%',
              alignSelf: entry.msg.role === 'user' ? 'flex-end' : 'flex-start',
              bgcolor: entry.msg.role === 'user' ? 'secondary.main' : 'action.hover',
              ...(entry.msg.role === 'user' && { color: 'secondary.contrastText' }),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {entry.msg.role}
              </Typography>
              {entry.ttft !== undefined && (
                <Chip
                  label={`TTFT ${entry.ttft.toFixed(0)} ms`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 10, height: 18 }}
                />
              )}
            </Box>
            {renderBlocks(entry.msg)}
          </Paper>
        ))}

        {/* Streaming draft bubble */}
        {streamingText !== null && (
          <Paper
            elevation={1}
            sx={{ p: 1.5, maxWidth: '70%', alignSelf: 'flex-start', bgcolor: 'action.hover' }}
          >
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              assistant
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {streamingText}
              <Box component="span" sx={{ opacity: 0.4 }}>
                ▋
              </Box>
            </Typography>
          </Paper>
        )}
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
