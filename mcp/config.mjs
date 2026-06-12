/**
 * 加载 projects-linx.json，按 ZOE_PROJECT_CODE 注入环境变量。
 * 直连 MCP（zoe-his-mcp）不经过此模块。
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const MCP_DIR = dirname(fileURLToPath(import.meta.url));

let cachedConfig = null;

function configPath() {
  if (process.env.ZOE_LINX_PROJECTS_FILE) {
    return process.env.ZOE_LINX_PROJECTS_FILE;
  }
  const local = join(MCP_DIR, 'projects-linx.json');
  if (existsSync(local)) return local;
  return join(MCP_DIR, 'projects-linx.example.json');
}

export function loadProjectsFile() {
  if (cachedConfig) return cachedConfig;
  const path = configPath();
  if (!existsSync(path)) {
    throw new Error(`缺少 linx 项目配置: ${path}（可复制 projects-linx.example.json）`);
  }
  cachedConfig = JSON.parse(readFileSync(path, 'utf-8'));
  return cachedConfig;
}

export function resolveZoeHisMcpHome(cfg) {
  return (
    process.env.ZOE_HIS_MCP_HOME ||
    cfg?.zoeHisMcpHome ||
    'D:\\code\\ZoeDevOps_space\\zoe-his-mcp'
  );
}

/** 加载 zoe-his-mcp 根目录 .env（GitLab token 等，get_code 需要） */
export function loadZoeHisEnv(home) {
  const envPath = join(home, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * 将当前 ZOE_PROJECT_CODE 对应的 linx 项目配置写入 process.env。
 * 必须在 import zoe-his-mcp 工具之前调用。
 */
export function applyLinxProjectEnv() {
  const cfg = loadProjectsFile();
  const code = process.env.ZOE_PROJECT_CODE;
  if (!code) {
    throw new Error('未设置 ZOE_PROJECT_CODE（linx MCP 必填，如 fjfd / zzey）');
  }

  const project = cfg.projects?.[code];
  if (!project) {
    const available = Object.keys(cfg.projects || {}).join(', ');
    throw new Error(`projects-linx.json 中无项目 "${code}"，可用: ${available || '（空）'}`);
  }
  if (!project.viaLinx) {
    throw new Error(`项目 ${code} 未标记 viaLinx，请改用直连 MCP zoe-his-mcp`);
  }

  const linxBaseUrl = process.env[`ZOE_${code}_LINX_BASE_URL`] || project.linxBaseUrl;
  const linxApiKey = process.env[`ZOE_${code}_LINX_API_KEY`] || project.linxApiKey || process.env.LINX_API_KEY;

  if (!linxBaseUrl) {
    throw new Error(`项目 ${code} 缺少 linxBaseUrl`);
  }
  if (!linxApiKey || linxApiKey.includes('PLACEHOLDER')) {
    throw new Error(
      `项目 ${code} 缺少 linxApiKey。从 ${linxBaseUrl}/admin/ 复制 API Key 写入 projects-linx.json`,
    );
  }

  process.env[`ZOE_${code}_VIA_LINX`] = 'true';
  process.env.LINX_BASE_URL = linxBaseUrl.replace(/\/$/, '');
  process.env.LINX_API_KEY = linxApiKey;

  // 覆盖 .env 中的直连配置：token/DB 由现场 linx 负责，本地不连内网 Redis/DB
  process.env[`ZOE_${code}_API_BASE_URL`] =
    project.apiBaseUrl || 'http://linx-relay-placeholder';
  for (const suffix of ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_DB', 'API_TOKEN']) {
    delete process.env[`ZOE_${code}_${suffix}`];
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(`ZOE_DB_${code}_`)) delete process.env[key];
  }
  if (project.apiLogPath) {
    process.env[`ZOE_${code}_API_LOG_PATH`] = project.apiLogPath;
  }
  if (project.logArchitecture) {
    process.env[`ZOE_${code}_LOG_ARCHITECTURE`] = project.logArchitecture;
  }

  return { code, linxBaseUrl: process.env.LINX_BASE_URL, linxApiKey, project, cfg };
}

export function getActiveLinxConnection() {
  const code = process.env.ZOE_PROJECT_CODE;
  if (!code) throw new Error('未设置 ZOE_PROJECT_CODE');
  return {
    projectCode: code,
    linxBaseUrl: (process.env.LINX_BASE_URL || '').replace(/\/$/, ''),
    linxApiKey: process.env.LINX_API_KEY || '',
  };
}

export function isViaLinxActive() {
  const code = process.env.ZOE_PROJECT_CODE;
  return code && process.env[`ZOE_${code}_VIA_LINX`] === 'true';
}

/** 是否应经 linx relay 转发此 fetch URL（日志平台占位 host） */
export function shouldRelayFetchUrl(urlString) {
  if (!isViaLinxActive()) return false;
  try {
    const u = new URL(urlString);
    if (u.hostname === 'linx-relay-placeholder') return true;
    const code = process.env.ZOE_PROJECT_CODE;
    const configured = process.env[`ZOE_${code}_API_BASE_URL`];
    if (configured) {
      const base = new URL(configured);
      if (u.hostname === base.hostname) return true;
    }
  } catch {
    return false;
  }
  return false;
}
