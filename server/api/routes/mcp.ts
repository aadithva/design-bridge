import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, type McpConfig } from '../../mcp-server.js';

/**
 * Each MCP session gets its own McpServer + Transport pair,
 * because McpServer.connect() can only be called once per instance.
 */
export function createMcpRouter(mcpConfig: McpConfig): Router {
  const router = Router();

  // Session management: map of sessionId → { transport, server }
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

  router.post('/', async (req: Request, res: Response) => {
    try {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // New session — create fresh server + transport pair
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      const mcpServer = createMcpServer(mcpConfig);

      transport.onclose = () => {
        const sid = (transport as any).sessionId;
        if (sid) sessions.delete(sid);
      };

      await mcpServer.connect(transport);

      // Store for session reuse
      const newSessionId = (transport as any).sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { transport });
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error('[mcp-http] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Handle GET for SSE stream (server-to-client notifications)
  router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Handle DELETE for session cleanup
  router.delete('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      await transport.close();
      sessions.delete(sessionId);
    }
    res.status(200).json({ status: 'closed' });
  });

  return router;
}
