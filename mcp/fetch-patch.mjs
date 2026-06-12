/**
 * 拦截 zoe-his-mcp 对内网日志平台的 fetch，改走 linx /relay/http。
 * 须在 import zoe-his-mcp 工具模块之前调用 installFetchPatch()。
 */
import { shouldRelayFetchUrl, isViaLinxActive } from './config.mjs';
import { relayHttp } from './linx-relay.mjs';

const PLACEHOLDER_HOST = 'linx-relay-placeholder';

function headersToRecord(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out = {};
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return { ...headers };
}

function parseBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function buildRelayResponse(relayOut) {
  const status = relayOut.status ?? 200;
  const payload =
    relayOut.body !== undefined && relayOut.body !== null
      ? typeof relayOut.body === 'string'
        ? relayOut.body
        : JSON.stringify(relayOut.body)
      : '';
  return new Response(payload, {
    status,
    headers: relayOut.headers || { 'content-type': 'application/json' },
  });
}

export function installFetchPatch() {
  if (!isViaLinxActive() || globalThis.__linxFetchPatched) return;
  globalThis.__linxFetchPatched = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init = {}) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!shouldRelayFetchUrl(url)) {
      return originalFetch(input, init);
    }

    const parsed = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const reqHeaders = headersToRecord(init.headers);
    const body = parseBody(init.body);

    // token 由现场 linx 注入；本地只告知鉴权头名
    const authHeader = reqHeaders.onelinkToken !== undefined ? 'onelinkToken' : undefined;
    const forwardHeaders = { ...reqHeaders };
    delete forwardHeaders.onelinkToken;
    delete forwardHeaders.authorization;
    delete forwardHeaders.Authorization;

    try {
      const relayOut = await relayHttp({
        method,
        path: parsed.pathname + parsed.search,
        headers: forwardHeaders,
        body,
        authHeader,
      });
      return buildRelayResponse(relayOut);
    } catch (error) {
      const status = error.status || 502;
      return new Response(
        JSON.stringify({ error: error.message, host: PLACEHOLDER_HOST }),
        { status, headers: { 'content-type': 'application/json' } },
      );
    }
  };

  console.error('[zoe-his-linx-mcp] fetch → linx /relay/http 已启用');
}
