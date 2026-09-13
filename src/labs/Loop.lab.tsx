/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Lab: LOOP                                                                 ║
 * ║  Multi-step tool reasoning: the model plans across multiple steps           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Enable the model to call multiple tools in sequence without waiting
 *       for user input. The agent loop continues until stop_reason is "end_turn".
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Content blocks — mixed messages                                            │
 * │                                                                             │
 * │  A single assistant message can contain multiple blocks of different types  │
 * │  at once. The model may narrate its reasoning in a text block and request   │
 * │  a tool call in the same response. Both arrive together in content[].       │
 * │                                                                             │
 * │   content[0]  type: text      "Let me check the current theme."            │
 * │   content[1]  type: tool_use  get_theme  id: tu_01                         │
 * │                                                                             │
 * │  Your renderer must handle every block type. Anything unexpected is safe   │
 * │  to display as raw data — future block types are additive.                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Multi-turn — one user intent, many API calls                               │
 * │                                                                             │
 * │  A "turn" is one API call. A single user message can trigger several turns  │
 * │  before the model finishes. Each turn appends to the shared history:        │
 * │                                                                             │
 * │   Turn 1  user asks ──────────────▶ model: tool_use (get_theme)            │
 * │   Turn 2  tool_result appended ───▶ model: tool_use (set_theme)            │
 * │   Turn 3  tool_result appended ───▶ model: text, end_turn                  │
 * │                                                                             │
 * │  The user types once. The loop runs autonomously until end_turn.           │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  The agent loop — structure                                                 │
 * │                                                                             │
 * │  Call the API → push assistant response to history                          │
 * │  If stop_reason is tool_use:                                                │
 * │    collect every tool_use block from the response                           │
 * │    execute all of them                                                      │
 * │    push ALL results as a single user message → loop                         │
 * │  If stop_reason is end_turn: done                                           │
 * │                                                                             │
 * │  Returning all results in one user message is required — the API treats     │
 * │  a tool_use block without a matching tool_result as an error.               │
 * │                                                                             │
 * │  Guard against infinite loops. A misbehaving model or a tool that always   │
 * │  returns an error can cause the loop to spin indefinitely, burning tokens.  │
 * │  Always cap the number of iterations and break with an error if exceeded.  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Parallel tool use — the model can request multiple tools in one turn       │
 * │                                                                             │
 * │   Client                API                                                 │
 * │     │                    │                                                  │
 * │     │── user msg ───────▶│                                                  │
 * │     │                    │                                                  │
 * │     │◀── tool_use A ─────│  both in one                                     │
 * │     │◀── tool_use B ─────│  assistant message                               │
 * │     │                    │                                                  │
 * │     │  execute A and B concurrently                                         │
 * │     │                    │                                                  │
 * │     │── result A ───────▶│  both in one                                     │
 * │     │── result B ───────▶│  user message                                    │
 * │     │                    │                                                  │
 * │     │◀── text ───────────│  end_turn                                        │
 * │                                                                             │
 * │  You may execute the tools concurrently on your side — the API only cares  │
 * │  that all results arrive together before the next generation step.          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Ask "Get the current theme and tell me what it is" — one loop.
 *       Ask "If we're in light mode, switch to dark; otherwise stay put" — model reasons first.
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

export function Chat() {
  const model = useModel();
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
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const response = await client.messages.create({
          model: model,
          max_tokens: 1024,
          tools: TOOLS,
          messages: memory,
        });

        memory.push({ role: 'assistant', content: response.content });
        setMessages([...memory]);
        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: executeTool(block.name, block.input as Record<string, unknown>),
          }));

          memory.push({ role: 'user', content: toolResults });
          setMessages([...memory]);
        }
      }
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
      const { type, ...rest } = block as unknown as { type: string; [k: string]: unknown };
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
