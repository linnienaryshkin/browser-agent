/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: A2UI  (Agent-to-UI — Dynamic UI Generation)                           ║
 * ║  The model generates UI as validated data; the browser renders it           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * PROBLEM: An LLM returning markdown or raw HTML can execute arbitrary content
 *          in the browser. A2UI solves this by having the agent express UI as
 *          strongly-typed data (a component tree) that a renderer validates and
 *          paints — the agent never touches the DOM directly.
 *
 * GOAL: Enable the model to call two tools in sequence:
 *         get_theme  — reads the current app theme (context for styling)
 *         render_ui  — accepts a typed A2UI component tree and displays it
 *       Same multi-step agent loop as the Loop lab — the difference is that
 *       render_ui produces visible UI instead of a side-effect.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What is A2UI?                                                              │
 * │                                                                             │
 * │  A2UI (Agent-to-UI) is an open protocol for agent-driven interfaces.       │
 * │  Instead of generating code or markdown, the agent emits a validated        │
 * │  component tree — plain JSON that maps 1-to-1 to framework widgets.        │
 * │                                                                             │
 * │  Security: the browser renders only known component types; anything         │
 * │  unexpected is safely shown as a fallback — no eval, no innerHTML.         │
 * │                                                                             │
 * │  Portability: the same JSON renders on React, Angular, Flutter, SwiftUI.   │
 * │                                                                             │
 * │  Spec: https://github.com/a2ui-project/a2ui                                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Component catalog (subset implemented here)                                │
 * │                                                                             │
 * │  text     { text, variant?, color? }                                        │
 * │  list     { items: string[] }                                               │
 * │  badge    { label, color? }                                                 │
 * │                                                                             │
 * │  The catalog is intentionally small — enough to show the concept.           │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Tool flow (identical structure to the Loop lab)                            │
 * │                                                                             │
 * │  Turn 1  user asks ──────────────▶ model: tool_use (get_theme)             │
 * │  Turn 2  tool_result appended ───▶ model: tool_use (render_ui)             │
 * │  Turn 3  tool_result appended ───▶ model: text, end_turn                   │
 * │                                                                             │
 * │  render_ui result is intercepted client-side to paint the component tree.  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { useModel } from '../ModelContext';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import SendIcon from '@mui/icons-material/Send';

const client = new Anthropic({
  apiKey: import.meta.env.ANTHROPIC_API_KEY,
  baseURL: `${window.location.origin}/api/anthropic`,
  dangerouslyAllowBrowser: true,
});

// ─── A2UI component types ─────────────────────────────────────────────────────

type A2Component =
  | { type: 'text'; text: string; variant?: 'body1' | 'body2' | 'h5' | 'h6' | 'caption' }
  | { type: 'list'; items: string[] }
  | {
      type: 'badge';
      label: string;
      color?: 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
    };

// ─── A2UI renderer — maps typed data to React widgets ────────────────────────

