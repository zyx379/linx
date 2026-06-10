/**
 * 内网 Redis 取日志平台 token（lazy 加载 ioredis）
 * 复用 zoe-his-mcp 逻辑：token 存于 key 名 ONELINK:TOKEN:<jwt>
 */
import type { ProjectRedisConfig } from './types.js';

// token 短缓存，避免每次 relay 都连 redis
const tokenCache = new Map<string, { token: string; at: number }>();
const TOKEN_TTL = 60_000;

async function loadIoredis(): Promise<unknown> {
  try {
    const spec = 'ioredis';
    const mod = (await import(spec)) as { Redis?: unknown; default?: unknown };
    return mod.Redis || mod.default || mod;
  } catch {
    return null;
  }
}

export async function getTokenFromRedis(
  code: string,
  config: ProjectRedisConfig,
): Promise<string | null> {
  const cached = tokenCache.get(code);
  if (cached && Date.now() - cached.at < TOKEN_TTL) return cached.token;

  const RedisCtor = (await loadIoredis()) as
    | (new (opts: Record<string, unknown>) => RedisLike)
    | null;
  if (!RedisCtor) {
    console.error('[linx] 未安装 ioredis，无法从 Redis 取 token');
    return null;
  }

  const redis = new RedisCtor({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db || 0,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });

  try {
    const prefix = process.env.ZOE_REDIS_TOKEN_PREFIX || 'ONELINK:TOKEN:';
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0 && keys[0].startsWith(prefix)) {
      const token = keys[0].substring(prefix.length);
      tokenCache.set(code, { token, at: Date.now() });
      return token;
    }
    const legacyPatterns = ['token:*', 'auth:*', 'user:token:*', 'login:token:*'];
    for (const pattern of legacyPatterns) {
      const legacyKeys = await redis.keys(pattern);
      if (legacyKeys.length > 0) {
        const value = await redis.get(legacyKeys[0]);
        if (value) {
          let token = value;
          try {
            const parsed = JSON.parse(value);
            token = parsed.token || parsed.accessToken || parsed.access_token || value;
          } catch {
            /* 原样使用 */
          }
          tokenCache.set(code, { token, at: Date.now() });
          return token;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('[linx] Redis 取 token 失败:', (error as Error).message);
    return null;
  } finally {
    try {
      await redis.quit();
    } catch {
      /* ignore */
    }
  }
}

interface RedisLike {
  keys(pattern: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}
