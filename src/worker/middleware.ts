/**
 * Middleware for CrewAI Worker
 */

import { WorkerEnv, RequestContext, AuthContext, RateLimitInfo } from './types';

/**
 * CORS Middleware
 */
export async function corsMiddleware(request: Request, env: WorkerEnv): Promise<void> {
  if (request.method === 'OPTIONS') {
    throw new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
}

/**
 * Logging Middleware
 */
export async function loggingMiddleware(request: Request, env: WorkerEnv): Promise<void> {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (env.LOG_LEVEL === 'debug') {
    console.log(`[${timestamp}] ${method} ${path}`);
  }
}

/**
 * Authentication Middleware
 * Validates API key or JWT token
 */
export async function authMiddleware(request: Request, env: WorkerEnv): Promise<void> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-API-Key');
  
  // Public endpoints
  const publicPaths = ['/health', '/health/ready', '/health/live'];
  const url = new URL(request.url);
  if (publicPaths.some(p => url.pathname.startsWith(p))) {
    return;
  }
  
  if (!authHeader) {
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: Missing authentication' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const auth = parseAuthHeader(authHeader);
    
    // Validate API key from config
    const validKeys = await env.CONFIG.get('valid_api_keys');
    if (!validKeys) {
      throw new Error('API key configuration not found');
    }
    
    const keys = JSON.parse(validKeys);
    if (!keys[auth.apiKey]) {
      throw new Error('Invalid API key');
    }
    
    // Attach auth context to request
    (request as any).auth = auth;
  } catch (error) {
    console.error('[Auth Error]', error);
    throw new Response(
      JSON.stringify({ error: 'Unauthorized: Invalid authentication' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Rate Limiting Middleware
 * Uses D1 for persistent rate limit tracking
 */
export async function rateLimitMiddleware(request: Request, env: WorkerEnv): Promise<void> {
  const url = new URL(request.url);
  
  // Public endpoints are not rate limited
  const publicPaths = ['/health', '/health/ready', '/health/live'];
  if (publicPaths.some(p => url.pathname.startsWith(p))) {
    return;
  }
  
  const apiKey = (request as any).auth?.apiKey || 'anonymous';
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60; // 1-minute window
  
  try {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM rate_limits 
       WHERE api_key = ? AND timestamp > ?`
    ).bind(apiKey, windowStart).all();
    
    const count = (results[0]?.count as number) || 0;
    const limit = 1000; // Requests per minute
    
    if (count >= limit) {
      throw new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    // Record this request
    await env.DB.prepare(
      `INSERT INTO rate_limits (api_key, timestamp) VALUES (?, ?)`
    ).bind(apiKey, now).run();
    
  } catch (error) {
    // If DB is unavailable, allow request but log
    console.error('[Rate Limit Error]', error);
  }
}

/**
 * Parse authentication header
 */
function parseAuthHeader(authHeader: string): AuthContext {
  if (authHeader.startsWith('Bearer ')) {
    return {
      userId: 'jwt',
      apiKey: authHeader.slice(7),
      scopes: ['read', 'write'],
      isValid: true,
    };
  }
  
  if (authHeader.startsWith('X-API-Key: ')) {
    return {
      userId: 'api-key',
      apiKey: authHeader.slice(11),
      scopes: ['read', 'write'],
      isValid: true,
    };
  }
  
  return {
    userId: 'unknown',
    apiKey: authHeader,
    scopes: [],
    isValid: false,
  };
}
