/**
 * 配置持久化：linx-data/config.json
 * - 首次启动：以 env 种子初始化（自动生成 apiKey；运维口令默认 123）
 * - 之后以本文件为准，运维界面修改它
 * - 凭据(DB 密码/token)加密落地；对外 API 返回掩码
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { dataDir, buildSeedConfig } from './config.js';
import {
  encrypt,
  decrypt,
  isEncrypted,
  hashPassword,
  randomToken,
  mask,
} from './crypto.js';
import type { LinxConfig, ProjectConfig } from './types.js';

interface PersistShape extends Omit<LinxConfig, 'adminPassword'> {
  /** 持久化的是口令哈希 */
  adminPasswordHash: string;
}

let current: LinxConfig | null = null;
let adminPasswordHash = '';

function configPath(): string {
  return join(dataDir(), 'config.json');
}

/** 把凭据字段加密 */
function encryptSecrets(cfg: LinxConfig): void {
  const dir = dataDir();
  for (const p of Object.values(cfg.projects)) {
    if (p.apiToken) p.apiToken = encrypt(p.apiToken, dir);
    if (p.redis?.password) p.redis.password = encrypt(p.redis.password, dir);
    if (p.db?.password) p.db.password = encrypt(p.db.password, dir);
  }
}

/** 把凭据字段解密（用于运行时使用） */
function decryptSecrets(cfg: LinxConfig): LinxConfig {
  const dir = dataDir();
  const clone: LinxConfig = JSON.parse(JSON.stringify(cfg));
  for (const p of Object.values(clone.projects)) {
    if (p.apiToken && isEncrypted(p.apiToken)) p.apiToken = decrypt(p.apiToken, dir);
    if (p.redis?.password && isEncrypted(p.redis.password)) p.redis.password = decrypt(p.redis.password, dir);
    if (p.db?.password && isEncrypted(p.db.password)) p.db.password = decrypt(p.db.password, dir);
  }
  return clone;
}

function persist(cfg: LinxConfig): void {
  const toSave: PersistShape = {
    port: cfg.port,
    apiKey: cfg.apiKey,
    adminPasswordHash,
    ipWhitelist: cfg.ipWhitelist,
    publicIpEcho: cfg.publicIpEcho,
    adminLocalOnly: cfg.adminLocalOnly,
    globalApiLogPath: cfg.globalApiLogPath,
    projects: cfg.projects,
  };
  writeFileSync(configPath(), JSON.stringify(toSave, null, 2), { mode: 0o600 });
}

const DEFAULT_ADMIN_PASSWORD = '123';

/** 初始化：读盘或用 env 种子，返回是否首次生成了凭据（用于打印提示） */
export function initConfig(): { generatedApiKey?: string; isFirstInit?: boolean } {
  const generated: { generatedApiKey?: string; isFirstInit?: boolean } = {};
  const dir = dataDir();

  if (existsSync(configPath())) {
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as PersistShape;
    adminPasswordHash = raw.adminPasswordHash || '';
    current = {
      port: raw.port,
      apiKey: raw.apiKey,
      adminPassword: '',
      ipWhitelist: raw.ipWhitelist || [],
      publicIpEcho: raw.publicIpEcho,
      adminLocalOnly: raw.adminLocalOnly ?? true,
      globalApiLogPath: raw.globalApiLogPath,
      projects: raw.projects || {},
    };
    return generated;
  }

  // 首次：env 种子
  const seed = buildSeedConfig();
  if (!seed.apiKey) {
    seed.apiKey = randomToken(24);
    generated.generatedApiKey = seed.apiKey;
  }
  const adminPw = seed.adminPassword || DEFAULT_ADMIN_PASSWORD;
  adminPasswordHash = hashPassword(adminPw);
  seed.adminPassword = '';

  generated.isFirstInit = true;
  encryptSecrets(seed);
  void dir;
  current = seed;
  persist(seed);
  return generated;
}

/** 运行时配置（凭据已解密），用于 relay 实际调用 */
export function getRuntimeConfig(): LinxConfig {
  if (!current) throw new Error('config not initialized');
  return decryptSecrets(current);
}

