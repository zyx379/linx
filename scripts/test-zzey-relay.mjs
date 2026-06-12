/** 一次性 zzey relay 探活：query_log 经 linx */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyLinxProjectEnv, loadZoeHisEnv, resolveZoeHisMcpHome, loadProjectsFile } from '../mcp/config.mjs';
import { installFetchPatch } from '../mcp/fetch-patch.mjs';

process.env.ZOE_PROJECT_CODE = process.env.ZOE_PROJECT_CODE || 'zzey';

const cfg = loadProjectsFile();
const home = resolveZoeHisMcpHome(cfg);
loadZoeHisEnv(home);
applyLinxProjectEnv();
installFetchPatch();

const { queryLog } = await import(pathToFileURL(join(home, 'dist/tools/query-log.js')).href);
const traceId = process.argv[2] || `zzey-probe-${Date.now()}`;
console.log('project: zzey, traceId:', traceId);
const r = await queryLog({ traceId });
console.log(JSON.stringify(r, null, 2));
process.exit(r.success ? 0 : 1);
