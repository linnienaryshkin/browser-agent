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
 * GOAL: Connect to a real AG-UI server (POST /agui) via HttpAgent from
 *       @ag-ui/client — the browser receives strongly-typed AG-UI events,
 *       no Anthropic SDK in the browser at all.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What is AG-UI?                                                             │
 * │                                                                             │
 * │  AG-UI (Agent-User Interaction) is an open protocol that standardises the  │
 * │  event stream between an AI agent and its front-end.  It defines a small   │
 * │  set of typed events emitted as Server-Sent Events (SSE):                  │
 * │                                                                             │
 * │    RUN_STARTED          — agent begins processing a turn                   │
 * │    TEXT_MESSAGE_START   — a text message chunk begins                      │
 * │    TEXT_MESSAGE_CONTENT — incremental text delta                           │
 * │    TEXT_MESSAGE_END     — text message complete                            │
 * │    TOOL_CALL_START      — agent is about to call a tool                   │
 * │    TOOL_CALL_ARGS       — streaming tool argument deltas                   │
 * │    TOOL_CALL_END        — tool call finished                               │
 * │    STEP_STARTED         — a reasoning step begins                          │
 * │    STEP_FINISHED        — a reasoning step ends                            │
 * │    RUN_FINISHED         — agent turn complete                              │
 * │    RUN_ERROR            — unrecoverable error                              │
 * │                                                                             │
 * │  Spec: https://docs.ag-ui.com/concepts/events                              │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Architecture in this lab                                                   │
 * │                                                                             │
 * │  Browser (this file)         Vite dev server (src/agui-server.ts)          │
 * │  ───────────────────         ────────────────────────────────────          │
 * │  HttpAgent (@ag-ui/client)   POST /agui  →  Anthropic streaming API        │
 * │       │                           │                                         │
 * │       │◄──── AG-UI SSE events ────┤  maps Anthropic stream → AG-UI events  │
 * │       │                           │  via @ag-ui/encoder                     │
 * │  AgentSubscriber                  │                                         │
 * │  drives React state               │                                         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Client-side tools                                                          │
 * │                                                                             │
 * │  get_theme / set_theme run in the browser (they touch window.getTheme /    │
 * │  window.setTheme).  When the server calls them it gets a "must be executed  │
 * │  client-side" error, which tells the agent to ask the frontend.            │
 * │  A real AG-UI app would use the ToolCallResult subscriber hook to execute   │
 * │  tools locally and feed results back — shown here as a TODO extension.     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useRef, useEffect } from 'react';
import { HttpAgent } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import type {
  AgentSubscriber,
  AgentSubscriberParams,
  TextMessageContentEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  RunErrorEvent,
  BaseEvent,
  UserMessage,
  AssistantMessage,
  Tool,
  ToolMessage,
} from '@ag-ui/client';
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

// ─── Timeline UI types ────────────────────────────────────────────────────────

interface TimelineEntry {
  id: string;
  kind: 'text' | 'tool' | 'status';
  role?: 'user' | 'assistant';
  text?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  status?: 'running' | 'done' | 'error';
  statusText?: string;
}

// ─── Tools (defined and executed client-side, schema forwarded to the server) ─

const TOOLS: Tool[] = [
  {
    name: 'get_theme',
    description: 'Get the current app color theme. Returns "light" or "dark".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_theme',
    description:
      'Set the app color theme. Call get_theme first to know the current state before changing it.',
    parameters: {
      type: 'object',
      properties: {
        theme: { type: 'string', enum: ['light', 'dark'], description: 'The theme to set' },
      },
      required: ['theme'],
    },
  },
];

