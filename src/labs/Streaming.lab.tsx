/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: STREAMING                                                              ║
 * ║  Same agent loop as Loop, but responses arrive token-by-token via stream     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: Our users came to use with "Your application is too slow"
 *
 * GOAL: Replace the blocking messages.create() call with messages.stream() so
 *       text blocks render incrementally. Measure time-to-first-token (TTFT)
 *       for each generation step.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Streaming — how it works                                                   │
 * │                                                                             │
 * │  client.messages.stream() returns a Stream helper. Subscribe to events:     │
 * │                                                                             │
 * │   "text"        fired for each text delta; arg is the incremental string    │
 * │   "message"     fired once when the full message is ready (end of stream).  │
 * │                                                                             │
 * │  During streaming we hold a "draft" assistant message that accumulates      │
 * │  text. Once the stream ends we replace it with the final message object     │
 * │  (which includes tool_use blocks with fully assembled inputs).              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Time-to-first-token (TTFT)                                                 │
 * │                                                                             │
 * │  TTFT = time from sending the request until the first "text" event fires.   │
 * │  It reflects network latency + model scheduling, not generation speed.      │
 * │  Record performance.now() at request start, capture it on the first text    │
 * │  delta, display alongside the assistant turn.                               │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Why TTFT — and what the KV cache has to do with it                         │
 * │                                                                             │
 * │  GenAI models generate one token at a time. Before the first token can      │
 * │  appear, the model must process every token in the prompt (the "prefill"    │
 * │  phase): it computes key/value attention tensors for each position and      │
 * │  stores them in the KV cache. Only after that is done does autoregressive   │
 * │  decoding begin and the first output token emerge.                          │
 * │                                                                             │
 * │  The KV cache is the memory of those intermediate attention states. Once    │
 * │  built it lets subsequent tokens be decoded cheaply — but building it for   │
 * │  a long prompt is expensive and dominates latency. That is why TTFT, not    │
 * │  tokens-per-second, is the right metric for perceived responsiveness:       │
 * │  the user is blocked until prefill finishes, regardless of how fast the     │
 * │  model generates afterwards.                                                │
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