function renderA2Component(comp: A2Component, key: number): React.ReactNode {
  switch (comp.type) {
    case 'text': {
      const label = comp.text ?? (comp as unknown as { content?: string }).content ?? '';
      return (
        <Typography
          key={key}
          variant={comp.variant ?? 'body1'}
          sx={{ color: comp.color, whiteSpace: 'pre-wrap' }}
        >
          {label}
        </Typography>
      );
    }
    case 'list':
      return (
        <List key={key} dense disablePadding>
          {(comp.items ?? []).map((item, i) => (
            <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
              <ListItemText
                primary={typeof item === 'string' ? item : JSON.stringify(item)}
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
          ))}
        </List>
      );
    case 'badge':
      return <Chip key={key} label={comp.label} color={comp.color ?? 'default'} size="small" />;
    default: {
      const raw = comp as { type: string };
      return (
        <Typography key={key} variant="caption" sx={{ opacity: 0.5, fontFamily: 'monospace' }}>
          [unknown: {raw.type}]
        </Typography>
      );
    }
  }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_theme',
    description: 'Get the current app color theme. Returns "light" or "dark".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_theme',
    description:
      'Set the app color theme. Call get_theme first to know the current state before changing it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        theme: { type: 'string', enum: ['light', 'dark'], description: 'The theme to set' },
      },
      required: ['theme'],
    },
  },
  {
    name: 'render_ui',
    description:
      'Render a typed A2UI component tree in the chat. ' +
      'Call get_theme first to know the current theme. ' +
      'Components: text (prose), list (bullet items), badge (colored chip). ' +
      'Express your entire response as structured UI — never reply with plain text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        components: {
          type: 'array',
          description:
            'Ordered list of A2UI components. Three types: ' +
            'text → {type:"text", text:"...", variant?:"body1"|"body2"|"h5"|"h6"|"caption"}; ' +
            'list → {type:"list", items:["string","string",...]}; ' +
            'badge → {type:"badge", label:"...", color?:"default"|"primary"|"secondary"|"success"|"error"|"warning"|"info"}.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['text', 'list', 'badge'] },
              text: { type: 'string' },
              label: { type: 'string' },
              variant: { type: 'string' },
              color: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
            required: ['type'],
          },
        },
      },
      required: ['components'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'get_theme':
      return JSON.stringify({ theme: window.getTheme() });
    case 'set_theme':
      window.setTheme(input.theme as 'light' | 'dark');
      return JSON.stringify({ theme: input.theme });
    case 'render_ui': {
      const components = input.components as unknown[] | undefined;
      if (!Array.isArray(components) || components.length === 0) {
        return JSON.stringify({
          error:
            'components array is required and must not be empty. Retry with a valid component tree.',
        });
      }
      return JSON.stringify({ status: 'rendered', componentCount: components.length });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Chat() {
  const model = useModel();
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // rendered component trees, keyed by tool_use_id
  const [renderedUi, setRenderedUi] = useState<Map<string, A2Component[]>>(new Map());

  // --------------------------------------------------------------------
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const memory: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(memory);
    setInput('');
    setLoading(true);

    try {
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const response = await client.messages.create({
          model,
          max_tokens: 1024,
          tools: TOOLS,
          system:
            'You are an A2UI agent. For every user request: first call get_theme, then call render_ui with a typed component tree that answers the request. You must always call render_ui — do not skip it.',
          messages: memory,
        });

        memory.push({ role: 'assistant', content: response.content });
        setMessages([...memory]);
        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = toolUseBlocks.map((block) => {
            const result = executeTool(block.name, block.input as Record<string, unknown>);

            if (block.name === 'render_ui') {
              const components = (block.input as { components: A2Component[] }).components ?? [];
              setRenderedUi((prev) => new Map(prev).set(block.id, components));
            }

            return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
          });

          memory.push({ role: 'user', content: toolResults });
          setMessages([...memory]);
        }
      }
    } finally {
      setLoading(false);
    }
  };
  // --------------------------------------------------------------------

  const renderMessageContent = (msg: MessageParam) => {
    const blocks =
      typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : (msg.content as Array<{ type: string; [k: string]: unknown }>);

    return blocks.map((block, i) => {
      if (block.type === 'text') {
        return (
          <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {block.text as string}
          </Typography>
        );
      }

      // For render_ui tool_use blocks, render the component tree inline
      if (block.type === 'tool_use' && block.name === 'render_ui') {
        const components = renderedUi.get(block.id as string) ?? [];
        return (
          <Box key={i} sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', mb: 0.5 }}>
              a2ui · component tree
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {components.map((comp, j) => renderA2Component(comp, j))}
            </Box>
          </Box>
        );
      }

      const { type, ...rest } = block;
      return (
        <Box key={i} sx={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.85 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            {type as string}
          </Typography>
          <pre style={{ margin: 0 }}>{JSON.stringify(rest, null, 2)}</pre>
        </Box>
      );
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 2 }}>
      <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages
          .filter((msg) => {
            const blocks = typeof msg.content === 'string' ? [msg.content] : msg.content;
            return Array.isArray(blocks) ? blocks.length > 0 : !!blocks;
          })
          .map((msg, i) => (
            <Paper
              key={i}
              elevation={1}
              sx={{
                p: 1.5,
                maxWidth: '80%',
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
          placeholder="Try: 'Show me a card with 3 tips for React' or 'List 5 continents'"
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
