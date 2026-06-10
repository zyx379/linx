import { pathToFileURL } from 'url';
import { join } from 'path';

const MCP = process.env.ZOE_HIS_MCP_DIST || 'D:\\code\\zoe_debug_app\\zoe-his-mcp\\dist';
const traceId = process.argv[2] || '1780970559252H-4ae6bd4063a711f1bb74e5bbb8d2325e';

if (!process.env.LINX_API_KEY) {
  console.error('缺少 LINX_API_KEY');
  process.exit(1);
}

process.env.ZOE_PROJECT_CODE = 'fjfd';
process.env.ZOE_fjfd_VIA_LINX = 'true';
process.env.LINX_BASE_URL = process.env.LINX_BASE_URL || 'http://1.117.191.189:9081';
process.env.ZOE_fjfd_API_BASE_URL = 'http://linx-relay-placeholder';
process.env.ZOE_fjfd_API_LOG_PATH = '/log-manage-service/log/search';

const imp = (f) => import(pathToFileURL(join(MCP, f)).href);

async function run(name, fn) {
  console.log(`\n===== ${name} =====`);
  const r = await fn({ traceId });
  if (r.success) {
    const logs = r.data?.logs || r.data?.formatted || r.data;
    const count = r.data?.totalCount ?? (Array.isArray(logs) ? logs.length : '?');
    console.log('success, count:', count);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 4000));
  } else {
    console.log('fail:', r.error);
  }
}

const { queryLog } = await imp('tools/query-log.js');
const { querySqlLog } = await imp('tools/query-sql-log.js');
const { queryTraceLogs } = await imp('tools/query-trace-logs.js');

console.log('traceId:', traceId);
console.log('project: fjfd via', process.env.LINX_BASE_URL);

await run('query_log (onelink log-http*)', queryLog);
process.env.ZOE_fjfd_LOG_ARCHITECTURE = 'legacy';
await run('query_log (legacy log-req*)', queryLog);
delete process.env.ZOE_fjfd_LOG_ARCHITECTURE;
await run('query_sql_log', querySqlLog);
await run('query_trace_logs', queryTraceLogs);
