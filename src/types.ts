/**
 * linx 类型定义
 */

export type DbType = 'oracle' | 'dameng';

/** 单个项目的内网数据库连接配置（凭据只留现场） */
export interface ProjectDbConfig {
  type: DbType;
  host: string;
  port: number;
  serviceName?: string;
  sid?: string;
  schema?: string;
  username: string;
  /** 明文（运行时）。落地时加密，API 回显时掩码。 */
  password: string;
}

/** 项目的内网 Redis 配置（用于代取日志平台 token） */
export interface ProjectRedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/** 单个项目（医院/环境）配置 */
export interface ProjectConfig {
  code: string;
  name?: string;
  /** 日志平台基址，如 http://192.168.5.24:8081 */
  apiBaseUrl?: string;
  /** 日志查询路径，缺省取全局 ZOE_API_LOG_PATH */
  apiLogPath?: string;
  /** 日志平台静态 token（与 redis 二选一） */
  apiToken?: string;
  /** 自定义鉴权头名；缺省用 Authorization: Bearer */
  apiAuthHeader?: string;
  /** 内网 Redis（动态取 token） */
  redis?: ProjectRedisConfig;
  /** 内网数据库 */
  db?: ProjectDbConfig;
}

/** linx 整体配置 */
export interface LinxConfig {
  port: number;
  /** 对外 relay 鉴权 API Key */
  apiKey: string;
  /** 运维界面登录口令（持久化时存哈希） */
  adminPassword: string;
  /** 来源 IP 白名单，空=不限制 */
  ipWhitelist: string[];
  /** 公网出口 IP 探测源 */
  publicIpEcho: string;
  /** 运维界面是否仅本机可访问 */
  adminLocalOnly: boolean;
  /** 全局日志查询路径 */
  globalApiLogPath?: string;
  /** 项目表 code -> 配置 */
  projects: Record<string, ProjectConfig>;
}

/** /relay/http 入参（本地组装） */
export interface RelayHttpRequest {
  project: string;
  method?: string;
  /** 内网相对路径，缺省取项目 apiLogPath */
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** 由调用方指定 token 注入的头名（如 HIS 的 onelinkToken）；缺省取项目配置或 Authorization */
  authHeader?: string;
}

/** /relay/http 出参 */
export interface RelayHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** /relay/db 入参（本地组装 SQL） */
export interface RelayDbRequest {
  project: string;
  sql: string;
  /** 最大返回行数 */
  maxRows?: number;
  timeoutMs?: number;
}

/** /relay/db 出参 */
export interface RelayDbResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
}

/** 连接信息卡 */
export interface ConnectionCard {
  version: string;
  port: number;
  publicIp: string | null;
  localIps: string[];
  healthUrl: string | null;
  apiKeyMasked: string;
  projects: { code: string; name?: string }[];
}
