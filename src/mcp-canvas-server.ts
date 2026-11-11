/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Canvas MCP server — blank template for coding your own MCP server          ║
 * ║  Runs as Vite middleware at POST /mcp-canvas (JSON-RPC over HTTP)            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * HOW TO USE
 *  1. Add your tools to the TOOLS array below.
 *  2. Handle each tool call in the 'tools/call' case.
 *  3. In your lab, call fetch('/mcp-canvas', ...) the same way Mcp.lab.tsx
 *     calls fetch('/mcp').
 *
 * The three MCP methods you must implement:
 *   initialize          → return server capabilities
 *   tools/list          → return your TOOLS array
 *   tools/call          → execute the requested tool and return content[]
 */

import type { Connect } from 'vite';

// ── 1. Declare your tools ──────────────────────────────────────────────────────
const TOOLS: { name: string; description: string; inputSchema: object }[] = [
  // {
  //   name: 'my_tool',
  //   description: 'What this tool does.',
  //   inputSchema: {
  //     type: 'object',
  //     properties: {
  //       param: { type: 'string', description: 'An input parameter.' },
  //     },
  //     required: ['param'],
  //   },
  // },
];

// ── 2. Implement tool execution ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function callTool(name: string, _args: Record<string, unknown>): string {
  switch (name) {
    // case 'my_tool':
    //   return JSON.stringify({ result: 'hello from my_tool' });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── 3. JSON-RPC router (no changes needed below) ───────────────────────────────
function handleRequest(body: {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}) {
  const { id, method, params } = body;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'mcp-canvas', version: '1.0.0' },
        },
      };

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

    case 'tools/call': {
      const toolName = (params as { name: string; arguments?: Record<string, unknown> })?.name;
      const toolArgs =
        (params as { name: string; arguments?: Record<string, unknown> })?.arguments ?? {};
      try {
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: callTool(toolName, toolArgs) }] },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: String(err) },
        };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

export function mcpCanvasMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url !== '/mcp-canvas' || req.method !== 'POST') return next();

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const response = handleRequest(parsed);
        if (!response) {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
        );
      }
    });
  };
}
