// 端到端：模拟本地 zoe-his-mcp(via-linx) → linx → mock 内网
// 设置 via-linx 环境后，直接调用 zoe-his-mcp 的工具函数
import { pathToFileURL } from 'url';
import { join } from 'path';

const MCP = 'D:\\code\\zoe_debug_app\\zoe-his-mcp\\dist';

// —— 本地 zoe-his-mcp 的 via-linx 配置 ——
process.env.ZOE_PROJECT_CODE = 'demo';
process.env.ZOE_demo_VIA_LINX = 'true';
process.env.ZOE_demo_API_BASE_URL = 'http://内网-占位:9099'; // 仅过 guard，真实地址在 linx
process.env.ZOE_demo_API_LOG_PATH = '/log/search';
process.env.ZOE_DB_demo_TYPE = 'oracle';
process.env.LINX_BASE_URL = 'http://127.0.0.1:8080';
process.env.LINX_API_KEY = 'testkey123';

const imp = (f) => import(pathToFileURL(join(MCP, f)).href);

const { queryLog } = await imp('tools/query-log.js');
const { queryBusinessData } = await imp('tools/query-business-data.js');

console.log('\n===== 1) query_log via linx (HTTP relay) =====');
const r1 = await queryLog({ traceId: 'T1' });
console.log(JSON.stringify(r1, null, 2));

console.log('\n===== 2) query_business_data via linx (DB relay, 预期 501 无驱动) =====');
const r2 = await queryBusinessData({ sql: 'SELECT 1 FROM DUAL', description: '探测 DB relay 路由' });
console.log(JSON.stringify(r2, null, 2));

console.log('\n===== 3) query_business_data 非 SELECT (预期本地拦截) =====');
const r3 = await queryBusinessData({ sql: 'DELETE FROM T', description: 'x' });
console.log(JSON.stringify(r3, null, 2));
