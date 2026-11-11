/**
 * AG-UI HTTP endpoint — Vite middleware at POST /agui
 *
 * Accepts a RunAgentInput body, runs one Anthropic turn, and emits AG-UI SSE
 * events. Tools are defined and executed on the browser side — the server just
 * forwards the tool schemas to Anthropic and emits TOOL_CALL_* events so the
 * browser knows what to execute. The browser appends tool results to messages
 * and calls runAgent() again, driving the agent loop from the client.
 */

import type { Connect } from 'vite';
import Anthropic from '@anthropic-ai/sdk';
import { EventEncoder } from '@ag-ui/encoder';
import { EventType } from '@ag-ui/core';
import type { RunAgentInput, Message, TextPart, Tool, AssistantMessage, ToolMessage } from '@ag-ui/core';

let anthropic: Anthropic;

const log = (...args: unknown[]) => console.log('[agui]', ...args);

function contentToText(content: Message['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }
  return '';
}

function agUiMessagesToAnthropic(messages: Message[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = contentToText(msg.content);
      if (text) out.push({ role: 'user', content: text });

    } else if (msg.role === 'assistant') {
      const m = msg as AssistantMessage;
      const content: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
        });
      }
      if (content.length > 0) out.push({ role: 'assistant', content });

    } else if (msg.role === 'tool') {
      const m = msg as ToolMessage;
      const text = typeof m.content === 'string' ? m.content : contentToText(m.content);
      // Tool results must be grouped into one user message if multiple come together.
      // Append to the last user message if it already contains tool_result blocks,
      // otherwise push a fresh one.
      const last = out[out.length - 1];
      const toolResult: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: text,
      };
      if (last?.role === 'user' && Array.isArray(last.content)) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(toolResult);
      } else {
        out.push({ role: 'user', content: [toolResult] });
      }
    }
  }

  return out;
}

function agUiToolsToAnthropic(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: (t.parameters ?? { type: 'object', properties: {}, required: [] }) as Anthropic.Tool['input_schema'],
  }));
}

export function aguiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.url !== '/agui' || req.method !== 'POST') return next();

    log('← POST /agui');
    anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let body = '';
    for await (const chunk of req) body += chunk;

    let input: RunAgentInput;
    try {
      input = JSON.parse(body);
    } catch {
      log('  bad JSON body');
      res.writeHead(400);
      res.end('Bad JSON');
      return;
    }

    const tools = input.tools ?? [];
    log(`  threadId=${input.threadId}  runId=${input.runId}  messages=${input.messages?.length ?? 0}  tools=${tools.map((t) => t.name).join(', ') || 'none'}`);

    const encoder = new EventEncoder({ accept: req.headers['accept'] });
    res.writeHead(200, {
      'Content-Type': encoder.getContentType(),
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const runId = input.runId ?? crypto.randomUUID();
    const threadId = input.threadId ?? crypto.randomUUID();

    const send = (event: Parameters<typeof encoder.encodeSSE>[0]) => {
      log(`  → ${event.type}`);
      res.write(encoder.encodeSSE(event));
    };

    send({ type: EventType.RUN_STARTED, runId, threadId });

    const anthropicMessages = agUiMessagesToAnthropic(input.messages ?? []);
    log(`  anthropic messages: ${anthropicMessages.length}`);
    anthropicMessages.forEach((m, i) => {
      const preview = typeof m.content === 'string' ? m.content.slice(0, 80) : '[structured]';
      log(`    [${i}] ${m.role}: ${preview}`);
    });

    if (anthropicMessages.length === 0) {
      log('  no messages — finishing immediately');
      send({ type: EventType.RUN_FINISHED, runId, threadId, outcome: { type: 'success' } });
      res.end();
      return;
    }

    try {
      const messageId = crypto.randomUUID();
      let textStarted = false;
      // index → { toolCallId, name, accumulated args }
      const toolBlocks = new Map<number, { toolCallId: string; name: string; inputJson: string }>();

      log(`  streaming from Anthropic  messageId=${messageId}`);
      const anthropicTools = agUiToolsToAnthropic(tools);
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: anthropicMessages,
        ...(anthropicTools.length > 0 && { tools: anthropicTools }),
      });

      send({ type: EventType.STEP_STARTED, runId, threadId, stepName: messageId });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            send({ type: EventType.TEXT_MESSAGE_START, runId, threadId, messageId, role: 'assistant' });
            textStarted = true;
          } else if (event.content_block.type === 'tool_use') {
            const toolCallId = crypto.randomUUID();
            toolBlocks.set(event.index, { toolCallId, name: event.content_block.name, inputJson: '' });
            send({ type: EventType.TOOL_CALL_START, runId, threadId, messageId, toolCallId, toolCallName: event.content_block.name });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            send({ type: EventType.TEXT_MESSAGE_CONTENT, runId, threadId, messageId, delta: event.delta.text });
          } else if (event.delta.type === 'input_json_delta') {
            const block = toolBlocks.get(event.index);
            if (block) {
              block.inputJson += event.delta.partial_json;
              send({ type: EventType.TOOL_CALL_ARGS, runId, threadId, messageId, toolCallId: block.toolCallId, delta: event.delta.partial_json });
            }
          }
        } else if (event.type === 'content_block_stop') {
          if (textStarted) {
            send({ type: EventType.TEXT_MESSAGE_END, runId, threadId, messageId });
            textStarted = false;
          } else {
            const block = toolBlocks.get((event as { type: 'content_block_stop'; index: number }).index);
            if (block) {
              log(`    tool_call_end: ${block.name}(${block.inputJson})`);
              send({ type: EventType.TOOL_CALL_END, runId, threadId, messageId, toolCallId: block.toolCallId });
            }
          }
        }
      }

      const finalMsg = await stream.finalMessage();
      log(`  stop_reason=${finalMsg.stop_reason}  input_tokens=${finalMsg.usage.input_tokens}  output_tokens=${finalMsg.usage.output_tokens}`);

      send({ type: EventType.STEP_FINISHED, runId, threadId, stepName: messageId });
      send({ type: EventType.RUN_FINISHED, runId, threadId, outcome: { type: 'success' } });
    } catch (err) {
      log(`  ERROR: ${err}`);
      send({ type: EventType.RUN_ERROR, runId, threadId, message: String(err) });
    }

    log('  connection closed');
    res.end();
  };
}
