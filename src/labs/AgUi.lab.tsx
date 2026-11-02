/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: AG-UI  (Agent-to-UI Protocol)                                         ║
 * ║  Extends → Streaming lab (same SSE loop, structured events added on top)    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: Streaming gives you raw token deltas — but a real UI needs to know
 *          WHAT is happening: is the agent thinking, calling a tool, or done?
 *          Without structured events you end up with fragile text-matching hacks.
 *
 * GOAL: Implement the AG-UI event protocol on top of the Anthropic streaming API
 *       so the UI reacts to agent lifecycle events, not just raw text.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What is AG-UI?                                                             │
 * │                                                                             │
 * │  AG-UI (Agent-User Interaction) is an open protocol that standardises the  │
 * │  event stream between an AI agent and its front-end.  It defines a small   │
 * │  set of typed events emitted as Server-Sent Events (SSE):                  │
 * │                                                                             │
 * │    RUN_STARTED      — agent begins processing a turn                        │
 * │    TEXT_MESSAGE_START    — a text message chunk begins                      │
 * │    TEXT_MESSAGE_CONTENT  — incremental text delta                           │
 * │    TEXT_MESSAGE_END      — text message complete                            │
 * │    TOOL_CALL_START   — agent is about to call a tool                        │
 * │    TOOL_CALL_END     — tool call finished                                   │
 * │    RUN_FINISHED     — agent turn complete                                   │
 * │    RUN_ERROR        — unrecoverable error                                   │
 * │                                                                             │
 * │  Why not just parse raw SSE tokens?                                         │
 * │  Because tool calls, multi-step loops, and parallel calls can interleave.  │
 * │  Typed events let the UI render progress indicators, tool call cards, and  │
 * │  streaming text bubbles all at once — without any string-matching.         │
 * │                                                                             │
 * │  Spec: https://docs.ag-ui.com/concepts/events                              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  A2UI in this lab                                                           │
 * │                                                                             │
 * │  We don't run a separate AG-UI server.  Instead we map Anthropic streaming  │
 * │  events → AG-UI events inside the browser, then drive the UI from those    │
 * │  strongly-typed events.  This is the "A2UI" pattern:                       │
 * │                                                                             │
 * │   Anthropic stream event  →  AG-UI event emitted                           │
 * │   ─────────────────────────────────────────────                             │
 * │   message_start           →  RUN_STARTED                                   │
 * │   content_block_start     →  TEXT_MESSAGE_START  or  TOOL_CALL_START       │
 * │   content_block_delta     →  TEXT_MESSAGE_CONTENT                          │
 * │   content_block_stop      →  TEXT_MESSAGE_END    or  TOOL_CALL_END         │
 * │   message_stop            →  RUN_FINISHED                                  │
 * │   error                   →  RUN_ERROR                                     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What this teaches                                                          │
 * │                                                                             │
 * │  • How to map the Anthropic streaming event stream to AG-UI typed events   │
 * │  • Why a typed event protocol is easier to build UI on than raw deltas     │
 * │  • Rendering a live "agent timeline" driven by structured events            │
 * │  • Handling multi-step tool loops with streaming in the same component      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useRef, useEffect } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useModel } from '../ModelContext';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import SendIcon from '@mui/icons-material/Send';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

// ─── AG-UI event types ────────────────────────────────────────────────────────

type AgUiEventType =
  | 'RUN_STARTED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_END'
  | 'RUN_FINISHED'
  | 'RUN_ERROR';

interface AgUiEvent {
  type: AgUiEventType;
  messageId?: string;
  delta?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  error?: string;
}

// ─── UI state derived from AG-UI events ───────────────────────────────────────

interface TimelineEntry {
  id: string;
  kind: 'text' | 'tool' | 'status';
  role?: 'user' | 'assistant';
  text?: string;        // accumulated for streaming text
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  status?: 'running' | 'done' | 'error';
  statusText?: string;
}

