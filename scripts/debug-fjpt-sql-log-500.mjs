#!/usr/bin/env node
/**
 * 复现 fjpt SQL 日志 msgid 查询，打印 linx relay 与上游完整响应（含 500 body）
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const MSGID = process.argv[2] || 'H35030200090202606120922374767';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const cfg = JSON.parse(readFileSync(join(ROOT, 'mcp/projects-linx.json'), 'utf-8'));
const fjpt = cfg.projects.fjpt;
const home = cfg.zoeHisMcpHome || 'D:\\code\\ZoeDevOps_space\\zoe-his-mcp';

process.env.ZOE_PROJECT_CODE = 'fjpt';
process.env.ZOE_fjpt_VIA_LINX = 'true';
process.env.ZOE_fjpt_API_BASE_URL = fjpt.apiBaseUrl;
process.env.ZOE_fjpt_API_LOG_PATH = fjpt.apiLogPath;
process.env.ZOE_fjpt_LOG_ARCHITECTURE = fjpt.logArchitecture;
process.env.LINX_BASE_URL = fjpt.linxBaseUrl;
process.env.LINX_API_KEY = fjpt.linxApiKey;

const { buildSqlLogQuery } = await import(
  pathToFileURL(join(home, 'dist/tools/log-utils.js')).href
);

const queryBody = buildSqlLogQuery({ msgid: MSGID, sqlType: 'INSERT', pageSize: '10' }, 'fjpt');

console.log('=== MCP 组装的 SQL 查询体 ===');
console.log(JSON.stringify(queryBody, null, 2));

// 1) 经 linx /relay/http 转发（与 MCP 一致）
const relayRes = await fetch(`${fjpt.linxBaseUrl}/relay/http`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${fjpt.linxApiKey}`,
  },
  body: JSON.stringify({
    project: 'fjpt',
    method: 'POST',
    path: fjpt.apiLogPath || '/log/search',
    headers: { 'Content-Type': 'application/json' },
    body: queryBody,
    authHeader: 'onelinkToken',
  }),
});

const relayText = await relayRes.text();
console.log('\n=== linx /relay/http 外层 ===');
console.log('status:', relayRes.status);
try {
  const relayJson = JSON.parse(relayText);
  console.log('relay body:', JSON.stringify(relayJson, null, 2));
  if (relayJson.body) {
    console.log('\n=== 上游日志平台响应（relay 内层）===');
    console.log('upstream status:', relayJson.status);
    const inner =
      typeof relayJson.body === 'string' ? relayJson.body : JSON.stringify(relayJson.body, null, 2);
    console.log(inner.slice(0, 3000));
  }
} catch {
  console.log(relayText.slice(0, 3000));
}

async function tryBody(label, body) {
  const res = await fetch(`${fjpt.linxBaseUrl}/relay/http`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fjpt.linxApiKey}`,
    },
    body: JSON.stringify({
      project: 'fjpt',
      method: 'POST',
      path: fjpt.apiLogPath || '/log/search',
      headers: { 'Content-Type': 'application/json' },
      body,
      authHeader: 'onelinkToken',
    }),
  });
  const j = await res.json();
  const up = j.body;
  const msg =
    typeof up === 'object'
      ? up.message || up.error || JSON.stringify(up).slice(0, 150)
      : String(up).slice(0, 150);
  console.log(`\n[变体] ${label} → upstream ${j.status}: ${msg}`);
}

const base = {
  pageSize: '10',
  pageNum: '1',
  indexvalue: 'log-sql*',
  logType: 'sql',
  serviceName: '',
  traceId: '',
  sqlId: '',
  logLevel: [],
  filterParamet: {
    sortColumns: 'timestamp',
    sortOrder: '',
    runTime: '',
    ipAndPort: '',
    stack: '',
    sql: { sqlType: 'INSERT', sqlFragment: MSGID },
  },
};

console.log('\n=== 请求体变体探测 ===');
await tryBody('ISO timestamp（MCP 默认）', {
  ...base,
  timestamp: { startDate: '2026-06-09T07:53:07.712Z', endDate: '2026-06-12T07:53:07.712Z' },
});
await tryBody('无 timestamp', base);
await tryBody('本地时间 timestamp', {
  ...base,
  timestamp: { startDate: '2026-06-09 00:00:00', endDate: '2026-06-12 23:59:59' },
});
