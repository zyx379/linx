/**
 * 配置加载：.env 解析 + 从 env 构造「种子」配置
 * env 结构兼容 zoe-his-mcp，便于现场迁移。
 */
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import type {
  LinxConfig,
  ProjectConfig,
  ProjectDbConfig,
  ProjectRedisConfig,
  DbType,
} from './types.js';

/** 可执行文件/项目根目录 */
export function appRoot(): string {
  const isPkg = (process as unknown as { pkg?: unknown }).pkg !== undefined;
  if (isPkg) return dirname(process.execPath);
  // esbuild CJS bundle 中 import.meta.url 不可用，回退 __dirname
  if (typeof __dirname !== 'undefined') {
    return join(__dirname, '..');
  }
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

/** 数据目录（配置/密钥落地） */
export function dataDir(): string {
  const fromEnv = process.env.LINX_DATA_DIR;
  const dir = fromEnv && fromEnv.trim()
    ? (isAbsolute(fromEnv) ? fromEnv : join(appRoot(), fromEnv))
    : join(appRoot(), 'linx-data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** 从 .env 文件加载到 process.env（不覆盖已存在的） */
export function loadEnvFile(): void {
  const candidates = [
    join(appRoot(), 'linx.env'),
    join(appRoot(), '.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    console.error(`[linx] 已加载环境变量: ${envPath}`);
    break;
  }
}

function parseDbConfig(code: string): ProjectDbConfig | undefined {
  const prefix = `ZOE_DB_${code}_`;
  const rawType = process.env[prefix + 'TYPE'];
  if (!rawType) return undefined;
  const type: DbType = rawType === 'oracle' ? 'oracle' : 'dameng';
  const defaultPort = type === 'oracle' ? 1521 : 5236;
  return {
    type,
    host: process.env[prefix + 'HOST'] || 'localhost',
    port: process.env[prefix + 'PORT'] ? parseInt(process.env[prefix + 'PORT']!, 10) : defaultPort,
    serviceName: process.env[prefix + 'SERVICE_NAME'] || undefined,
    sid: process.env[prefix + 'SID'] || undefined,
    schema: process.env[prefix + 'SCHEMA'] || undefined,
    username: process.env[prefix + 'USERNAME'] || '',
    password: process.env[prefix + 'PASSWORD'] || '',
  };
}

function parseRedisConfig(code: string): ProjectRedisConfig | undefined {
  const prefix = `ZOE_${code}_`;
  const host = process.env[prefix + 'REDIS_HOST'];
  if (!host) return undefined;
  return {
    host,
    port: process.env[prefix + 'REDIS_PORT'] ? parseInt(process.env[prefix + 'REDIS_PORT']!, 10) : 6379,
    password: process.env[prefix + 'REDIS_PASSWORD'] || undefined,
    db: process.env[prefix + 'REDIS_DB'] ? parseInt(process.env[prefix + 'REDIS_DB']!, 10) : 0,
  };
}

/** 扫描 env 中出现的所有项目 code（ZOE_<code>_API_BASE_URL 或 ZOE_DB_<code>_TYPE） */
function discoverProjectCodes(): string[] {
  const codes = new Set<string>();
  for (const key of Object.keys(process.env)) {
    let m = key.match(/^ZOE_DB_(.+)_TYPE$/);
    if (m) { codes.add(m[1]); continue; }
    m = key.match(/^ZOE_(.+)_API_BASE_URL$/);
    if (m) codes.add(m[1]);
  }
  return [...codes];
}

const PROJECT_NAME_MAP: Record<string, string> = {
  zzey: '漳州二院',
  zzdx: '郑州大学',
  test: '测试环境',
  seyy: '公司库',
  nasyy: '南安市医院',
  zzsyy: '漳州市医院',
};

/** 从 env 构造完整 linx 种子配置 */
export function buildSeedConfig(): LinxConfig {
  const projects: Record<string, ProjectConfig> = {};
  for (const code of discoverProjectCodes()) {
    const prefix = `ZOE_${code}_`;
    projects[code] = {
      code,
      name: process.env[prefix + 'NAME'] || PROJECT_NAME_MAP[code] || code,
      apiBaseUrl: process.env[prefix + 'API_BASE_URL'] || undefined,
      apiLogPath: process.env[prefix + 'API_LOG_PATH'] || undefined,
      apiToken: process.env[prefix + 'API_TOKEN'] || undefined,
      apiAuthHeader: process.env[prefix + 'API_AUTH_HEADER'] || undefined,
      redis: parseRedisConfig(code),
      db: parseDbConfig(code),
    };
  }

  return {
    port: process.env.LINX_PORT ? parseInt(process.env.LINX_PORT, 10) : 8080,
    apiKey: process.env.LINX_API_KEY || '',
    adminPassword: process.env.LINX_ADMIN_PASSWORD || '',
    ipWhitelist: (process.env.LINX_IP_WHITELIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    publicIpEcho: process.env.LINX_PUBLIC_IP_ECHO || 'https://api.ipify.org',
    adminLocalOnly: (process.env.LINX_ADMIN_LOCAL_ONLY || 'true').toLowerCase() !== 'false',
    globalApiLogPath: process.env.ZOE_API_LOG_PATH || '/log-manage-service/log/search',
    projects,
  };
}
