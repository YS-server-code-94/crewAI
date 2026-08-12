/**
 * CrewAI API Gateway - Cloudflare Worker
 * 
 * This worker serves as an edge API gateway for the CrewAI Python backend.
 * It handles:
 * - Request routing and validation
 * - Authentication and authorization
 * - Response caching
 * - Rate limiting
 * - CORS handling
 * - Request/response transformation
 */

import { Router } from 'itty-router';
import { corsMiddleware, authMiddleware, rateLimitMiddleware, loggingMiddleware } from './middleware';
import { health, proxy } from './handlers';
import type { WorkerEnv } from './types';

// Initialize router
const router = Router<WorkerEnv>();

// Global middleware
router.all('*', loggingMiddleware);
router.all('*', corsMiddleware);
router.all('*', authMiddleware);
router.all('*', rateLimitMiddleware);

// Health check endpoint
router.get('/health', health);
router.get('/health/ready', health);
router.get('/health/live', health);

// API routes - proxy to Python backend
router.all('/api/v1/*', proxy);
router.all('/api/crews/*', proxy);
router.all('/api/agents/*', proxy);
router.all('/api/tasks/*', proxy);
router.all('/api/flows/*', proxy);
router.all('/api/execute/*', proxy);

// Catch-all 404
router.all('*', () => {
  return new Response('Not Found', { status: 404 });
});

// Worker fetch handler
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const response = await router.handle(request, env, ctx);
    return response || new Response('Not Found', { status: 404 });
  },
  
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    // Cleanup expired sessions and cache
    ctx.waitUntil(
      (async () => {
        try {
          const cacheKeys = await env.CACHE.list();
          const now = Date.now();
          
          for (const { name } of cacheKeys.keys) {
            const value = await env.CACHE.getWithMetadata(name);
            if (value?.metadata?.expires && value.metadata.expires < now) {
              await env.CACHE.delete(name);
            }
          }
          
          console.log('[Cleanup] Expired cache entries removed');
        } catch (error) {
          console.error('[Cleanup] Error:', error);
        }
      })()
    );
  },
};

// Export for testing
export { router };
