/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Challenge: INPUT                                                          ║
 * ║  Tool with structured input schema                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * GOAL: Add `set_theme` — a tool that accepts structured input.
 *       The model must pass { theme: "light" | "dark" } to call it.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  input_schema (JSON Schema)                                                 │
 * │                                                                             │
 * │  {                                                                          │
 * │    type: "object",                                                          │
 * │    properties: {                                                            │
 * │      theme: {                                                               │
 * │        type: "string",                                                      │
 * │        enum: ["light", "dark"],     ◀── constrains valid values             │
 * │        description: "The theme"                                             │
 * │      }                                                                      │
 * │    },                                                                       │
 * │    required: ["theme"]              ◀── model MUST provide this             │
 * │  }                                                                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  What the model sends back when it calls set_theme:                         │
 * │                                                                             │
 * │  {                                                                          │
 * │    type: "tool_use",                                                        │
 * │    id: "toolu_01abc...",                                                    │
 * │    name: "set_theme",                                                       │
 * │    input: { theme: "dark" }         ◀── structured, typed input             │
 * │  }                                                                          │
 * │                                                                             │
 * │  You read block.input.theme to know what the model chose.                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Two tools now:                                                             │
 * │                                                                             │
 * │  ┌────────────┐     ┌────────────┐                                         │
 * │  │ get_theme  │     │ set_theme  │                                         │
 * │  │ (no input) │     │ { theme }  │                                         │
 * │  │ returns    │     │ applies    │                                         │
 * │  │ current    │     │ the change │                                         │
 * │  └────────────┘     └────────────┘                                         │
 * │                                                                             │
 * │  The model can now READ and WRITE the theme.                                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * TEST: Ask "Switch to dark mode" — model should call set_theme({ theme: "dark" }).
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
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        tools: TOOLS,
        messages: history,
      });

      history.push({ role: 'assistant', content: response.content });
      setMessages([...history]);

      if (response.stop_reason === 'tool_use') {
        const toolBlock = response.content.find((b) => b.type === 'tool_use')!;

        let content: string;
        if (toolBlock.name === 'get_theme') {
          content = JSON.stringify({ theme: window.getTheme() });
        } else if (toolBlock.name === 'set_theme') {
          window.setTheme((toolBlock.input as Record<string, unknown>).theme as 'light' | 'dark');
          content = JSON.stringify({ theme: (toolBlock.input as Record<string, unknown>).theme });
        } else {
          content = `Unknown tool: ${toolBlock.name}`;
        }

        const toolResult: ToolResultBlockParam = {
          type: 'tool_result' as const,
          tool_use_id: toolBlock.id,
          content,
        };

        history.push({ role: 'user', content: [toolResult] });
        setMessages([...history]);

        const finalResponse = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          tools: TOOLS,
          messages: history,
        });

        history.push({ role: 'assistant', content: finalResponse.content });
        setMessages([...history]);
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