/** 运行时取单项目（凭据已解密） */
export function getProject(code: string): ProjectConfig | undefined {
  return getRuntimeConfig().projects[code];
}

/** 原始配置（凭据仍加密），内部用 */
function getRawConfig(): LinxConfig {
  if (!current) throw new Error('config not initialized');
  return current;
}

export function getApiKey(): string {
  return getRawConfig().apiKey;
}

export function getAdminPasswordHash(): string {
  return adminPasswordHash;
}

export function getIpWhitelist(): string[] {
  return getRawConfig().ipWhitelist;
}

export function getPort(): number {
  return getRawConfig().port;
}

export function getPublicIpEcho(): string {
  return getRawConfig().publicIpEcho;
}

export function isAdminLocalOnly(): boolean {
  return getRawConfig().adminLocalOnly;
}

/** —— 运维界面写操作 —— */

export function resetApiKey(): string {
  const cfg = getRawConfig();
  cfg.apiKey = randomToken(24);
  persist(cfg);
  return cfg.apiKey;
}

export function setAdminPassword(newPassword: string): void {
  adminPasswordHash = hashPassword(newPassword);
  persist(getRawConfig());
}

export function setIpWhitelist(list: string[]): void {
  const cfg = getRawConfig();
  cfg.ipWhitelist = list.map((s) => s.trim()).filter(Boolean);
  persist(cfg);
}

/**
 * upsert 项目。密码类字段：传入 '' 或 undefined 表示「不修改」，保留原值；
 * 传入新明文则加密覆盖。
 */
export function upsertProject(input: ProjectConfig): void {
  const cfg = getRawConfig();
  const dir = dataDir();
  const existing = cfg.projects[input.code];
  const merged: ProjectConfig = {
    code: input.code,
    name: input.name,
    apiBaseUrl: input.apiBaseUrl,
    apiLogPath: input.apiLogPath,
    apiAuthHeader: input.apiAuthHeader,
    apiToken: existing?.apiToken,
    redis: input.redis
      ? { ...input.redis, password: existing?.redis?.password }
      : undefined,
    db: input.db
      ? { ...input.db, password: existing?.db?.password || '' }
      : undefined,
  };

  if (input.apiToken) merged.apiToken = encrypt(input.apiToken, dir);
  if (input.redis?.password && merged.redis) merged.redis.password = encrypt(input.redis.password, dir);
  if (input.db?.password && merged.db) merged.db.password = encrypt(input.db.password, dir);

  cfg.projects[input.code] = merged;
  persist(cfg);
}

export function deleteProject(code: string): void {
  const cfg = getRawConfig();
  delete cfg.projects[code];
  persist(cfg);
}

/** 供运维界面展示的安全视图（凭据掩码） */
export function getMaskedConfig(): unknown {
  const cfg = getRawConfig();
  const dir = dataDir();
  return {
    port: cfg.port,
    apiKey: cfg.apiKey,
    apiKeyMasked: mask(cfg.apiKey),
    ipWhitelist: cfg.ipWhitelist,
    publicIpEcho: cfg.publicIpEcho,
    adminLocalOnly: cfg.adminLocalOnly,
    globalApiLogPath: cfg.globalApiLogPath,
    projects: Object.values(cfg.projects).map((p) => ({
      code: p.code,
      name: p.name,
      apiBaseUrl: p.apiBaseUrl,
      apiLogPath: p.apiLogPath,
      apiAuthHeader: p.apiAuthHeader,
      hasApiToken: !!p.apiToken,
      redis: p.redis
        ? { host: p.redis.host, port: p.redis.port, db: p.redis.db, hasPassword: !!p.redis.password }
        : undefined,
      db: p.db
        ? {
            type: p.db.type,
            host: p.db.host,
            port: p.db.port,
            serviceName: p.db.serviceName,
            sid: p.db.sid,
            schema: p.db.schema,
            username: p.db.username,
            hasPassword: !!p.db.password,
          }
        : undefined,
    })),
  };
}

/** 解密后的明文（用于 testConnection 等内部场景），不要回传给前端 */
export function getProjectDecrypted(code: string): ProjectConfig | undefined {
  return getProject(code);
}

/** 凭据字段解密工具，供 token 缓存等使用 */
export { decrypt as decryptValue };
void join;
