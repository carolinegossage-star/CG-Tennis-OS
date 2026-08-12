const { Pool } = require('pg');
const { createClient } = require('redis');
const logger = require('../utils/logger');

// ─── PostgreSQL Connection Pool ────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'tennis_coaching_os',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => logger.info('PostgreSQL client connected'));
pool.on('error', (err) => logger.error('PostgreSQL pool error', { error: err.message }));

// ─── Redis Client ──────────────────────────────────────────────────────────────
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
  // Limited retries with a short total timeout — without this, redis.connect()
  // below retries forever when no Redis server is reachable, which silently
  // hangs the entire backend startup (await connectRedis() never resolves).
  // Caching is optional (see the try/catch in every cache.* method below),
  // so a missing Redis server must fail fast, not block the app from starting.
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 3) return new Error('Redis unavailable after 3 attempts — giving up');
      return Math.min(retries * 100, 1000);
    },
    connectTimeout: 3000,
  },
});

redis.on('connect', () => logger.info('Redis client connected'));
redis.on('error', (err) => logger.warn('Redis error (non-fatal)', { error: err.message }));

const connectRedis = async () => {
  try {
    // A hard timeout as a second safety net, in case reconnectStrategy's
    // Error-return doesn't propagate the way a given redis client version
    // expects — this guarantees connectRedis() always resolves either way,
    // so server startup is never blocked by a missing Redis instance.
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timed out')), 4000)),
    ]);
  } catch (err) {
    logger.warn('Redis unavailable — continuing without cache', { error: err.message });
  }
};

// ─── Query Helper ──────────────────────────────────────────────────────────────
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { duration, query: text.substring(0, 100) });
    }
    return result;
  } catch (err) {
    logger.error('Database query error', { error: err.message, query: text.substring(0, 100) });
    throw err;
  }
};

// ─── Cache Helper ──────────────────────────────────────────────────────────────
const cache = {
  get: async (key) => {
    try {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  set: async (key, value, ttlSeconds = 300) => {
    try {
      await redis.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch { /* non-fatal */ }
  },
  del: async (key) => {
    try { await redis.del(key); } catch { /* non-fatal */ }
  },
  delPattern: async (pattern) => {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(keys);
    } catch { /* non-fatal */ }
  },
};

module.exports = { pool, redis, query, cache, connectRedis };
