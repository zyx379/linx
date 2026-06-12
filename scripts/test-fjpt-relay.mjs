#!/usr/bin/env node
/** 莆田 fjpt relay 探活：query_log 经 linx */
import { pathToFileURL } from 'url';
import { join } from 'path';
import { applyLinxProjectEnv, loadZoeHisEnv, resolveZoeHisMcpHome, loadProjectsFile } from '../mcp/config.mjs';
import { installFetchPatch } from '../mcp/fetch-patch.mjs';

process.env.ZOE_PROJECT_CODE = process.env.ZOE_PROJECT_CODE || 'fjpt';

const cfg = loadProjectsFile();
const home = resolveZoeHisMcpHome(cfg);
loadZoeHisEnv(home);
applyLinxProjectEnv();
installFetchPatch();

const { queryLog } = await import(pathToFileURL(join(home, 'dist/tools/query-log.js')).href);
const traceId = process.argv[2] || `fjpt-probe-${Date.now()}`;
console.log('project: fjpt, traceId:', traceId);
const r = await queryLog({ traceId });
console.log(JSON.stringify(r, null, 2));
const ok = r.success || (r.error && r.error.includes('未找到 traceId'));
console.log(ok ? '\n[OK] relay 可达' : '\n[FAIL] relay 异常');
process.exit(ok ? 0 : 1);
