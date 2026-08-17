/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Challenge: LOOP                                                           ║
 * ║  Multi-step tool reasoning: the model plans across multiple steps           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Enable the model to call multiple tools in sequence without waiting
 *       for user input. The agent loop continues until stop_reason is "end_turn".
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Multi-Step Reasoning                                                       │
 * │                                                                             │
 * │  User: "Switch the theme to dark"                                           │
 * │                                                                             │
 * │  Loop Turn 1:                                                               │
 * │  ┌────────────────────────────────────────────────────────────┐             │
 * │  │ Model response: { type: "tool_use", name: "get_theme" }    │             │
 * │  │ stop_reason: "tool_use"                                    │             │
 * │  │                                                            │             │
 * │  │ → Client executes get_theme, gets "light"                  │             │
 * │  │ → Appends tool_result to history                           │             │
 * │  └────────────────────────────────────────────────────────────┘             │
 * │                                                                             │
 * │  Loop Turn 2:                                                               │
 * │  ┌────────────────────────────────────────────────────────────┐             │
 * │  │ Model response: { type: "tool_use", name: "set_theme" }    │             │
 * │  │ input: { theme: "dark" }                                   │             │
 * │  │ stop_reason: "tool_use"                                    │             │
 * │  │                                                            │             │
 * │  │ → Client executes set_theme("dark")                        │             │
 * │  │ → Appends tool_result to history                           │             │
 * │  └────────────────────────────────────────────────────────────┘             │
 * │                                                                             │
 * │  Loop Turn 3:                                                               │
 * │  ┌────────────────────────────────────────────────────────────┐             │
 * │  │ Model response: { type: "text", text: "Done! Theme set..." }│             │
 * │  │ stop_reason: "end_turn"  ◀── loop exits                    │             │
 * │  └────────────────────────────────────────────────────────────┘             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Key Pattern                                                                │
 * │                                                                             │
 * │  while (stopReason !== 'end_turn') {                                        │
 * │    response = await client.messages.create({ messages: history });         │
 * │    history.push({ role: 'assistant', content: response.content });         │
 * │                                                                             │
 * │    if (response.stop_reason === 'tool_use') {                              │
 * │      // Execute all tool calls from this turn                              │
 * │      const toolResults = [...];                                            │
 * │      // Add tool results as user turn                                       │
 * │      history.push({ role: 'user', content: toolResults });                │
 * │    }                                                                       │
 * │    stopReason = response.stop_reason ?? 'end_turn';                        │
 * │  }                                                                         │
 * │                                                                             │
 * │  The loop keeps going until the model says it's done.                       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Why This Matters                                                           │
 * │                                                                             │
 * │  • Agentic: The model drives the flow; you just execute and loop           │
 * │  • Reasoning: Model can check state (get_theme) then make decisions        │
 * │  • Planning: Complex tasks that need multiple steps work naturally         │
 * │                                                                             │
 * │  Example: "Make the background dark and tell me the new setting"           │
 * │  Model reasons: First check current theme, then set it, then report.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Ask "Get the current theme and tell me what it is" — one loop.
 *       Ask "If we're in light mode, switch to dark; otherwise stay put" — model reasons first.
 */

import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
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
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const history: MessageParam[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      let stopReason = '';

      while (stopReason !== 'end_turn') {
        const response = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          tools: TOOLS,
          messages: history,
        });

        history.push({ role: 'assistant', content: response.content });
        setMessages([...history]);
        stopReason = response.stop_reason ?? 'end_turn';

        if (stopReason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResults: ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: executeTool(block.name, block.input as Record<string, unknown>),
          }));

          history.push({ role: 'user', content: toolResults });
          setMessages([...history]);
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
