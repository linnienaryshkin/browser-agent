/**
 * MCP server — runs as Vite middleware at POST /mcp.
 * Implements Streamable HTTP transport (JSON-RPC over HTTP).
 */

import type { Connect } from 'vite';
import { userInfo } from 'os';

const TOOLS = [
  {
    name: 'get_real_name',
    description: 'Get the real name of the current operating system user.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

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
          serverInfo: { name: 'smart-lamp', version: '1.0.0' },
        },
      };

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call': {
      const toolName = (params as { name: string })?.name;

      if (toolName === 'get_real_name') {
        const info = userInfo();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ username: info.username, homedir: info.homedir }),
              },
            ],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

export function mcpLampMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url !== '/mcp' || req.method !== 'POST') return next();

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
