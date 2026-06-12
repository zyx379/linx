/**
 * 调用现场 linx relay 端点（/relay/http、/relay/db、/health）。
 */
import { getActiveLinxConnection } from './config.mjs';

async function relayRequest(path, body) {
  const { linxBaseUrl, linxApiKey, projectCode } = getActiveLinxConnection();
  if (!linxBaseUrl || !linxApiKey) {
    throw new Error('LINX_BASE_URL / LINX_API_KEY 未配置');
  }

  const res = await fetch(`${linxBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${linxApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/** GET /health（免认证） */
export async function linxHealth() {
  const { linxBaseUrl } = getActiveLinxConnection();
  const res = await fetch(`${linxBaseUrl}/health`, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function relayHttp({ method, path, headers, body, authHeader }) {
  const { projectCode } = getActiveLinxConnection();
  return relayRequest('/relay/http', {
    project: projectCode,
    method,
    path,
    headers,
    body,
    authHeader,
  });
}

export async function relayDb({ sql, maxRows, timeoutMs }) {
  const { projectCode } = getActiveLinxConnection();
  return relayRequest('/relay/db', {
    project: projectCode,
    sql,
    maxRows,
    timeoutMs,
  });
}
