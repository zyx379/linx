/**
 * HTTP relay：把本地组装好的请求转发到该项目内网日志平台 API。
 * linx 负责：拼 baseUrl、注入 token（静态或 Redis）、防 SSRF（仅限项目已配置主机）。
 */
import { getRuntimeConfig } from './config-store.js';
import { getTokenFromRedis } from './redis.js';
import type { RelayHttpRequest, RelayHttpResponse } from './types.js';

export class RelayError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/** 解析并校验目标 URL：path 必须是相对路径，最终主机必须等于项目 apiBaseUrl 主机 */
function resolveTargetUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  // 拒绝 path 内携带协议/主机（防 SSRF/开放代理）
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    throw new RelayError(400, 'path 不允许包含协议/主机，仅可为相对路径');
  }
  const target = new URL(path, base);
  if (target.host !== base.host || target.protocol !== base.protocol) {
    throw new RelayError(400, `目标主机 ${target.host} 与项目配置不一致，已拒绝`);
  }
  return target;
}

export async function relayHttp(reqBody: RelayHttpRequest): Promise<RelayHttpResponse> {
  const cfg = getRuntimeConfig();
  const project = cfg.projects[reqBody.project];
  if (!project) throw new RelayError(404, `未知项目: ${reqBody.project}`);
  if (!project.apiBaseUrl) throw new RelayError(400, `项目 ${reqBody.project} 未配置 apiBaseUrl`);

  const path = reqBody.path || project.apiLogPath || cfg.globalApiLogPath || '/';
  const target = resolveTargetUrl(project.apiBaseUrl, path);

  // 解析 token（静态优先，其次 Redis）
  let token = project.apiToken || '';
  if (!token && project.redis) {
    token = (await getTokenFromRedis(reqBody.project, project.redis)) || '';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(reqBody.headers || {}),
  };
  if (token) {
    const headerName = reqBody.authHeader || project.apiAuthHeader || 'Authorization';
    headers[headerName] =
      headerName.toLowerCase() === 'authorization' ? `Bearer ${token}` : token;
  }

  const method = (reqBody.method || 'POST').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && reqBody.body !== undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), reqBody.timeoutMs || 30000);
  try {
    // Node 18+ 自签证书容错：HIS 现场常用自签 HTTPS
    const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (target.protocol === 'https:') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const res = await fetch(target.toString(), {
      method,
      headers,
      body: hasBody
        ? typeof reqBody.body === 'string'
          ? reqBody.body
          : JSON.stringify(reqBody.body)
        : undefined,
      signal: controller.signal,
    });

    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;

    const text = await res.text();
    let body: unknown = text;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    return { status: res.status, headers: outHeaders, body };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new RelayError(504, '内网请求超时');
    }
    throw new RelayError(502, `内网请求失败: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
