#!/usr/bin/env node
/** 验证莆田 fjpt msgid SQL 查询组包（修复后应 200 命中） */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { applyLinxProjectEnv, loadProjectsFile, resolveZoeHisMcpHome } from '../mcp/config.mjs';
import { installFetchPatch } from '../mcp/fetch-patch.mjs';

const MSGID = process.argv[2] || 'H35030200090202606120922374767';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

process.env.ZOE_PROJECT_CODE = 'fjpt';
applyLinxProjectEnv();
installFetchPatch();

const cfg = loadProjectsFile();
const home = resolveZoeHisMcpHome(cfg);
const { buildSqlLogQuery } = await import(
  pathToFileURL(join(home, 'dist/tools/log-utils.js')).href
);
const { querySqlLog } = await import(
  pathToFileURL(join(home, 'dist/tools/query-sql-log.js')).href
);

const body = buildSqlLogQuery({ msgid: MSGID, sqlType: 'INSERT', pageSize: '10' }, 'fjpt');
console.log('=== buildSqlLogQuery(fjpt) ===');
console.log(JSON.stringify(body, null, 2));

const hasOnelinkFilter = body.filterParamet?.searchType === '2';
const hasLegacyTs = !!body.timestamp;
if (!hasOnelinkFilter || hasLegacyTs) {
  console.error('\n[FAIL] 期望 onelink filter、无 timestamp');
  process.exit(1);
}

const result = await querySqlLog({ msgid: MSGID, sqlType: 'INSERT', pageSize: '10' });
if (!result.success) {
  console.error('\n[FAIL] querySqlLog:', result.error);
  process.exit(1);
}

console.log('\n[OK] traceId:', result.data?.traceId);
console.log('hits:', result.data?.totalCount);