// ─── Anthropic client & tools ─────────────────────────────────────────────────

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
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Chat() {
  const model = useModel();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  const nextId = () => `e-${++counterRef.current}`;

  const emit = (event: AgUiEvent, setTl: React.Dispatch<React.SetStateAction<TimelineEntry[]>>) => {
    setTl((prev) => {
      const tl = [...prev];
      switch (event.type) {
        case 'RUN_STARTED':
          return [...tl, { id: nextId(), kind: 'status', status: 'running', statusText: 'Agent is thinking…' }];

        case 'TEXT_MESSAGE_START':
          return [...tl, { id: event.messageId!, kind: 'text', role: 'assistant', text: '' }];

        case 'TEXT_MESSAGE_CONTENT': {
          const idx = tl.findIndex((e) => e.id === event.messageId);
          if (idx === -1) return tl;
          const updated = { ...tl[idx], text: (tl[idx].text ?? '') + (event.delta ?? '') };
          return [...tl.slice(0, idx), updated, ...tl.slice(idx + 1)];
        }

        case 'TEXT_MESSAGE_END':
          return tl; // nothing extra needed

        case 'TOOL_CALL_START':
          return [...tl, {
            id: event.messageId!,
            kind: 'tool',
            toolName: event.toolName,
            toolInput: event.toolInput,
            status: 'running',
          }];

        case 'TOOL_CALL_END': {
          const idx = tl.findIndex((e) => e.id === event.messageId);
          if (idx === -1) return tl;
          const updated = { ...tl[idx], toolResult: event.toolResult, status: 'done' as const };
          return [...tl.slice(0, idx), updated, ...tl.slice(idx + 1)];
        }

        case 'RUN_FINISHED':
          return tl.filter((e) => !(e.kind === 'status' && e.status === 'running'));

        case 'RUN_ERROR':
          return [...tl.filter((e) => !(e.kind === 'status' && e.status === 'running')),
            { id: nextId(), kind: 'status', status: 'error', statusText: event.error ?? 'Unknown error' }];

        default:
          return tl;
      }
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    // Add user message directly to timeline
    const userEntry: TimelineEntry = { id: nextId(), kind: 'text', role: 'user', text };
    setTimeline((prev) => [...prev, userEntry]);

    const memory: MessageParam[] = [{ role: 'user', content: text }];

    // Capture setTimeline in a stable ref so the emit closure captures it correctly
    const setTl = setTimeline;

    try {
      emit({ type: 'RUN_STARTED' }, setTl);
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const textMsgId = nextId();
        let currentText = '';

        const stream = client.messages.stream({
          model,
          max_tokens: 1024,
          tools: TOOLS,
          messages: memory,
        });

        let textStarted = false;
        const toolBlocks: Map<number, { id: string; name: string; inputJson: string }> = new Map();

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              emit({ type: 'TEXT_MESSAGE_START', messageId: textMsgId }, setTl);
              textStarted = true;
            } else if (event.content_block.type === 'tool_use') {
              const toolEntryId = nextId();
              toolBlocks.set(event.index, { id: toolEntryId, name: event.content_block.name, inputJson: '' });
              emit({ type: 'TOOL_CALL_START', messageId: toolEntryId, toolName: event.content_block.name, toolInput: '' }, setTl);
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              currentText += event.delta.text;
              emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: textMsgId, delta: event.delta.text }, setTl);
            } else if (event.delta.type === 'input_json_delta') {
              const block = toolBlocks.get(event.index);
              if (block) block.inputJson += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (textStarted) {
              emit({ type: 'TEXT_MESSAGE_END', messageId: textMsgId }, setTl);
              textStarted = false;
            }
          } else if (event.type === 'message_stop') {
            // handled after the loop
          }
        }

        const finalMsg = await stream.finalMessage();
        stopReason = finalMsg.stop_reason ?? 'end_turn';
        memory.push({ role: 'assistant', content: finalMsg.content });

        if (stopReason === 'tool_use') {
          const toolUseBlocks = finalMsg.content.filter((b) => b.type === 'tool_use');
          const results: ToolResultBlockParam[] = [];

          for (const block of toolUseBlocks) {
            const input = block.input as Record<string, unknown>;
            const result = executeTool(block.name, input);

            // find the matching timeline entry by name (tool blocks are appended in order)
            const entry = [...toolBlocks.values()].find((t) => t.name === block.name);
            if (entry) {
              emit({ type: 'TOOL_CALL_END', messageId: entry.id, toolResult: result }, setTl);
            }

            results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }

          memory.push({ role: 'user', content: results });
        }
      }

      emit({ type: 'RUN_FINISHED' }, setTl);
    } catch (err) {
      emit({ type: 'RUN_ERROR', error: String(err) }, setTl);
    } finally {
      setLoading(false);
    }
  };

  // ─── Rendering ──────────────────────────────────────────────────────────────

  const renderEntry = (entry: TimelineEntry) => {
    if (entry.kind === 'status') {
      return (
        <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, opacity: 0.7 }}>
          {entry.status === 'running' && <CircularProgress size={14} />}
          {entry.status === 'done' && <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />}
          {entry.status === 'error' && <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />}
          <Typography variant="caption">{entry.statusText}</Typography>
        </Box>
      );
    }

    if (entry.kind === 'tool') {
      return (
        <Box key={entry.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignSelf: 'flex-start', maxWidth: '70%' }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: entry.status === 'running' ? 'warning.main' : 'divider',
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {entry.status === 'running'
                ? <CircularProgress size={14} color="warning" />
                : <BuildIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
              <Chip label={entry.toolName} size="small" variant="outlined" />
            </Box>
            {entry.toolInput && (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', opacity: 0.75 }}>
                in: {entry.toolInput}
              </Typography>
            )}
            {entry.toolResult && (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5, color: 'success.main' }}>
                out: {entry.toolResult}
              </Typography>
            )}
          </Paper>
        </Box>
      );
    }

    // text bubble
    return (
      <Paper
        key={entry.id}
        elevation={1}
        sx={{
          p: 1.5,
          maxWidth: '70%',
          alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
          bgcolor: entry.role === 'user' ? 'secondary.main' : 'action.hover',
          ...(entry.role === 'user' && { color: 'secondary.contrastText' }),
        }}
      >
        <Typography variant="caption" sx={{ opacity: 0.7 }}>{entry.role}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{entry.text}</Typography>
      </Paper>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {timeline.map(renderEntry)}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Try: 'What theme am I on? Switch it.' "
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
