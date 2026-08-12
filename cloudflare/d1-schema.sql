-- D1 Database schema for CrewAI
-- Initialize with: wrangler d1 execute crewai-main --file cloudflare/d1-schema.sql

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_key_timestamp (api_key, timestamp)
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes TEXT DEFAULT 'read,write',
  rate_limit INTEGER DEFAULT 1000,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  INDEX idx_key (key),
  INDEX idx_user_id (user_id)
);

-- Crew execution logs
CREATE TABLE IF NOT EXISTS crew_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_crew_id (crew_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Agent execution logs
CREATE TABLE IF NOT EXISTS agent_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  result TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (execution_id) REFERENCES crew_executions(id),
  INDEX idx_execution_id (execution_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_task_id (task_id),
  INDEX idx_status (status)
);

-- Cache invalidation log
CREATE TABLE IF NOT EXISTS cache_invalidations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_key (key),
  INDEX idx_created_at (created_at)
);

-- Cleanup old rate limit entries (older than 1 day)
DELETE FROM rate_limits WHERE timestamp < (strftime('%s', 'now') - 86400);

-- Create views for analytics
CREATE VIEW IF NOT EXISTS execution_stats AS
SELECT
  DATE(created_at) as execution_date,
  COUNT(*) as total_executions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(duration_ms) as avg_duration_ms
FROM crew_executions
GROUP BY DATE(created_at);

CREATE VIEW IF NOT EXISTS api_key_usage AS
SELECT
  ak.id,
  ak.key,
  ak.name,
  ak.user_id,
  COUNT(rl.id) as requests_last_minute,
  ak.rate_limit,
  ak.enabled,
  ak.last_used_at
FROM api_keys ak
LEFT JOIN rate_limits rl ON ak.key = rl.api_key 
  AND rl.timestamp > (strftime('%s', 'now') - 60)
GROUP BY ak.id;
