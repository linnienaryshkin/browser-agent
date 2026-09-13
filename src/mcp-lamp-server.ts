/**
 * MCP server — runs as Vite middleware at POST /mcp.
 * Implements Streamable HTTP transport (JSON-RPC over HTTP).
 */

import type { Connect } from 'vite';
import { execSync } from 'child_process';

const TOOLS = [
  {
    name: 'get_system_color_scheme',
    description: 'Get the OS-level color scheme preference. Returns "dark" or "light".',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

function getSystemColorScheme(): 'dark' | 'light' {
  try {
    const { platform } = process;

    if (platform === 'darwin') {
      // absent in light mode, set to "Dark" in dark mode
      const result = execSync('defaults read -g AppleInterfaceStyle 2>/dev/null', {
        encoding: 'utf8',
        timeout: 1000,
      }).trim();
      return result.toLowerCase() === 'dark' ? 'dark' : 'light';
    }

    if (platform === 'win32') {
      // 0 = dark apps, 1 = light apps
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
        { encoding: 'utf8', timeout: 1000 },
      );
      return result.includes('0x0') ? 'dark' : 'light';
    }

    if (platform === 'linux') {
      // Works on GNOME; other DEs may not support this key
      const result = execSync(
        'gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null',
        { encoding: 'utf8', timeout: 1000 },
      ).trim();
      return result.includes('dark') ? 'dark' : 'light';
    }
  } catch {
    // fall through to default
  }
  return 'light';
}

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

      if (toolName === 'get_system_color_scheme') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ scheme: getSystemColorScheme() }),
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
