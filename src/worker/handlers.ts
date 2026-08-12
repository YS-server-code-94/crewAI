/**
 * Request handlers for CrewAI Worker
 */

import { WorkerEnv } from './types';

/**
 * Health check handler
 */
export async function health(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  
  if (url.pathname === '/health/ready') {
    // Readiness check - verify backend connectivity
    try {
      const backendUrl = env.BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (!response.ok) {
        return new Response(
          JSON.stringify({ status: 'not_ready', reason: 'Backend unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ status: 'not_ready', reason: 'Backend connection failed' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Proxy handler - forwards requests to Python backend
 */
export async function proxy(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const backendUrl = env.BACKEND_URL || 'http://localhost:8000';
  const timeout = parseInt(env.REQUEST_TIMEOUT) || 30000;
  
  // Check cache for GET requests
  if (request.method === 'GET') {
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await env.CACHE.get(url.pathname);
    
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
      });
    }
  }
  
  try {
    // Construct backend URL
    const backendFullUrl = `${backendUrl}${url.pathname}${url.search}`;
    
    // Prepare headers
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Request-ID', crypto.randomUUID());
    
    // Remove host header to avoid conflicts
    headers.delete('Host');
    
    // Prepare request body
    let body: any = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }
    
    // Make request to backend with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const backendResponse = await fetch(backendFullUrl, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // Handle response
    const responseBody = await backendResponse.text();
    const responseHeaders = new Headers(backendResponse.headers);
    
    // Cache successful GET responses
    if (request.method === 'GET' && backendResponse.status === 200) {
      const ttl = 300; // 5 minutes default
      await env.CACHE.put(
        url.pathname,
        responseBody,
        {
          expirationTtl: ttl,
          metadata: { expires: Date.now() + (ttl * 1000) },
        }
      );
      responseHeaders.set('X-Cache', 'MISS');
    }
    
    // Add standard headers
    responseHeaders.set('X-Backend-Response-Time', 'recorded');
    
    return new Response(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
    
  } catch (error) {
    if ((error as any).name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Request timeout' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    console.error('[Proxy Error]', error);
    return new Response(
      JSON.stringify({ error: 'Backend service unavailable' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
