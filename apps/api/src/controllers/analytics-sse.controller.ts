import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { SseConnectionManager } from '../sse/connection-manager.js';

const shortCodeParams = z.object({
  shortCode: z.string().min(1).max(64),
});

/**
 * SSE controller for real-time analytics streaming.
 * Sets proper SSE headers and registers the connection with the manager.
 */
export function createAnalyticsSseController(manager: SseConnectionManager) {
  return {
    async streamAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { shortCode } = shortCodeParams.parse(req.params);
        if (req.userId === undefined) throw new UnauthorizedError();
        await manager.assertOwned(shortCode, req.userId);

        // SSE headers — all must be set BEFORE flushHeaders()
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Content-Encoding', 'identity');
        res.flushHeaders();

        // Register connection — manager handles the rest
        const connId = manager.addConnection(shortCode, res, req.userId);
        if (connId === '') return; // 503 already sent

        // Cleanup on client disconnect
        req.on('close', () => {
          manager.removeConnection(connId);
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export type AnalyticsSseController = ReturnType<typeof createAnalyticsSseController>;
