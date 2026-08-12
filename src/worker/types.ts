/**
 * TypeScript type definitions for CrewAI Worker
 */

export interface WorkerEnv {
  // KV Namespaces
  CACHE: KVNamespace;
  CONFIG: KVNamespace;
  
  // D1 Database
  DB: D1Database;
  
  // R2 Bucket
  BUCKET: R2Bucket;
  
  // Durable Objects
  SESSIONS: DurableObjectNamespace;
  
  // Environment variables
  BACKEND_URL: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  
  // Configuration
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  ENVIRONMENT: 'development' | 'staging' | 'production';
  REQUEST_TIMEOUT: string;
  MAX_BODY_SIZE: string;
  ENABLE_CORS: string;
  
  // Analytics
  ANALYTICS_ENGINE?: AnalyticsEngine;
}

export interface AuthContext {
  userId: string;
  apiKey: string;
  scopes: string[];
  isValid: boolean;
}

export interface RequestContext {
  auth: AuthContext | null;
  requestId: string;
  timestamp: number;
}

export interface CacheMetadata {
  expires: number;
  ttl: number;
  tags?: string[];
}

export interface CrewAIRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface CrewAIResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  cached?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
}