function executeTool(name: string, argsJson: string): string {
  const input = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
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

// ─── Singleton HttpAgent pointing at our Vite middleware ──────────────────────

const agent = new HttpAgent({
  url: `${window.location.origin}/agui`,
  agentId: 'browser-agent',
});

// ─── Component ────────────────────────────────────────────────────────────────

export function Chat() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  const nextId = () => `e-${++counterRef.current}`;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    // Append user bubble immediately
    setTimeline((prev) => [...prev, { id: nextId(), kind: 'text', role: 'user', text }]);

    // Append current user message to agent's message list
    const userMsg: UserMessage = { role: 'user', content: text, id: crypto.randomUUID() };
    agent.messages = [...agent.messages, userMsg];

    type OnEventParams = { event: BaseEvent } & AgentSubscriberParams;

    // toolCallId → { name, argsJson (input), result, entryId }
    const pendingToolCalls = new Map<
      string,
      { name: string; argsJson: string; result: string; entryId: string }
    >();
    let textEntryId = '';

    const subscriber: AgentSubscriber = {
      onEvent({ event }: OnEventParams) {
        switch (event.type) {
          case EventType.RUN_STARTED:
            setTimeline((prev) => [
              ...prev,
              { id: nextId(), kind: 'status', status: 'running', statusText: 'Agent is thinking…' },
            ]);
            break;

          case EventType.TEXT_MESSAGE_START: {
            textEntryId = nextId();
            setTimeline((prev) => [
              ...prev,
              { id: textEntryId, kind: 'text', role: 'assistant', text: '' },
            ]);
            break;
          }

          case EventType.TEXT_MESSAGE_CONTENT: {
            const delta = (event as TextMessageContentEvent).delta ?? '';
            setTimeline((prev) => {
              const idx = prev.findIndex((e) => e.id === textEntryId);
              if (idx === -1) return prev;
              const updated = { ...prev[idx], text: (prev[idx].text ?? '') + delta };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
            break;
          }

          case EventType.TOOL_CALL_START: {
            const ev = event as ToolCallStartEvent;
            const entryId = nextId();
            pendingToolCalls.set(ev.toolCallId, {
              name: ev.toolCallName,
              argsJson: '',
              result: '',
              entryId,
            });
            setTimeline((prev) => [
              ...prev,
              {
                id: entryId,
                kind: 'tool',
                toolName: ev.toolCallName,
                toolArgs: '',
                status: 'running',
              },
            ]);
            break;
          }

          case EventType.TOOL_CALL_ARGS: {
            const ev = event as ToolCallArgsEvent;
            const tc = pendingToolCalls.get(ev.toolCallId);
            if (!tc) break;
            tc.argsJson += ev.delta ?? '';
            setTimeline((prev) => {
              const idx = prev.findIndex((e) => e.id === tc.entryId);
              if (idx === -1) return prev;
              const updated = { ...prev[idx], toolArgs: tc.argsJson };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
            break;
          }

          case EventType.TOOL_CALL_END: {
            const ev = event as ToolCallEndEvent;
            const tc = pendingToolCalls.get(ev.toolCallId);
            if (!tc) break;
            const result = executeTool(tc.name, tc.argsJson);
            tc.result = result;
            setTimeline((prev) => {
              const idx = prev.findIndex((e) => e.id === tc.entryId);
              if (idx === -1) return prev;
              const updated = { ...prev[idx], status: 'done' as const, toolResult: result };
              return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            });
            break;
          }

          case EventType.RUN_FINISHED:
            setTimeline((prev) =>
              prev.filter((e) => !(e.kind === 'status' && e.status === 'running')),
            );
            break;

          case EventType.RUN_ERROR: {
            const ev = event as RunErrorEvent;
            setTimeline((prev) => [
              ...prev.filter((e) => !(e.kind === 'status' && e.status === 'running')),
              {
                id: nextId(),
                kind: 'status',
                status: 'error',
                statusText: ev.message ?? 'Unknown error',
              },
            ]);
            break;
          }
        }
      },
    };

    try {
      // Agent loop: keep running until no tool calls were made in the last turn
      while (true) {
        pendingToolCalls.clear();
        await agent.runAgent({ tools: TOOLS }, subscriber);

        if (pendingToolCalls.size === 0) break;

        // HttpAgent already appended the assistant message — we only need to add tool results.
        // Find the assistant message it appended (last assistant msg) and update its toolCalls
        // so the server can reconstruct the tool_use blocks from it.
        const lastAssistantIdx = [...agent.messages]
          .reverse()
          .findIndex((m) => m.role === 'assistant');
        if (lastAssistantIdx !== -1) {
          const idx = agent.messages.length - 1 - lastAssistantIdx;
          const existing = agent.messages[idx] as AssistantMessage;
          if (!existing.toolCalls?.length) {
            const updated: AssistantMessage = {
              ...existing,
              toolCalls: [...pendingToolCalls.entries()].map(([toolCallId, tc]) => ({
                id: toolCallId,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.argsJson },
              })),
            };
            const msgs = [...agent.messages];
            msgs[idx] = updated;
            agent.messages = msgs;
          }
        }

        // Append one ToolMessage per result
        const toolMsgs: ToolMessage[] = [...pendingToolCalls.entries()].map(([toolCallId, tc]) => ({
          role: 'tool' as const,
          id: crypto.randomUUID(),
          toolCallId,
          content: tc.result,
        }));
        agent.messages = [...agent.messages, ...toolMsgs];
      }
    } catch (err) {
      setTimeline((prev) => [
        ...prev.filter((e) => !(e.kind === 'status' && e.status === 'running')),
        { id: nextId(), kind: 'status', status: 'error', statusText: String(err) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Rendering ──────────────────────────────────────────────────────────────

  const renderEntry = (entry: TimelineEntry) => {
    if (entry.kind === 'status') {
      return (
        <Box
          key={entry.id}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, opacity: 0.7 }}
        >
          {entry.status === 'running' && <CircularProgress size={14} />}
          {entry.status === 'done' && (
            <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
          )}
          {entry.status === 'error' && <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />}
          <Typography variant="caption">{entry.statusText}</Typography>
        </Box>
      );
    }

    if (entry.kind === 'tool') {
      return (
        <Box
          key={entry.id}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            alignSelf: 'flex-start',
            maxWidth: '70%',
          }}
        >
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
              {entry.status === 'running' ? (
                <CircularProgress size={14} color="warning" />
              ) : (
                <BuildIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              )}
              <Chip label={entry.toolName} size="small" variant="outlined" />
            </Box>
            {entry.toolArgs && (
              <Typography
                variant="caption"
                sx={{ fontFamily: 'monospace', display: 'block', opacity: 0.75 }}
              >
                args: {entry.toolArgs}
              </Typography>
            )}
            {entry.toolResult && (
              <Typography
                variant="caption"
                sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5, color: 'success.main' }}
              >
                result: {entry.toolResult}
              </Typography>
            )}
          </Paper>
        </Box>
      );
    }

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
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {entry.role}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {entry.text}
        </Typography>
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
          placeholder="Try: 'What is my OS username?' or 'Tell me a joke.'"
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
