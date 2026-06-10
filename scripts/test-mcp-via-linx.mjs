/**
 * 模拟 zoe-his-mcp 经 FRP 调 linx 查日志（需 LINX_API_KEY）
 *
 *   set LINX_API_KEY=xxx
 *   set ZOE_PROJECT_CODE=fdyy
 *   node scripts/test-mcp-via-linx.mjs [traceId]
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MCP = process.env.ZOE_HIS_MCP_DIST || 'D:\\code\\zoe_debug_app\\zoe-his-mcp\\dist';

process.env.ZOE_PROJECT_CODE = process.env.ZOE_PROJECT_CODE || 'fdyy';
process.env[`ZOE_${process.env.ZOE_PROJECT_CODE}_VIA_LINX`] = 'true';
process.env.LINX_BASE_URL = process.env.LINX_BASE_URL || 'http://1.117.191.189:9081';
process.env[`ZOE_${process.env.ZOE_PROJECT_CODE}_API_BASE_URL`] =
  process.env[`ZOE_${process.env.ZOE_PROJECT_CODE}_API_BASE_URL`] || 'http://linx-relay-placeholder';
process.env[`ZOE_${process.env.ZOE_PROJECT_CODE}_API_LOG_PATH`] =
  process.env[`ZOE_${process.env.ZOE_PROJECT_CODE}_API_LOG_PATH`] || '/log-manage-service/log/search';

if (!process.env.LINX_API_KEY) {
  console.error('缺少 LINX_API_KEY');
  process.exit(1);
}

const traceId = process.argv[2] || 'test-trace-id';
const imp = (f) => import(pathToFileURL(join(MCP, f)).href);

console.log('project:', process.env.ZOE_PROJECT_CODE);
console.log('linx   :', process.env.LINX_BASE_URL);
console.log('trace  :', traceId);

const { queryLog } = await imp('tools/query-log.js');
const result = await queryLog({ traceId });
console.log(JSON.stringify(result, null, 2));
