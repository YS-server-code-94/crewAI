/**
 * Durable Objects for session management
 * Provides stateful session handling across requests
 */

import { WorkerEnv } from './types';

export class SessionManager {
  private state: DurableObjectState;
  private env: WorkerEnv;
  private sessions: Map<string, any> = new Map();

  constructor(state: DurableObjectState, env: WorkerEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/sessions/create' && request.method === 'POST') {
      return this.createSession(request);
    } else if (pathname.startsWith('/sessions/') && request.method === 'GET') {
      return this.getSession(url.pathname.split('/').pop() || '');
    } else if (pathname === '/sessions/cleanup' && request.method === 'POST') {
      return this.cleanup();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async createSession(request: Request): Promise<Response> {
    const data = await request.json() as Record<string, any>;
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const ttl = 3600000; // 1 hour

    const session = {
      id: sessionId,
      created: now,
      expires: now + ttl,
      data,
    };

    this.sessions.set(sessionId, session);
    await this.state.storage.put(sessionId, session);

    return new Response(JSON.stringify(session), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async getSession(sessionId: string): Promise<Response> {
    const session = await this.state.storage.get(sessionId);

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    if (session.expires < now) {
      await this.state.storage.delete(sessionId);
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async cleanup(): Promise<Response> {
    const list = await this.state.storage.list();
    const now = Date.now();
    let deleted = 0;

    for (const key of list.keys()) {
      const session = await this.state.storage.get(key);
      if (session && session.expires < now) {
        await this.state.storage.delete(key);
        deleted++;
      }
    }

    return new Response(JSON.stringify({ deleted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
